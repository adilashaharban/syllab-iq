"""Two-agent orchestration for syllabus-aware question answering.

Architecture:
  - Retrieval is handled deterministically in Python (no tool-calling).
  - Agent 1 (Reasoning): Evaluates retrieved chunks and decides if context
    is sufficient. If not, it suggests a refined query for another retrieval
    pass. No tools are exposed to the model.
  - Agent 2 (Response): Takes the final curated context and formats a clean,
    student-facing answer. No tools are exposed to the model.

This design avoids tool-calling hallucination issues with models that have
unreliable function-calling support (e.g. Qwen via Groq).
"""

from __future__ import annotations

import asyncio
import os
import re
from dataclasses import dataclass
from typing import List, Optional

import psycopg2
from dotenv import load_dotenv
from psycopg2.extras import RealDictCursor
from pydantic import BaseModel, Field
from pydantic_ai import Agent

from config import (
    DB_NAME,
    DB_PASSWORD,
    DB_HOST,
    DB_PORT,
    DB_USER,
    TABLE_NAME,
    GROQ_API_KEY,
    GEMINI_API_KEY,
    VISION_LIMITER,
)
from settings import AIConfig
from transformer import get_embeddings as local_embed
from transformer import model as LOCAL_MODEL

load_dotenv()

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

LOCAL_EMBED_DIM = getattr(LOCAL_MODEL, "get_sentence_embedding_dimension", None)
if callable(LOCAL_EMBED_DIM):
    LOCAL_EMBED_DIM = LOCAL_EMBED_DIM()
else:
    LOCAL_EMBED_DIM = len(local_embed("dimension probe"))

EMBED_DIM = int(os.getenv("EMBED_DIM", str(LOCAL_EMBED_DIM)))

# Preserve legacy side-effect relied upon elsewhere.
os.environ["GROQ_API_KEY"] = GROQ_API_KEY

# Maximum number of retrieval iterations before forcing a stop.
MAX_RETRIEVAL_ITERATIONS = 3


# ---------------------------------------------------------------------------
# Database Connection
# ---------------------------------------------------------------------------


def get_db_connection():
    """Create a fresh psycopg2 connection to the pgvector database."""
    return psycopg2.connect(
        dbname=DB_NAME,
        user=DB_USER,
        password=DB_PASSWORD,
        host=DB_HOST,
        port=DB_PORT,
    )


# ---------------------------------------------------------------------------
# Pydantic Models
# ---------------------------------------------------------------------------


class RetrievedChunk(BaseModel):
    """A single chunk returned from hybrid search."""

    text: str
    filename: str
    chunk_index: int
    chunk_type: Optional[str] = "text"
    page_start: Optional[int] = None
    page_end: Optional[int] = None
    document_version_id: Optional[int] = None
    score: Optional[float] = 0.0
    extraction_method: Optional[str] = None
    image_path: Optional[str] = None
    metadata: Optional[dict] = None


class ReasoningVerdict(BaseModel):
    """Output of Agent 1 — the reasoning / evaluation agent."""

    is_sufficient: bool = Field(
        description="True if the retrieved context is enough to answer the question."
    )
    reasoning: str = Field(
        description="Brief explanation of why the context is or isn't sufficient."
    )
    refined_query: Optional[str] = Field(
        default=None,
        description=(
            "If is_sufficient is False, provide a refined search query to "
            "fetch better context in the next retrieval pass. "
            "Set to null if is_sufficient is True."
        ),
    )
    selected_chunk_indices: List[int] = Field(
        default_factory=list,
        description=(
            "Indices (0-based) of the chunks from the provided list that are "
            "most relevant to answering the question. Include all useful ones."
        ),
    )


class ImageAttachment(BaseModel):
    figure_id: str
    path: str
    page: int
    caption: str


class FinalAnswer(BaseModel):
    """Output of Agent 2 — the answer formatting agent."""

    answer: str = Field(description="The comprehensive student-facing answer.")
    confidence_note: str = Field(
        description="Short note on confidence based on syllabus coverage."
    )
    images: List[ImageAttachment] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Hybrid Search (deterministic Python — no tool-calling)
# ---------------------------------------------------------------------------


