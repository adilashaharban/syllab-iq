import asyncio
import logging
import os
import time
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from agent import rag_pipeline_stream

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-7s | %(message)s",
)
logger = logging.getLogger("syllabiq")

MAX_CONTEXT_TOKENS = int(os.getenv("MAX_TOKEN", "6000"))
REQUEST_TIMEOUT = int(os.getenv("REQUEST_TIMEOUT", "120"))


# ---------------------------------------------------------------------------
# Lifespan
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("SyllabiQ FastAPI service starting up")
    yield
    logger.info("SyllabiQ FastAPI service shutting down")


# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------

app = FastAPI(
    title="SyllabiQ API",
    description="RAG-powered syllabus Q&A service",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Request / Response models
# ---------------------------------------------------------------------------

class ChatRequest(BaseModel):
    message: str = Field(
        ...,
        min_length=1,
        max_length=2000,
        description="The student's question",
    )


# ---------------------------------------------------------------------------
# Streaming generator
# ---------------------------------------------------------------------------

async def stream_response(question: str):
    """Wrap rag_pipeline_stream as an SSE generator."""
    try:
        async for chunk in rag_pipeline_stream(
            question,
            max_context_tokens=MAX_CONTEXT_TOKENS,
        ):
            import json
            yield f"data: {json.dumps(chunk)}\n\n"
        yield "data: [DONE]\n\n"
    except Exception as exc:
        logger.exception("Streaming error")
        yield f"data: [ERROR] {exc}\n\n"


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.get("/health")
async def health():
    return {"status": "ok", "service": "syllabiq"}


@app.post("/chat")
async def chat(req: ChatRequest):
    question = req.message.strip()
    if not question:
        raise HTTPException(status_code=422, detail="Message cannot be empty")

    logger.info("Chat request: %s", question[:80])

    try:
        return StreamingResponse(
            stream_response(question),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "X-Accel-Buffering": "no",
            },
        )
    except Exception as exc:
        logger.exception("Chat endpoint error")
        raise HTTPException(status_code=500, detail=str(exc))


@app.post("/chat/sync")
async def chat_sync(req: ChatRequest):
    """Non-streaming endpoint — returns the full answer as JSON."""
    question = req.message.strip()
    if not question:
        raise HTTPException(status_code=422, detail="Message cannot be empty")

    logger.info("Sync chat request: %s", question[:80])

    try:
        from agent import run_two_agent_pipeline
        final_answer = await run_two_agent_pipeline(
            question,
            max_context_tokens=MAX_CONTEXT_TOKENS,
        )
        return {
            "answer": final_answer.answer,
            "confidence_note": final_answer.confidence_note,
            "images": [
                {
                    "figure_id": img.figure_id,
                    "path": img.path,
                    "page": img.page,
                    "caption": img.caption
                }
                for img in final_answer.images
            ]
        }
    except Exception as exc:
        logger.exception("Sync chat error")
        raise HTTPException(status_code=500, detail=str(exc))


class IngestRequest(BaseModel):
    documentId: int
    documentVersionId: int
    checksum: str
    filePath: str
    originalFilename: str
    subjectName: str
    semesterNumber: int


@app.post("/ingest")
async def ingest_document(req: IngestRequest, background_tasks: BackgroundTasks):
    logger.info("Ingest request for document version %d (checksum: %s): %s", req.documentVersionId, req.checksum, req.filePath)
    
    # Resolve absolute path
    abs_path = os.path.abspath(req.filePath)
    if not os.path.exists(abs_path):
        # Fallback to checking relative to the workspace root
        abs_path = os.path.abspath(os.path.join(os.getcwd(), req.filePath))

    exists = os.path.exists(abs_path)
    file_size = os.path.getsize(abs_path) if exists else 0

    # Log required details
    logger.info("[AUDIT] Ingest File Audit:")
    logger.info("  - Document Version ID: %d", req.documentVersionId)
    logger.info("  - Checksum: %s", req.checksum)
    logger.info("  - Path: %s", abs_path)
    logger.info("  - Exists: %s", str(exists))
    logger.info("  - File Size: %d bytes", file_size)

    if not exists:
        raise HTTPException(status_code=400, detail=f"File not found: {req.filePath}")
    if file_size == 0:
        raise HTTPException(status_code=400, detail=f"File is empty (0 bytes): {req.filePath}")

    path_to_ingest = abs_path

    from chunk_and_push import process_and_store_md, EMBED_BACKEND
    meta = {
        "source": req.originalFilename,
        "subject": req.subjectName,
        "semester": req.semesterNumber,
        "department": "Engineering",
        "document_id": req.documentId,
        "document_version_id": req.documentVersionId,
        "checksum": req.checksum,
    }
    
    # Run in background to prevent HTTP timeouts
    def run_ingestion():
        try:
            logger.info("Starting background ingestion for version %d...", req.documentVersionId)
            process_and_store_md(path_to_ingest, False, meta)
            logger.info("Background ingestion completed for version %d.", req.documentVersionId)
        except Exception as bg_exc:
            logger.error("Background ingestion failed for version %d: %s", req.documentVersionId, bg_exc)

    background_tasks.add_task(run_ingestion)
    
    return {
        "success": True,
        "queued": True,
        "embeddingModel": EMBED_BACKEND,
        "error": None
    }


class RetrieveRequest(BaseModel):
    query: str
    limit: int = 5


@app.post("/retrieve")
async def retrieve_chunks(req: RetrieveRequest):
    logger.info("Retrieve request: %s", req.query[:80])
    try:
        from agent import get_db_connection, rag_search, TABLE_NAME
        loop = asyncio.get_running_loop()
        
        def run_db_query():
            conn = get_db_connection()
            try:
                logger.info("[AUDIT] Running retrieve query against PostgreSQL table: %s", TABLE_NAME)
                chunks = rag_search(conn, TABLE_NAME, req.query, limit=req.limit)
                logger.info(
                    "[AUDIT] Retrieved %d chunks for query text: %r",
                    len(chunks), req.query[:100]
                )
                return [
                    {
                        "text": c.text,
                        "filename": c.filename,
                        "chunk_index": c.chunk_index,
                        "metadata": c.metadata
                    }
                    for c in chunks
                ]
            finally:
                conn.close()

        results = await loop.run_in_executor(None, run_db_query)
        return {"results": results}
    except Exception as exc:
        logger.exception("Retrieval failed")
        raise HTTPException(status_code=500, detail=str(exc))

