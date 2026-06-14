import json
import os
import time
import random
import sys
import re
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from functools import lru_cache

import psycopg2
from docling.chunking import HybridChunker
from docling.document_converter import DocumentConverter
from pgvector.psycopg2 import register_vector
from psycopg2.extras import execute_values, Json

from transformer import get_embeddings as local_embed, model as LOCAL_MODEL

from config import (
    DB_NAME,
    DB_USER,
    DB_PASSWORD,
    DB_HOST,
    DB_PORT,
    TABLE_NAME,
    GEMINI_API_KEY,
)


file = sys.argv[1] if len(sys.argv) > 1 else None


def _parse_cli_metadata(argv: list[str]) -> dict:
    """Parse key=value pairs from CLI into a simple metadata dict.

    Expected keys (all optional): source, subject, semester, department.
    """

    meta: dict[str, object] = {}
    for arg in argv:
        if "=" not in arg:
            continue
        key, value = arg.split("=", 1)
        key = key.strip().lower()
        value = value.strip()
        if not key:
            continue
        if key == "semester":
            try:
                meta[key] = int(value)
            except ValueError:
                continue
        else:
            meta[key] = value
    return meta


DOC_METADATA = _parse_cli_metadata(sys.argv[2:]) if len(sys.argv) > 2 else {}


MD_FILE_PATH = f"./markdowns/{file}"

EMBED_BACKEND = os.getenv("EMBED_BACKEND", "local").strip().lower()
if EMBED_BACKEND not in {"local", "gemini"}:
    print(f"Unknown EMBED_BACKEND '{EMBED_BACKEND}', defaulting to 'local'.")
    EMBED_BACKEND = "local"

LOCAL_EMBED_DIM = getattr(LOCAL_MODEL, "get_sentence_embedding_dimension", None)
if callable(LOCAL_EMBED_DIM):
    LOCAL_EMBED_DIM = LOCAL_EMBED_DIM()
else:
    probe_vector = local_embed("dimension probe")
    LOCAL_EMBED_DIM = len(probe_vector)

DEFAULT_EMBED_DIM = 1536 if EMBED_BACKEND == "gemini" else LOCAL_EMBED_DIM
EMBED_DIM = int(os.getenv("EMBED_DIM", str(DEFAULT_EMBED_DIM)))
EMBED_WORKERS = max(1, int(os.getenv("EMBED_WORKERS", "4")))
EMBED_QPS = float(os.getenv("EMBED_QPS", "2.0"))
EMBED_CACHE_SIZE = max(16, int(os.getenv("EMBED_CACHE_SIZE", "512")))
BATCH_SIZE = max(1, int(os.getenv("BATCH_SIZE", "25")))
STATS_FILE = os.getenv("CHUNK_STATS_PATH", "chunk_processing_stats.json")


EMBEDDINGS_ENABLED = True
genai = None
if EMBED_BACKEND == "gemini":
    try:
        if not GEMINI_API_KEY:
            raise ValueError("GEMINI_API_KEY is missing")
        import google.generativeai as genai  # type: ignore

        genai.configure(api_key=GEMINI_API_KEY)
    except Exception as exc:  # noqa: BLE001
        EMBEDDINGS_ENABLED = False
        print(f"Embedding API disabled: {exc}")
else:
    print(
        f"Using local SentenceTransformer embeddings ({
            LOCAL_EMBED_DIM
        }-dim) from transformer.py"
    )


conn = psycopg2.connect(
    dbname=DB_NAME,
    user=DB_USER,
    password=DB_PASSWORD,
    host=DB_HOST,
    port=DB_PORT,
)
conn.autocommit = True
cur = conn.cursor()

# Core extensions for vector and trigram search.
cur.execute(
    """
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
"""
)

register_vector(conn)

# Ensure table and columns exist (idempotent schema setup).
cur.execute(
    f"""
    CREATE TABLE IF NOT EXISTS {TABLE_NAME} (
        id SERIAL PRIMARY KEY,
        text TEXT NOT NULL,
        embedding vector({EMBED_DIM}),
        filename TEXT,
        chunk_index INTEGER,
        chunk_type TEXT,
        keywords TEXT[],
        metadata JSONB,
        source TEXT,
        subject TEXT,
        semester INT,
        department TEXT,
        chapter TEXT,
        section TEXT,
        document_version_id INTEGER,
        document_id INTEGER,
        checksum TEXT
    );
    """
)