def _extract_query_keywords(query: str, max_keywords: int = 8) -> list[str]:
    """Pull simple keyword tokens from the query for keyword-overlap filtering."""
    tokens = re.findall(r"[A-Za-z]{3,}", query.lower())
    seen: set[str] = set()
    keywords: list[str] = []
    for tok in tokens:
        if tok in seen:
            continue
        seen.add(tok)
        keywords.append(tok)
        if len(keywords) >= max_keywords:
            break
    return keywords


def rag_search(
    conn,
    table_name: str,
    query: str,
    limit: int = 20,
    alpha: float = 0.7,
) -> list[RetrievedChunk]:
    """Run hybrid semantic + lexical search and return typed chunks.

    This function is called directly from Python orchestration code,
    never from a model tool-call.
    """
    query_embedding = local_embed(query)
    if hasattr(query_embedding, "tolist"):
        query_embedding = query_embedding.tolist()

    filter_keywords = _extract_query_keywords(query)

    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        try:
            params: list = [
                query_embedding,
                query,
                alpha,
                query_embedding,
                alpha,
                query,
                limit,
            ]

            sql = f"""
                SELECT
                    text,
                    filename,
                    chunk_index,
                    chunk_type,
                    (metadata->>'page_start')::integer AS page_start,
                    (metadata->>'page_end')::integer AS page_end,
                    metadata->>'extraction_method' AS extraction_method,
                    metadata->>'image_path' AS image_path,
                    document_version_id,
                    metadata,
                    1 - (embedding <=> %s::vector) AS semantic_score,
                    similarity(text, %s) AS keyword_score,
                    (
                        %s * (1 - (embedding <=> %s::vector))
                        + (1 - %s) * similarity(text, %s)
                    ) AS hybrid_score
                FROM {table_name}
                WHERE chunk_type = 'text'
                ORDER BY hybrid_score DESC
                LIMIT %s
            """
            
            # Print audit logs for query execution
            print(f"[AUDIT] Running SQL query on Table '{table_name}'")
            print(f"[AUDIT] SQL Query:\n{sql}")
            print(f"[AUDIT] Query Parameters: {params}")
            print(f"[AUDIT] Search Filters used: {filter_keywords}")

            cur.execute(sql, params)
            results = cur.fetchall()

            print(f"[AUDIT] Query Text: {query}")
            print(f"[AUDIT] Number of retrieved chunks: {len(results)}")
            print(f"[AUDIT] Top similarity scores: {[row.get('hybrid_score') for row in results]}")
            print(f"[AUDIT] Document filenames returned: {[row.get('filename') for row in results]}")

        except psycopg2.Error as exc:
            conn.rollback()
            sql_fallback = f"""
                    SELECT
                        text, filename, chunk_index, chunk_type,
                        (metadata->>'page_start')::integer AS page_start,
                        (metadata->>'page_end')::integer AS page_end,
                        metadata->>'extraction_method' AS extraction_method,
                        metadata->>'image_path' AS image_path,
                        document_version_id,
                        metadata,
                        1 - (embedding <=> %s::vector) AS semantic_score,
                        similarity(text, %s) AS keyword_score,
                        (
                            %s * (1 - (embedding <=> %s::vector))
                            + (1 - %s) * similarity(text, %s)
                        ) AS hybrid_score
                    FROM {table_name}
                    WHERE chunk_type = 'text'
                    ORDER BY hybrid_score DESC
                    LIMIT %s
                """
            print(f"[AUDIT] Fallback SQL Query:\n{sql_fallback}")
            cur.execute(sql_fallback,
                (
                    query_embedding,
                    query,
                    alpha,
                    query_embedding,
                    alpha,
                    query,
                    limit,
                ),
            )
            results = cur.fetchall()
            print(f"[AUDIT] Fallback retrieved chunks: {len(results)}")

    chunks = [
        RetrievedChunk(
            text=row["text"],
            filename=row["filename"],
            chunk_index=row["chunk_index"],
            chunk_type=row.get("chunk_type", "text"),
            page_start=row.get("page_start"),
            page_end=row.get("page_end"),
            document_version_id=row.get("document_version_id"),
            score=float(row.get("hybrid_score", 0.0)),
            extraction_method=row.get("extraction_method"),
            image_path=row.get("image_path"),
            metadata=row.get("metadata")
        )
        for row in results
    ]
    print(
        f"RAG Search — Retrieved {len(chunks)} chunks for query: "
        f"{query[:80]!r} (alpha={alpha}, limit={limit})"
    )
    return chunks


