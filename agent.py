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


class FinalAnswer(BaseModel):
    """Output of Agent 2 — the answer formatting agent."""

    answer: str = Field(description="The comprehensive student-facing answer.")
    confidence_note: str = Field(
        description="Short note on confidence based on syllabus coverage."
    )


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
    limit: int = 5,
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
            ]
            where_sql = ""
            params.append(limit)

            sql = f"""
                SELECT
                    text,
                    filename,
                    chunk_index,
                    chunk_type,
                    1 - (embedding <=> %s::vector) AS semantic_score,
                    similarity(text, %s) AS keyword_score,
                    (
                        %s * (1 - (embedding <=> %s::vector))
                        + (1 - %s) * similarity(text, %s)
                    ) AS hybrid_score
                FROM {table_name}
                {where_sql}
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
            # Fallback: if columns like 'keywords' don't exist, retry without filters.
            if getattr(exc, "pgcode", None) == "42703":
                conn.rollback()
                sql_fallback = f"""
                        SELECT
                            text, filename, chunk_index, chunk_type,
                            1 - (embedding <=> %s::vector) AS semantic_score,
                            similarity(text, %s) AS keyword_score,
                            (
                                %s * (1 - (embedding <=> %s::vector))
                                + (1 - %s) * similarity(text, %s)
                            ) AS hybrid_score
                        FROM {table_name}
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
            else:
                raise

    chunks = [
        RetrievedChunk(
            text=row["text"],
            filename=row["filename"],
            chunk_index=row["chunk_index"],
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
        "IF THE QUESTION IS OUT OF SYLLABUS JUST ANSWER IN ONE SENTENCE\n"
        "DO NOT EXPLAIN WHAT THE CONTEXT IS ABOUT JUST DECLINE TO ANSWER IN A SENTENCE\n"
        "Formatting rules (CRITICAL — you are helping students learn):\n"
        "- Structure your answer using **numbered points** or **bullet points**.\n"
        "- Start with a brief 1-2 sentence overview, then break the explanation "
        "  into clear, digestible points.\n"
        "- Use **bold** for key terms and definitions.\n"
        "- Include short examples or analogies where helpful.\n"
        "- For multi-part topics, use sub-points (e.g. 1a, 1b).\n"
        "- End with a concise summary or takeaway if the answer is long.\n\n"
        "Content rules:\n"
        "- Write a precise, exam-ready answer using ONLY the provided context.\n"
        "- If the context is insufficient, say so transparently.\n"
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


async def run_two_agent_pipeline(
    question: str,
    *,
    max_context_tokens: int | None = None,
) -> FinalAnswer:
    """Execute the full two-agent RAG pipeline.

    Steps:
      1. Retrieve chunks from pgvector (deterministic Python call).
      2. Ask Agent 1 to evaluate if context is sufficient.
      3. If Agent 1 says no, refine the query and retrieve again (up to
         MAX_RETRIEVAL_ITERATIONS).
      4. Pass final curated context to Agent 2 for answer generation.
    """
    conn = get_db_connection()

    try:
        # ---- Stage 1: Iterative retrieval with reasoning loop ----
        all_chunks: list[RetrievedChunk] = []
        current_query = question

        for iteration in range(1, MAX_RETRIEVAL_ITERATIONS + 1):
            print(
                f"\n--- Retrieval iteration {iteration}/{MAX_RETRIEVAL_ITERATIONS} ---"
            )

            # Always call rag_search (deterministic, no tool-calling)
            new_chunks = rag_search(conn, TABLE_NAME, current_query, limit=5)
            all_chunks.extend(new_chunks)
            all_chunks = _deduplicate_chunks(all_chunks)

            # Build the evaluation prompt for Agent 1
            chunks_text = _format_chunks_for_prompt(all_chunks)
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
                # If the reasoning agent fails, just use all chunks and proceed
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
                # No refined query suggested; stop
                break

        # ---- Select relevant chunks ----
        if verdict.selected_chunk_indices:
            selected = [
                all_chunks[i]
                for i in verdict.selected_chunk_indices
                if 0 <= i < len(all_chunks)
            ]
            # Fallback if indices were all out of range
            if not selected:
                selected = all_chunks
        else:
            selected = all_chunks

        # ---- Stage 2: Answer generation ----
        if not selected:
            return FinalAnswer(
                answer="I could not find any relevant information about this topic in the approved syllabus documents.",
                confidence_note="Topic not covered in the available syllabus."
            )

        context_text = _format_chunks_for_prompt(selected)
        if max_context_tokens:
            context_text = _truncate_text(context_text, max_context_tokens)

        answer_prompt = (
            f"Student question:\n{question}\n\n"
            f"Supporting syllabus context:\n"
            f"{context_text if selected else '(No relevant context found in the syllabus.)'}\n\n"
            f"Context sufficiency: {
                'sufficient' if verdict.is_sufficient else 'insufficient'
            }\n"
        )

        async def response_call():
            return await response_agent.run(answer_prompt)

        try:
            response_result = await _run_with_retry(response_call, attempts=2)
            # response_agent returns plain text (no structured output)
            answer_text = str(response_result.output).strip()
        except Exception as exc:
            raise PipelineError(f"Response generation failed: {exc}") from exc

        # Build the FinalAnswer ourselves from plain text + verdict
        confidence_note = (
            "Grounded in retrieved syllabus excerpts."
            if verdict.is_sufficient
            else "Topic not fully covered in the available syllabus."
        )

        return FinalAnswer(answer=answer_text, confidence_note=confidence_note)

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