cur.execute(
    f"""
    ALTER TABLE {TABLE_NAME}
        ADD COLUMN IF NOT EXISTS keywords TEXT[],
        ADD COLUMN IF NOT EXISTS metadata JSONB,
        ADD COLUMN IF NOT EXISTS source TEXT,
        ADD COLUMN IF NOT EXISTS subject TEXT,
        ADD COLUMN IF NOT EXISTS semester INT,
        ADD COLUMN IF NOT EXISTS department TEXT,
        ADD COLUMN IF NOT EXISTS chapter TEXT,
        ADD COLUMN IF NOT EXISTS section TEXT,
        ADD COLUMN IF NOT EXISTS document_version_id INTEGER,
        ADD COLUMN IF NOT EXISTS document_id INTEGER,
        ADD COLUMN IF NOT EXISTS checksum TEXT;
    """
)

cur.execute(
    f"""
    CREATE INDEX IF NOT EXISTS {TABLE_NAME}_embedding_ivfflat_idx
        ON {TABLE_NAME} USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

    CREATE INDEX IF NOT EXISTS {TABLE_NAME}_text_trgm_idx
        ON {TABLE_NAME} USING gin (text gin_trgm_ops);

    CREATE INDEX IF NOT EXISTS {TABLE_NAME}_keywords_gin_idx
        ON {TABLE_NAME} USING gin (keywords);

    CREATE INDEX IF NOT EXISTS {TABLE_NAME}_subject_idx
        ON {TABLE_NAME}(subject);

    CREATE INDEX IF NOT EXISTS {TABLE_NAME}_department_idx
        ON {TABLE_NAME}(department);

    CREATE INDEX IF NOT EXISTS {TABLE_NAME}_semester_idx
        ON {TABLE_NAME}(semester);

    CREATE INDEX IF NOT EXISTS {TABLE_NAME}_metadata_gin_idx
        ON {TABLE_NAME} USING gin (metadata);

    CREATE INDEX IF NOT EXISTS {TABLE_NAME}_document_version_id_idx
        ON {TABLE_NAME}(document_version_id);

    CREATE INDEX IF NOT EXISTS {TABLE_NAME}_checksum_idx
        ON {TABLE_NAME}(checksum);
    """
)

print(f"Table '{TABLE_NAME}' is ready.")


def retry(func, retries: int = 5, base_delay: float = 1.0):
    for attempt in range(retries):
        try:
            return func()
        except Exception as e:
            if attempt == retries - 1:
                raise

            delay = base_delay * (2**attempt) + random.uniform(0, 1)
            print(f"Retry {attempt + 1} after error: {e}")
            time.sleep(delay)


_request_slots = (
    threading.BoundedSemaphore(EMBED_WORKERS) if EMBED_BACKEND == "gemini" else None
)
_rate_lock = threading.Lock()
_last_embed_call = 0.0
_min_embed_interval = 1.0 / EMBED_QPS if EMBED_QPS > 0 else 0.0
ZERO_VECTOR = tuple(0.0 for _ in range(EMBED_DIM))
_local_model_lock = threading.Lock()


class EmbeddingUnavailable(Exception):
    """Raised when embeddings cannot be generated (e.g., API key issues)."""


def _handle_embedding_error(exc: Exception) -> bool:
    message = str(exc).lower()
    api_key_related = any(
        token in message
        for token in ("api key", "apikey", "unauthorized", "permission")
    )
    if api_key_related:
        global EMBEDDINGS_ENABLED
        EMBEDDINGS_ENABLED = False
        print(f"Embedding API unavailable, continuing without embeddings: {exc}")
        return True
    return False


def _respect_embed_rate():
    if EMBED_BACKEND != "gemini":
        return

    global _last_embed_call
    if _min_embed_interval <= 0:
        return

    while True:
        with _rate_lock:
            now = time.perf_counter()
            wait = _min_embed_interval - (now - _last_embed_call)
            if wait <= 0:
                _last_embed_call = now
                return
        time.sleep(min(wait, 0.1))


@lru_cache(maxsize=EMBED_CACHE_SIZE)
def _cached_embedding(text: str) -> tuple[float, ...]:
    def call():
        if EMBED_BACKEND == "local":
            with _local_model_lock:
                vector = local_embed(text)
            if hasattr(vector, "tolist"):
                vector = vector.tolist()
            return tuple(float(v) for v in vector)

        if not EMBEDDINGS_ENABLED or genai is None or _request_slots is None:
            raise EmbeddingUnavailable("Embeddings disabled")

        with _request_slots:
            _respect_embed_rate()
            try:
                result = genai.embed_content(  # type: ignore[call-arg]
                    model="gemini-embedding-001",
                    content=text,
                    output_dimensionality=EMBED_DIM,
                )
            except Exception as exc:  # noqa: BLE001
                if _handle_embedding_error(exc):
                    raise EmbeddingUnavailable from exc
                raise
            return tuple(result["embedding"])

    try:
        return retry(call)
    except EmbeddingUnavailable:
        return ZERO_VECTOR