# ---------------------------------------------------------------------------
# Utility helpers
# ---------------------------------------------------------------------------


def _format_chunks_for_prompt(chunks: list[RetrievedChunk]) -> str:
    """Render a numbered list of chunks suitable for inclusion in a prompt."""
    if not chunks:
        return "(no chunks retrieved)"
    parts: list[str] = []
    for idx, c in enumerate(chunks):
        parts.append(
            f"[{idx}] (file: {c.filename}, chunk #{c.chunk_index}):\n{c.text.strip()}"
        )
    return "\n\n".join(parts)


def _truncate_text(text: str, max_tokens: int | None) -> str:
    """Rough word-level truncation."""
    if not max_tokens or max_tokens <= 0:
        return text
    words = text.split()
    if len(words) <= max_tokens:
        return text
    return " ".join(words[:max_tokens])


def _deduplicate_chunks(chunks: list[RetrievedChunk]) -> list[RetrievedChunk]:
    """Remove duplicate chunks based on (filename, chunk_index)."""
    seen: set[tuple[str, int]] = set()
    unique: list[RetrievedChunk] = []
    for c in chunks:
        key = (c.filename, c.chunk_index)
        if key not in seen:
            seen.add(key)
            unique.append(c)
    return unique


# ---------------------------------------------------------------------------
# Agent 1 — Reasoning / Evaluation (NO tools)
# ---------------------------------------------------------------------------

reasoning_agent = Agent(
    AIConfig.reasoning_model,
    output_type=ReasoningVerdict,
    system_prompt=(
        "You are a Retrieval Evaluation Agent.\n\n"
        "You will receive a student's question and a numbered list of text "
        "chunks retrieved from a syllabus database.\n\n"
        "Your ONLY job is to evaluate the chunks and respond with structured "
        "JSON matching the output schema.\n\n"
        "Rules:\n"
        "1. Decide if the chunks contain enough information to fully answer "
        "   the question. Set `is_sufficient` accordingly.\n"
        "2. In `reasoning`, briefly explain your judgment (1-2 sentences).\n"
        "3. If `is_sufficient` is False, provide a `refined_query` — a better "
        "   search phrase that might retrieve the missing information.\n"
        "4. In `selected_chunk_indices`, list the 0-based indices of chunks "
        "   that are actually relevant. Omit irrelevant ones.\n\n"
        "DO NOT call any tools. DO NOT generate an answer to the question. "
        "Just evaluate the context and return your verdict."
    ),
)


# ---------------------------------------------------------------------------
# Agent 2 — Answer Formatting (NO tools)
# ---------------------------------------------------------------------------

response_agent = Agent(
    AIConfig.model_name,
    # NOTE: No output_type here — plain text output avoids Groq's
    # tool-calling failures with the internal `final_result` function.
    system_prompt=(
        "You are the Answer Generation Agent for SyllabiQ, a university "
        "learning assistant.\n\n"
        "You will receive a student's question and supporting syllabus "
        "context chunks.\n\n"
        "IF THE CONTEXT IS INSUFFICIENT OR QUERY IS OUT OF SYLLABUS, JUST ANSWER IN ONE SENTENCE:\n"
        "\"The uploaded material does not contain enough information to answer this question.\"\n\n"
        "Formatting rules (CRITICAL — you are helping students learn):\n"
        "- Structure your answer using **numbered points** or **bullet points**.\n"
        "- Start with a brief 1-2 sentence overview, then break the explanation "
        "  into clear, digestible points.\n"
        "- Use **bold** for key terms and definitions.\n"
        "- Include short examples or analogies where helpful.\n"
        "- For multi-part topics, use sub-points (e.g. 1a, 1b).\n"
        "- End with a concise summary or takeaway if the answer is long.\n"
        "- Cite sources clearly! Always mention specific page numbers or figure/equation identifiers (e.g., \"(Page 12)\" or \"Figure on Page 12\") where the info was found.\n"
        "- If a visual figure is referenced in context with an Image Path, you MUST render it inside your answer at the relevant explanation point using the markdown syntax: `![Caption](/extracted_images/...)`. Always include the page number and its description in the caption.\n\n"
        "Content rules:\n"
        "- Write a precise, exam-ready answer using ONLY the provided context.\n"
        "- If the context is insufficient, say exactly: \"The uploaded material does not contain enough information to answer this question.\"\n"
        "- DO NOT hallucinate or invent information beyond the context.\n"
        "- DO NOT mention 'agents', 'tools', 'retrieval', 'chunks', or any "
        "  internal mechanics.\n"
        "- Just produce the answer as plain text. Do NOT call any tools or "
        "  functions.\n"
    ),
)


# ---------------------------------------------------------------------------
# Pipeline orchestration
# ---------------------------------------------------------------------------


class PipelineError(RuntimeError):
    """Raised when the pipeline cannot produce an answer."""


async def _run_with_retry(coro_factory, *, attempts: int = 3, delay: float = 1.0):
    """Generic async retry wrapper with exponential back-off."""
    for attempt in range(1, attempts + 1):
        try:
            return await coro_factory()
        except Exception as exc:
            if attempt == attempts:
                raise
            wait = delay * (2 ** (attempt - 1))
            print(
                f"Attempt {attempt}/{attempts} failed: {exc!r}. "
                f"Retrying in {wait:.1f}s..."
            )
            await asyncio.sleep(wait)


def get_associated_visuals_and_equations(conn, doc_ver_id, page_start, page_end):
    """Retrieve associated figures and equations on the same page/version to enrich LLM context."""
    if not doc_ver_id or page_start is None:
        return []
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            sql = """
                SELECT id, text, chunk_type, metadata, metadata->>'image_path' AS image_path, chunk_index
                FROM engineering_notes
                WHERE document_version_id = %s
                  AND chunk_type IN ('figure', 'equation', 'table', 'graph', 'circuit')
                  AND (metadata->>'page_start')::integer >= %s
                  AND (metadata->>'page_end')::integer <= %s
            """
            cur.execute(sql, (doc_ver_id, page_start, page_end))
            return cur.fetchall()
    except Exception as e:
        print(f"[AUDIT] Failed to fetch associated elements: {e}")
        return []


def generate_ondemand_caption(image_path: str) -> str:
    """Generate a detailed description using Gemini Vision for the specified image."""
    import os
    import io
    from PIL import Image
    import google.generativeai as genai

    local_path = os.path.join("frontend", "public", image_path.lstrip("/"))
    if not os.path.exists(local_path):
        print(f"[AUDIT] Image file not found for on-demand captioning: {local_path}")
        return "Visual representation description unavailable."

    if not GEMINI_API_KEY:
        print("[AUDIT] Gemini API key is missing. On-demand captioning unavailable.")
        return "Visual representation description unavailable."

    try:
        # Enforce rate-limiting and queueing
        VISION_LIMITER.wait_if_needed()
        
        genai.configure(api_key=GEMINI_API_KEY)
        with open(local_path, "rb") as f:
            img_data = f.read()

        img = Image.open(io.BytesIO(img_data))
        prompt = (
            "Describe this academic visual representation in detail. "
            "Explain any flowcharts, graphs, circuit diagrams, equations, or tables present in the image. "
            "Make it informative and context-rich for academic question-answering."
        )
        model = genai.GenerativeModel("gemini-3.1-flash-lite")
        response = model.generate_content([prompt, img])
        return response.text.strip()
    except Exception as e:
        err_msg = str(e).lower()
        if "429" in err_msg or "quota" in err_msg or "resource_exhausted" in err_msg or "exhausted" in err_msg:
            print(f"[AUDIT] Gemini API Quota Exhausted during on-demand captioning: {e}")
            return "Visual representation description placeholder (quota exhausted)."
        print(f"[AUDIT] Error generating on-demand caption: {e}")
        return "Visual representation description failed."