def get_embedding(text: str) -> list[float]:
    return list(_cached_embedding(text))


_STOPWORDS = {
    "the",
    "and",
    "for",
    "with",
    "that",
    "this",
    "from",
    "into",
    "about",
    "over",
    "under",
    "above",
    "below",
    "have",
    "has",
    "had",
    "will",
    "would",
    "can",
    "could",
    "should",
    "shall",
    "may",
    "might",
    "not",
    "are",
    "is",
    "was",
    "were",
    "be",
    "been",
    "being",
    "of",
    "in",
    "on",
    "at",
    "by",
    "to",
    "as",
    "an",
    "a",
}


def extract_keywords(text: str, max_keywords: int = 12) -> list[str]:
    """Very simple keyword extractor for a chunk of text.

    Uses token frequency over alphabetic tokens, removes common stopwords,
    and returns the top `max_keywords` terms.
    """
    if not text or not isinstance(text, str):
        return ["general"]

    tokens = re.findall(r"[A-Za-z]{3,}", text.lower())
    counts: dict[str, int] = {}
    for tok in tokens:
        if tok in _STOPWORDS:
            continue
        counts[tok] = counts.get(tok, 0) + 1

    sorted_terms = sorted(counts.items(), key=lambda kv: kv[1], reverse=True)
    res = [term for term, _ in sorted_terms[:max_keywords]]
    if not res:
        fallback_tokens = re.findall(r"\w+", text.lower())
        res = [t for t in fallback_tokens if len(t) > 2][:3]
    if not res:
        res = ["general"]
    return res