def update_cached_figure_caption(conn, pg_id, image_path, new_caption, page_start):
    """Update both PostgreSQL and SQLite dev.db cache with the new caption."""
    import json
    import sqlite3
    import time

    new_text = f"[FIGURE - Page {page_start}]: {new_caption}"

    # 1. Update PostgreSQL
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE engineering_notes
                SET text = %s,
                    metadata = jsonb_set(metadata, '{caption}', %s::jsonb)
                WHERE id = %s
                """,
                (new_text, json.dumps(new_caption), pg_id)
            )
            conn.commit()
            print(f"[AUDIT] Updated figure caption in PostgreSQL for ID {pg_id}")
    except Exception as e:
        print(f"[AUDIT] Failed to update figure caption in PostgreSQL: {e}")
        conn.rollback()

    # 2. Update SQLite (frontend/dev.db)
    retries = 5
    for attempt in range(retries):
        try:
            conn_sqlite = sqlite3.connect("frontend/dev.db", timeout=15)
            cur_sqlite = conn_sqlite.cursor()
            cur_sqlite.execute(
                "UPDATE Figure SET caption = ? WHERE imagePath = ?",
                (new_caption, image_path)
            )
            conn_sqlite.commit()
            conn_sqlite.close()
            print(f"[AUDIT] Updated figure caption in SQLite for path {image_path}")
            break
        except sqlite3.OperationalError as e:
            if "locked" in str(e).lower() and attempt < retries - 1:
                time.sleep(0.5 * (2 ** attempt))
                continue
            print(f"[AUDIT] SQLite caption update failed: {e}")
            break
        except Exception as exc:
            print(f"[AUDIT] SQLite caption update error: {exc}")
            break


async def async_generate_and_cache_caption(pg_id, image_path, page_start):
    """Asynchronously generate a caption and update databases in the background."""
    try:
        loop = asyncio.get_event_loop()
        new_cap = await loop.run_in_executor(None, generate_ondemand_caption, image_path)
        if new_cap and "failed" not in new_cap.lower() and "unavailable" not in new_cap.lower():
            # Open fresh connections for thread safety
            conn = get_db_connection()
            try:
                update_cached_figure_caption(conn, pg_id, image_path, new_cap, page_start)
            finally:
                conn.close()
    except Exception as e:
        print(f"[AUDIT] Async background captioning failed for {image_path}: {e}")


async def run_two_agent_pipeline(
    question: str,
    *,
    max_context_tokens: int | None = None,
) -> FinalAnswer:
    """Execute the full two-agent RAG pipeline with reranking, confidence score validation, and multimodal support."""
    conn = get_db_connection()

    try:
        # ---- Stage 1: Iterative retrieval with reasoning loop ----
        all_chunks: list[RetrievedChunk] = []
        current_query = question

        for iteration in range(1, MAX_RETRIEVAL_ITERATIONS + 1):
            print(
                f"\n--- Retrieval iteration {iteration}/{MAX_RETRIEVAL_ITERATIONS} ---"
            )

            # Retrieve top 20 candidate chunks for reranking
            new_chunks = rag_search(conn, TABLE_NAME, current_query, limit=20)
            all_chunks.extend(new_chunks)
            all_chunks = _deduplicate_chunks(all_chunks)

            # Rerank matches by hybrid score and keep the top 8 (prioritizing text chunks)
            all_chunks = sorted(all_chunks, key=lambda c: c.score, reverse=True)
            text_chunks = [c for c in all_chunks if c.chunk_type == "text"]
            non_text_chunks = [c for c in all_chunks if c.chunk_type != "text"]
            all_chunks = (text_chunks[:6] + non_text_chunks)[:8]

            # Enforce a confidence threshold check to identify out-of-syllabus queries early
            if all_chunks and all_chunks[0].score < 0.25:
                print(f"[AUDIT] Top candidate hybrid score {all_chunks[0].score:.3f} is below threshold 0.25. Out-of-syllabus fallback triggered.")
                return FinalAnswer(
                    answer="The uploaded material does not contain enough information to answer this question.",
                    confidence_note="Refused: query is out-of-syllabus (low confidence)."
                )

            # Build the evaluation prompt for Agent 1 (with linked attachments visible so Agent 1 sees them!)
            chunks_with_attachments = []
            for idx, c in enumerate(all_chunks):
                chunk_text = c.text.strip()
                attachments = get_associated_visuals_and_equations(conn, c.document_version_id, c.page_start, c.page_end)
                for att in attachments:
                    if att["chunk_type"] == "figure":
                        caption_clean = (att["text"] or "").replace("[FIGURE - Page ", "Figure on Page ").strip()
                        chunk_text += f"\n  * [RELATED VISUAL FIGURE AVAILABLE]: Caption: \"{caption_clean}\" | Image Path: \"{att['image_path']}\""
                    elif att["chunk_type"] == "equation":
                        chunk_text += f"\n  * [RELATED EQUATION AVAILABLE]: LaTeX: {att['text']}"
                chunks_with_attachments.append(RetrievedChunk(
                    text=chunk_text,
                    filename=c.filename,
                    chunk_index=c.chunk_index,
                    chunk_type=c.chunk_type,
                    page_start=c.page_start,
                    page_end=c.page_end,
                    document_version_id=c.document_version_id,
                    score=c.score,
                    extraction_method=c.extraction_method,
                    image_path=c.image_path
                ))

            chunks_text = _format_chunks_for_prompt(chunks_with_attachments)
            eval_prompt = (
                f"Student question:\n{question}\n\n"
                f"Retrieved chunks (total {len(all_chunks)}):\n{chunks_text}"
            )

            # Ask Agent 1 to evaluate
            async def reasoning_call():
                return await reasoning_agent.run(eval_prompt)

            try:
                reasoning_result = await _run_with_retry(reasoning_call, attempts=2)
                verdict: ReasoningVerdict = reasoning_result.output
            except Exception as exc:
                print(f"Reasoning agent failed: {exc!r}. Using all retrieved chunks.")
                verdict = ReasoningVerdict(
                    is_sufficient=True,
                    reasoning="Reasoning agent unavailable; proceeding with all chunks.",
                    selected_chunk_indices=list(range(len(all_chunks))),
                )

            print(
                f"Verdict: sufficient={verdict.is_sufficient}, "
                f"reasoning={verdict.reasoning!r}, "
                f"refined_query={verdict.refined_query!r}"
            )

            # If sufficient or last iteration, stop retrieving
            if verdict.is_sufficient or iteration == MAX_RETRIEVAL_ITERATIONS:
                break

            # Refine the query for the next pass
            if verdict.refined_query:
                current_query = verdict.refined_query
            else:
                break

        # ---- Select relevant chunks ----
        if verdict.selected_chunk_indices:
            selected = [
                all_chunks[i]
                for i in verdict.selected_chunk_indices
                if 0 <= i < len(all_chunks)
            ]
            if not selected:
                selected = all_chunks
        else:
            selected = all_chunks

        # Double check confidence on final selected chunks
        if not selected or (selected and selected[0].score < 0.25):
            return FinalAnswer(
                answer="The uploaded material does not contain enough information to answer this question.",
                confidence_note="Refused: query is out-of-syllabus (low confidence)."
            )

        # ---- Context Enrichment (Fetch associated figures/equations) ----
        context_parts = []
        provenance_records = []
        
        for idx, c in enumerate(selected):
            chunk_repr = f"[{idx}] (file: {c.filename}, pages: {c.page_start}-{c.page_end}, score: {c.score:.3f}, extraction: {c.extraction_method}):\n{c.text.strip()}"
            context_parts.append(chunk_repr)
            
            # Record retrieval provenance
            provenance_records.append({
                "chunk_index": c.chunk_index,
                "filename": c.filename,
                "page_start": c.page_start,
                "page_end": c.page_end,
                "score": c.score,
                "extraction_method": c.extraction_method,
            })

            # Fetch non-text page attachments (figures/equations)
            attachments = get_associated_visuals_and_equations(conn, c.document_version_id, c.page_start, c.page_end)
            for att in attachments:
                if att["chunk_type"] == "figure":
                    caption_text = att["text"] or ""
                    image_path = att["image_path"]
                    
                    # Check if the caption is a placeholder
                    is_placeholder = "Visual figure diagram illustration" in caption_text or "placeholder" in caption_text.lower() or len(caption_text.strip()) < 65
                    
                    if image_path and is_placeholder:
                        # Determine if user is explicitly asking about visual/figure content
                        is_explicit_query = any(kw in question.lower() for kw in ["explain", "describe", "what is shown", "flowchart", "diagram", "figure", "circuit", "graph", "schematic", "table"])
                        
                        if is_explicit_query:
                            print(f"[AUDIT] Synchronously generating caption for explicit image query: {image_path}")
                            new_cap = generate_ondemand_caption(image_path)
                            if new_cap and "failed" not in new_cap.lower() and "unavailable" not in new_cap.lower():
                                update_cached_figure_caption(conn, att["id"], image_path, new_cap, c.page_start)
                                caption_text = f"[FIGURE - Page {c.page_start}]: {new_cap}"
                        else:
                            print(f"[AUDIT] Relying on nearby text and placeholder description for standard query (no Gemini call): {image_path}")

                    caption_text_clean = caption_text.replace("[FIGURE - Page ", "Figure on Page ").strip()
                    att_repr = f"  * [RELATED VISUAL FIGURE]: Caption: \"{caption_text_clean}\" | Image Path: \"{att['image_path']}\" (Note to assistant: You can render this original image to the student using markdown syntax: `![{caption_text_clean}]({att['image_path']})`)"
                    context_parts.append(att_repr)
                elif att["chunk_type"] == "equation":
                    att_repr = f"  * [RELATED EQUATION]: LaTeX representation: {att['text']}"
                    context_parts.append(att_repr)

        context_text = "\n\n".join(context_parts)
        if max_context_tokens:
            context_text = _truncate_text(context_text, max_context_tokens)

        # Update response agent's system prompt instructions to handle figures and citations
        # If we have retrieved text context, treat it as sufficient for answer generation.
        # We never fail/refuse the query just because a figure wasn't found if text context exists.
        is_sufficient_for_answering = "sufficient" if (selected and len(selected) > 0) else "insufficient"
        answer_prompt = (
            f"Student question:\n{question}\n\n"
            f"Supporting syllabus context (with figures and equations):\n"
            f"{context_text if selected else '(No relevant context found.)'}\n\n"
            f"Context sufficiency: {is_sufficient_for_answering}\n"
        )

        async def response_call():
            return await response_agent.run(answer_prompt)

        try:
            response_result = await _run_with_retry(response_call, attempts=2)
            answer_text = str(response_result.output).strip()
        except Exception as exc:
            raise PipelineError(f"Response generation failed: {exc}") from exc

        # Build answer and append retrieval provenance metrics/references in confidence note
        confidence_note = f"Grounded in retrieved syllabus excerpts. Retrieved {len(selected)} chunks (avg score {sum(c.score for c in selected)/len(selected):.3f}). Pages: {list(set(f'{c.page_start}-{c.page_end}' for c in selected))}."

        images_list = []
        for c in selected:
            attachments = get_associated_visuals_and_equations(conn, c.document_version_id, c.page_start, c.page_end)
            for att in attachments:
                if att["chunk_type"] == "figure":
                    caption_text = att["text"] or ""
                    caption_clean = caption_text.replace(f"[FIGURE - Page {c.page_start}]: ", "").strip()
                    if not any(img.path == att["image_path"] for img in images_list):
                        images_list.append(ImageAttachment(
                            figure_id=f"fig_{att['id']}",
                            path=att["image_path"],
                            page=c.page_start,
                            caption=caption_clean
                        ))

        return FinalAnswer(answer=answer_text, confidence_note=confidence_note, images=images_list)

    except PipelineError:
        raise
    except Exception as exc:
        raise PipelineError(f"Pipeline failed: {exc}") from exc
    finally:
        conn.close()


async def rag_pipeline_stream(
    question: str,
    *,
    max_context_tokens: int | None = None,
):
    """Compatibility wrapper for the existing Streamlit consumer.

    Yields the final answer as a single string chunk.
    """
    try:
        final_answer = await run_two_agent_pipeline(
            question,
            max_context_tokens=max_context_tokens,
        )
        yield final_answer.answer
    except PipelineError as exc:
        yield f"SyllabiQ ran into an issue: {exc}"


__all__ = [
    "run_two_agent_pipeline",
    "rag_pipeline_stream",
    "reasoning_agent",
    "response_agent",
    "FinalAnswer",
    "ReasoningVerdict",
    "RetrievedChunk",
]