def process_and_store_md(file_path: str, stop: bool = False, custom_metadata: dict = None):
    print(f"Processing: {file_path}")
    meta_src = custom_metadata if custom_metadata is not None else DOC_METADATA
    
    checksum = meta_src.get("checksum")
    doc_ver_id = meta_src.get("document_version_id")
    doc_id = meta_src.get("document_id")

    # Connect locally for thread-safety and explicit transactions
    local_conn = psycopg2.connect(
        dbname=DB_NAME,
        user=DB_USER,
        password=DB_PASSWORD,
        host=DB_HOST,
        port=DB_PORT,
    )
    local_conn.autocommit = False  # Explicit transaction
    register_vector(local_conn)
    local_conn.commit()  # Clear OID lookup transaction
    local_cur = local_conn.cursor()

    try:
        # Audit logs: connection details
        local_cur.execute("SELECT current_database();")
        curr_db = local_cur.fetchone()[0]
        print(f"[AUDIT] Connecting to database: {DB_NAME} (verified: {curr_db}) on host: {DB_HOST}, port: {DB_PORT}, user: {DB_USER}")
        print(f"[AUDIT] Writing to table: {TABLE_NAME}")
        print(f"[AUDIT] Connection string: dbname={DB_NAME} user={DB_USER} password=******** host={DB_HOST} port={DB_PORT}")

        # 1. Idempotency Check: if checksum exists, return existing count
        if checksum:
            local_cur.execute(f"SELECT COUNT(*) FROM {TABLE_NAME} WHERE checksum = %s", (checksum,))
            existing_count = local_cur.fetchone()[0]
            if existing_count > 0:
                print(f"Checksum {checksum} already indexed with {existing_count} chunks. Skipping ingestion (idempotent).")
                local_conn.close()
                return existing_count

        # 2. Cleanup: delete existing entries for this version to avoid duplicates on re-indexing
        if doc_ver_id:
            local_cur.execute(f"DELETE FROM {TABLE_NAME} WHERE document_version_id = %s", (doc_ver_id,))
            print(f"Cleaned up existing vectors for document_version_id={doc_ver_id} (if any).")

        doc = None
        chunk_iter = []

        try:
            converter = DocumentConverter()
            result = converter.convert(file_path)
            doc = result.document
            chunker = HybridChunker(max_tokens=512, overlap_tokens=80, merge_peers=True)
            chunk_iter = list(chunker.chunk(doc))
        except Exception as convert_exc:
            import traceback
            print(f"Docling conversion failed for {file_path}: {convert_exc}. Trying fallbacks...")
            traceback.print_exc()
            # Fallback 1: If PDF, try stripping hyperlinks and retry Docling
            if file_path.lower().endswith(".pdf"):
                try:
                    print("Fallback 1: Stripping hyperlinks and retrying Docling...")
                    from pathlib import Path
                    from lib import strip_hyperlinks
                    cleaned_pdf_path = strip_hyperlinks(Path(file_path))
                    converter = DocumentConverter()
                    result = converter.convert(str(cleaned_pdf_path))
                    doc = result.document
                    chunker = HybridChunker(max_tokens=512, overlap_tokens=80, merge_peers=True)
                    chunk_iter = list(chunker.chunk(doc))
                    print("Fallback 1 succeeded after stripping hyperlinks.")
                except Exception as fallback1_exc:
                    import traceback
                    print(f"Fallback 1 (hyperlink stripping) failed: {fallback1_exc}")
                    traceback.print_exc()
                    doc = None

            # Fallback 2: Fall back to pypdf page/paragraph parsing
            if doc is None:
                print("Fallback 2: Using pypdf to parse and chunk...")
                try:
                    from pypdf import PdfReader
                    reader = PdfReader(file_path)

                    # Mock chunk classes to match downstream expectations
                    class MockChunkMeta:
                        def __init__(self, headings=None):
                            self.headings = headings or []

                    class MockChunk:
                        def __init__(self, text, headings=None):
                            self.text = text
                            self.meta = MockChunkMeta(headings)

                    chunk_iter = []
                    for page_num, page in enumerate(reader.pages):
                        page_text = page.extract_text()
                        if page_text and page_text.strip():
                            # Split page into paragraphs to maintain reasonable chunk sizes
                            paragraphs = page_text.split("\n\n")
                            for p_idx, para in enumerate(paragraphs):
                                para = para.strip()
                                if para:
                                    chunk_iter.append(MockChunk(
                                        text=para,
                                        headings=[f"Page {page_num + 1}", f"Paragraph {p_idx + 1}"]
                                    ))
                    print(f"Fallback 2 (pypdf) completed with {len(chunk_iter)} chunks.")
                except Exception as fallback2_exc:
                    import traceback
                    print(f"Fallback 2 (pypdf) also failed: {fallback2_exc}")
                    traceback.print_exc()
                    raise convert_exc

        # Ingestion audits and validation checks
        total_text_length = sum(len(chunk.text) for chunk in chunk_iter) if chunk_iter else 0
        print(f"[AUDIT] Filename: {file_path}")
        print(f"[AUDIT] Parser selected: {'Docling' if doc is not None else 'pypdf fallback'}")
        print(f"[AUDIT] Extracted text length: {total_text_length}")
        
        num_pages = len(doc.pages) if (doc is not None and hasattr(doc, "pages") and doc.pages) else 1
        print(f"[AUDIT] Number of pages: {num_pages}")
        
        if total_text_length == 0:
            raise ValueError(f"Extracted text length is zero (empty content) for file: {file_path}")

        print(f"Total chunks for {file_path}: {len(chunk_iter)}")
        if len(chunk_iter) == 0:
            raise ValueError(f"Chunk count is zero. Parser failure for file: {file_path}")

        for idx, c in enumerate(chunk_iter):
            print(f"[AUDIT] Chunk {idx} length: {len(c.text)}, Preview: {c.text[:200]}")

        if stop:
            local_conn.close()
            return 0

        base = os.path.basename(file_path)
        if base.lower().endswith(".md") or base.lower().endswith(".pdf"):
            filename_for_db = base
        else:
            filename_for_db = f"{base}.md"

        stats = {
            "total_chunks": len(chunk_iter),
            "processed": 0,
            "pushed": 0,
            "failed": 0,
            "batches": 0,
            "embedding_backend": EMBED_BACKEND,
        }
        processed_records: list[dict[str, object]] = []
        pushed_batches: list[dict[str, object]] = []
        pushed_chunk_indexes: list[int] = []

        def prepare_entry(index: int, chunk):
            # Guard headings against NoneType
            headings = None
            if hasattr(chunk, "meta") and chunk.meta is not None:
                headings = getattr(chunk.meta, "headings", None)
            if headings is None:
                headings = []

            headers = [h for h in headings]
            hierarchy_path = " > ".join(headers) if headers else "Root"

            chapter = headers[0] if headers else None
            section = " > ".join(headers[1:]) if len(headers) > 1 else None

            content_type = "text"
            if "```" in chunk.text:
                content_type = "code"
            elif "|" in chunk.text and "-|" in chunk.text:
                content_type = "table"

            keywords = extract_keywords(chunk.text)
            embedding = get_embedding(chunk.text)

            # Validate embedding
            if not embedding:
                raise ValueError(f"Embedding generation returned None or empty for chunk {index}")
            if len(embedding) != EMBED_DIM:
                raise ValueError(f"Embedding dimension mismatch for chunk {index}: expected {EMBED_DIM}, got {len(embedding)}")
            print(f"[AUDIT] Generated embedding dimension: {len(embedding)}")

            metadata = {
                "hierarchy_path": hierarchy_path,
                "content_type": content_type,
                "source": meta_src.get("source"),
                "subject": meta_src.get("subject"),
                "semester": meta_src.get("semester"),
                "department": meta_src.get("department"),
                "chapter": chapter,
                "section": section,
            }

            entry = (
                chunk.text,
                embedding,
                filename_for_db,
                index,
                content_type,
                keywords,
                Json(metadata),
                meta_src.get("source"),
                meta_src.get("subject"),
                meta_src.get("semester"),
                meta_src.get("department"),
                chapter,
                section,
                doc_ver_id,
                doc_id,
                checksum,
            )

            # Detailed insert logging
            print(f"[AUDIT] Preparing chunk: document_version_id={doc_ver_id}, filename={filename_for_db}, checksum={checksum}, chunk_index={index}, keywords={keywords}, text_length={len(chunk.text)}")

            record = {
                "index": index,
                "content_type": content_type,
                "keywords": keywords,
                "chapter": chapter,
                "section": section,
                "timestamp": time.time(),
            }
            return index, entry, record

        batch_buffer: list[dict[str, object]] = []

        def flush_batch():
            nonlocal batch_buffer
            if not batch_buffer:
                return
            entries = [item["entry"] for item in batch_buffer]
            execute_values(
                local_cur,
                f"INSERT INTO {
                    TABLE_NAME
                } (text, embedding, filename, chunk_index, chunk_type, keywords, metadata, source, subject, semester, department, chapter, section, document_version_id, document_id, checksum) VALUES %s",
                entries,
            )
            stats["batches"] += 1
            stats["pushed"] += len(entries)
            pushed_chunk_indexes.extend(item["index"] for item in batch_buffer)
            pushed_batches.append(
                {
                    "batch_size": len(entries),
                    "last_chunk_index": batch_buffer[-1]["index"],
                    "timestamp": time.time(),
                }
            )
            batch_buffer = []

        with ThreadPoolExecutor(max_workers=EMBED_WORKERS) as executor:
            futures = [
                executor.submit(prepare_entry, i, chunk)
                for i, chunk in enumerate(chunk_iter)
            ]
            for future in as_completed(futures):
                index, entry, record = future.result()
                stats["processed"] += 1
                processed_records.append(record)
                batch_buffer.append({"index": index, "entry": entry})
                if len(batch_buffer) >= BATCH_SIZE:
                    flush_batch()

        flush_batch()

        # Explicit Transaction Commit
        print("[AUDIT] Committing database transaction...")
        local_conn.commit()
        print("[AUDIT] Commit succeeded: True")

        # Verify insertion on the same connection
        local_cur.execute(f"SELECT COUNT(*) FROM {TABLE_NAME};")
        final_count = local_cur.fetchone()[0]
        print(f"[AUDIT] Verification: Row count in {TABLE_NAME} immediately after insertion: {final_count}")

        # Log details required by user
        print(f"[AUDIT] Summary: chunks generated = {len(chunk_iter)}, inserts executed = {stats['pushed']}, final table row count = {final_count}")

        if stats["pushed"]:
            print(
                f"Successfully added {stats['pushed']} chunks to PostgreSQL in {
                    stats['batches']
                } batches."
            )
        else:
            print("No chunks generated.")

        processing_summary = {
            "file": file_path,
            "metadata": meta_src,
            "stats": stats,
            "processed_chunks": processed_records,
            "pushed_chunk_indexes": pushed_chunk_indexes,
            "pushed_batches": pushed_batches,
            "completed_at": time.time(),
        }
        try:
            with open(STATS_FILE, "w", encoding="utf-8") as stats_file:
                json.dump(processing_summary, stats_file, indent=2)
        except OSError as exc:  # noqa: PERF203
            print(f"Unable to write stats file {STATS_FILE}: {exc}")

        return stats["pushed"]

    except Exception as e:
        print(f"[AUDIT] Ingestion failed: {e}. Executing rollback...")
        try:
            local_conn.rollback()
            print("[AUDIT] Rollback executed successfully.")
        except Exception as rb_exc:
            print(f"[AUDIT] Rollback failed: {rb_exc}")
        raise e
    finally:
        local_cur.close()
        local_conn.close()



if __name__ == "__main__":
    print("EMBED_BACKEND:", EMBED_BACKEND)
    print("EMBED_DIM:", EMBED_DIM)
    process_and_store_md(MD_FILE_PATH)
