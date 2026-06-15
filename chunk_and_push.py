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
    VISION_LIMITER,
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
        checksum TEXT,
        page_start INTEGER,
        page_end INTEGER
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
        ADD COLUMN IF NOT EXISTS checksum TEXT,
        ADD COLUMN IF NOT EXISTS page_start INTEGER,
        ADD COLUMN IF NOT EXISTS page_end INTEGER;
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


def semantic_chunker(text: str, max_words: int = 400, overlap_words: int = 80) -> list[str]:
    paragraphs = text.split("\n\n")
    chunks = []
    current_chunk = []
    current_word_count = 0

    for para in paragraphs:
        para = para.strip()
        if not para:
            continue
        para_words = para.split()
        if current_word_count + len(para_words) > max_words:
            if current_chunk:
                chunks.append("\n\n".join(current_chunk))
                # Overlap backtracking
                overlap_chunk = []
                overlap_count = 0
                for p in reversed(current_chunk):
                    p_words = p.split()
                    if overlap_count + len(p_words) <= overlap_words:
                        overlap_chunk.insert(0, p)
                        overlap_count += len(p_words)
                    else:
                        break
                current_chunk = overlap_chunk
                current_word_count = overlap_count
        current_chunk.append(para)
        current_word_count += len(para_words)

    if current_chunk:
        chunks.append("\n\n".join(current_chunk))
    return chunks


def describe_image(img_data: bytes, prompt: str) -> str:
    if not GEMINI_API_KEY:
        print("[AUDIT] Gemini API key is missing. Visual description unavailable.")
        return "Visual representation description unavailable."
    try:
        # Enforce rate-limiting and queueing
        VISION_LIMITER.wait_if_needed()
        
        import google.generativeai as genai
        from PIL import Image
        import io
        genai.configure(api_key=GEMINI_API_KEY)
        img = Image.open(io.BytesIO(img_data))
        model = genai.GenerativeModel("gemini-3.1-flash-lite")
        response = model.generate_content([prompt, img])
        return response.text.strip()
    except Exception as e:
        err_msg = str(e).lower()
        if "429" in err_msg or "quota" in err_msg or "resource_exhausted" in err_msg or "exhausted" in err_msg:
            print(f"[AUDIT] Gemini API Quota Exhausted or Rate Limited. Falling back to placeholder. Error: {e}")
            return "Visual representation description placeholder (quota exhausted fallback)."
        print(f"[AUDIT] Error describing image via Gemini: {e}")
        return f"Visual representation description failed: {e}"


def transcribe_page_image(img_data: bytes) -> str:
    prompt = (
        "Transcribe all readable academic text from this page. "
        "Preserve mathematical equations in LaTeX format (e.g., using $ or $$). "
        "Keep the logical flow and layout of paragraphs intact."
    )
    return describe_image(img_data, prompt)


def count_latex_equations(text: str) -> int:
    inline_eqs = len(re.findall(r"\$[^\$]+\$", text))
    block_eqs = len(re.findall(r"\$\$[^\$]+\$\$", text))
    latex_envs = len(re.findall(r"\\begin\{equation\}|\\begin\{align\}", text))
    return inline_eqs + block_eqs + latex_envs


def process_and_store_md(file_path: str, stop: bool = False, custom_metadata: dict = None):
    print(f"Processing: {file_path}")
    meta_src = custom_metadata if custom_metadata is not None else DOC_METADATA
    
    checksum = meta_src.get("checksum")
    doc_ver_id = meta_src.get("document_version_id")
    doc_id = meta_src.get("document_id")
    stats = {"pushed": 0}

    # Exponential backoff SQLite wrappers to prevent "database is locked" errors
    def execute_sqlite_query(query, params=None):
        import sqlite3
        import time
        retries = 5
        for attempt in range(retries):
            try:
                conn_sqlite = sqlite3.connect("frontend/dev.db", timeout=15)
                cur_sqlite = conn_sqlite.cursor()
                if params:
                    cur_sqlite.execute(query, params)
                else:
                    cur_sqlite.execute(query)
                conn_sqlite.commit()
                conn_sqlite.close()
                return True
            except sqlite3.OperationalError as e:
                if "locked" in str(e).lower() and attempt < retries - 1:
                    time.sleep(0.5 * (2 ** attempt))
                    continue
                print(f"[AUDIT] SQLite execution failed: {e}")
                break
            except Exception as exc:
                print(f"[AUDIT] SQLite execution error: {exc}")
                break
        return False

    def execute_sqlite_insert(query, params):
        import sqlite3
        import time
        retries = 5
        for attempt in range(retries):
            try:
                conn_sqlite = sqlite3.connect("frontend/dev.db", timeout=15)
                cur_sqlite = conn_sqlite.cursor()
                cur_sqlite.execute(query, params)
                row_id = cur_sqlite.lastrowid
                conn_sqlite.commit()
                conn_sqlite.close()
                return row_id
            except sqlite3.OperationalError as e:
                if "locked" in str(e).lower() and attempt < retries - 1:
                    time.sleep(0.5 * (2 ** attempt))
                    continue
                print(f"[AUDIT] SQLite insert failed: {e}")
                break
            except Exception as exc:
                print(f"[AUDIT] SQLite insert error: {exc}")
                break
        return None

    def update_db_status(status_str, error_msg=None):
        if not doc_ver_id:
            return
        if error_msg:
            execute_sqlite_query(
                "UPDATE DocumentVersion SET status = ?, processingError = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?",
                (status_str, error_msg, doc_ver_id)
            )
        elif status_str == "READY":
            pushed_count = stats.get("pushed", 0)
            execute_sqlite_query(
                "UPDATE DocumentVersion SET status = ?, chunkCount = ?, isLatest = 1, embeddedAt = CURRENT_TIMESTAMP, indexedAt = CURRENT_TIMESTAMP, updatedAt = CURRENT_TIMESTAMP WHERE id = ?",
                (status_str, pushed_count, doc_ver_id)
            )
            if doc_id:
                execute_sqlite_query(
                    "UPDATE DocumentVersion SET isLatest = 0, updatedAt = CURRENT_TIMESTAMP WHERE documentId = ? AND id != ?",
                    (doc_id, doc_ver_id)
                )
        else:
            execute_sqlite_query(
                "UPDATE DocumentVersion SET status = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?",
                (status_str, doc_ver_id)
            )
        print(f"[STATUS UPDATE] DocumentVersion status -> {status_str}")

    # Enforce upload limits and safeguards
    try:
        file_size = os.path.getsize(file_path)
        if file_size > 100 * 1024 * 1024:
            raise ValueError("File exceeds maximum upload size of 100 MB")
    except Exception as e:
        update_db_status("FAILED", str(e))
        raise e

    # Update job to PARSING
    update_db_status("PARSING")

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

        # Ensure checkpoints and vector table setup with detailed metrics
        local_cur.execute(
            """
            CREATE TABLE IF NOT EXISTS ingestion_checkpoints (
                document_version_id INTEGER PRIMARY KEY,
                last_processed_page INTEGER,
                number_of_extracted_figures INTEGER DEFAULT 0,
                number_of_generated_chunks INTEGER DEFAULT 0,
                checksum TEXT,
                ingestion_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            ALTER TABLE ingestion_checkpoints ADD COLUMN IF NOT EXISTS number_of_extracted_figures INTEGER DEFAULT 0;
            ALTER TABLE ingestion_checkpoints ADD COLUMN IF NOT EXISTS number_of_generated_chunks INTEGER DEFAULT 0;
            ALTER TABLE ingestion_checkpoints ADD COLUMN IF NOT EXISTS checksum TEXT;
            ALTER TABLE ingestion_checkpoints ADD COLUMN IF NOT EXISTS ingestion_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
            """
        )
        local_conn.commit()

        # 1. Idempotency Check: if checksum exists, return existing count
        if checksum:
            local_cur.execute(f"SELECT COUNT(*) FROM {TABLE_NAME} WHERE checksum = %s", (checksum,))
            existing_count = local_cur.fetchone()[0]
            if existing_count > 0:
                print(f"Checksum {checksum} already indexed with {existing_count} chunks. Skipping ingestion (idempotent).")
                update_db_status("READY")
                local_conn.close()
                return existing_count

        # 2. Cleanup: delete existing entries for this version to avoid duplicates on re-indexing
        if doc_ver_id:
            local_cur.execute(f"DELETE FROM {TABLE_NAME} WHERE document_version_id = %s", (doc_ver_id,))
            print(f"Cleaned up existing vectors for document_version_id={doc_ver_id} (if any).")

        # Load checkpoint to see if we can resume ingestion
        local_cur.execute("SELECT last_processed_page FROM ingestion_checkpoints WHERE document_version_id = %s", (doc_ver_id,))
        checkpoint_row = local_cur.fetchone()
        last_processed_page = checkpoint_row[0] if checkpoint_row else 0
        print(f"[AUDIT] Checkpoint check: last processed page is {last_processed_page}")

        chunk_iter = []
        pages_processed = last_processed_page
        images_extracted = 0
        equations_preserved = 0
        graphs_described = 0
        embeddings_generated = 0
        inserted_rows = 0
        current_db_status = "PARSING"

        # Track link references per page (page number mapping)
        page_figures = {}
        page_graphs = {}
        page_circuits = {}
        page_tables = {}
        page_equations = {}

        # Heuristic quality OCR fallback helper
        def should_run_ocr(page_text):
            text = page_text.strip()
            if not text:
                return True
            words = text.split()
            if len(words) < 20:
                return True
            # Alphanumeric ratio check
            alnum_chars = sum(c.isalnum() for c in text)
            if len(text) > 0 and (alnum_chars / len(text)) < 0.6:
                return True
            return False

        # Local Docling page OCR helper
        def run_local_ocr_on_page(page_obj):
            import tempfile
            from pypdf import PdfWriter
            from docling.document_converter import DocumentConverter
            with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
                tmp_name = tmp.name
                writer = PdfWriter()
                writer.add_page(page_obj)
                writer.write(tmp)
            
            try:
                converter = DocumentConverter()
                result = converter.convert(tmp_name)
                return result.document.export_to_markdown()
            except Exception as local_ocr_exc:
                print(f"[AUDIT] Local Docling OCR failed: {local_ocr_exc}")
                return None
            finally:
                try:
                    os.unlink(tmp_name)
                except OSError:
                    pass

        # Page rendering helper for Gemini Vision OCR fallback
        def render_page_to_png(pdf_path, page_index):
            try:
                import pypdfium2 as pdfium
                import io
                doc = pdfium.PdfDocument(pdf_path)
                page = doc[page_index]
                bitmap = page.render(scale=2)
                pil_img = bitmap.to_pil()
                img_byte_arr = io.BytesIO()
                pil_img.save(img_byte_arr, format='PNG')
                return img_byte_arr.getvalue()
            except Exception as e:
                print(f"[AUDIT] Failed to render page {page_index + 1} to PNG: {e}")
                return None

        # URL stripping helper
        def normalize_links(text_content):
            # [anchor](url) -> anchor
            text_content = re.sub(r"\[([^\]]+)\]\((https?://[^\)]+)\)", r"\1", text_content)
            # raw url replacement
            def raw_url_repl(match):
                u = match.group(0)
                try:
                    from urllib.parse import urlparse
                    parsed = urlparse(u)
                    path = parsed.path.strip("/")
                    if path:
                        return path.split("/")[-1]
                    return parsed.netloc
                except Exception:
                    return u
            text_content = re.sub(r"https?://[^\s]+", raw_url_repl, text_content)
            return text_content

        # Simple section header detection helper
        def is_section_header(text):
            text_strip = text.strip()
            if len(text_strip) > 60:
                return False
            if re.match(r"^(?:chapter|section|unit|module)\s+\d+", text_strip, re.IGNORECASE):
                return True
            if re.match(r"^\d+(?:\.\d+)+\s+[A-Z]", text_strip):
                return True
            if text_strip.isupper() and len(text_strip.split()) < 8:
                return True
            return False

        # Perceptual hash duplicate image detector (combined average hash + vertical/horizontal dhash)
        def compute_phash(img):
            import numpy as np
            # 1. Average Hash (a_hash)
            img_resized = img.convert("L").resize((8, 8), Image.Resampling.LANCZOS)
            pixels = list(img_resized.getdata())
            avg = sum(pixels) / 64.0
            a_hash = "".join("1" if p > avg else "0" for p in pixels)

            # 2. Difference Hash (dhash)
            img_dhash = img.convert("L").resize((9, 9), Image.Resampling.LANCZOS)
            arr = np.array(img_dhash)
            diff_h = arr[:, 1:] > arr[:, :-1]
            diff_v = arr[1:, :] > arr[:-1, :]
            
            d_hash_list = []
            for r in range(8):
                for c in range(8):
                    d_hash_list.append("1" if diff_h[r, c] else "0")
                    d_hash_list.append("1" if diff_v[r, c] else "0")
            d_hash = "".join(d_hash_list)
            
            return a_hash + "_" + d_hash


        # Banned watermark/logo keywords checker
        def is_logo_or_watermark(text):
            t_lower = text.lower()
            for kw in ["ktu", "ktunotes", "kalam", "publisher", "watermark", "logo", "decorative", "university"]:
                if kw in t_lower:
                    return True
            return False

        is_pdf = file_path.lower().endswith(".pdf")
        paragraphs_accumulated = []
        page_hashes = set()
        hash_counts = {}

        # Custom paragraph representation class
        class AccumulatedParagraph:
            def __init__(self, text, page_num, extraction_method, heading=None):
                self.text = text
                self.page_num = page_num
                self.extraction_method = extraction_method
                self.heading = heading

        class PageChunkMeta:
            def __init__(self, headings=None):
                self.headings = headings or []

        class PageChunk:
            def __init__(self, text, page_start, page_end, chunk_type, extraction_method, headings=None, image_path=None, figure_ids=None, graph_ids=None, table_ids=None, equation_ids=None, circuit_ids=None, image_hash=None):
                self.text = text
                self.page_start = page_start
                self.page_end = page_end
                self.chunk_type = chunk_type
                self.extraction_method = extraction_method
                self.meta = PageChunkMeta(headings)
                self.image_path = image_path
                self.figure_ids = figure_ids or []
                self.graph_ids = graph_ids or []
                self.table_ids = table_ids or []
                self.equation_ids = equation_ids or []
                self.circuit_ids = circuit_ids or []
                self.image_hash = image_hash

        dimension_counts = {}


        if is_pdf:
            from pypdf import PdfReader
            reader = PdfReader(file_path)
            total_pages = len(reader.pages)
            if total_pages > 1000:
                raise ValueError(f"File has {total_pages} pages, which exceeds limit of 1000 pages")
            print(f"[AUDIT] Ingesting large PDF: {file_path} with {total_pages} pages")

            os.makedirs("frontend/public/extracted_images", exist_ok=True)

            # Process page-by-page incrementally, starting from checkpoint
            for page_idx in range(last_processed_page, total_pages):
                page = reader.pages[page_idx]
                page_num = page_idx + 1
                
                # Init page reference lists
                page_figures[page_num] = []
                page_graphs[page_num] = []
                page_circuits[page_num] = []
                page_tables[page_num] = []
                page_equations[page_num] = []
                
                # Hybrid text extraction: Prefer selectable text
                page_text = page.extract_text() or ""
                extraction_method = "native_text"
                
                # Check for duplicate page content to prevent redundant chunks
                import hashlib
                page_content_hash = hashlib.md5(page_text.encode("utf-8")).hexdigest()
                if page_text.strip() and page_content_hash in page_hashes:
                     print(f"[AUDIT] Page {page_num} is a duplicate of a previously processed page. Skipping text indexing.")
                     continue
                if page_text.strip():
                     page_hashes.add(page_content_hash)

                # OCR Fallback if text is poor
                if should_run_ocr(page_text):
                    if current_db_status != "OCR":
                        update_db_status("OCR")
                        current_db_status = "OCR"
                    print(f"[AUDIT] Page {page_num} quality is poor. Attempting Local OCR.")
                    ocr_text = run_local_ocr_on_page(page)
                    if ocr_text and not should_run_ocr(ocr_text):
                        page_text = ocr_text
                        extraction_method = "local_ocr"
                    else:
                        # Fallback to Gemini Vision OCR by rendering page
                        print(f"[AUDIT] Falling back to Gemini Vision OCR for page {page_num}.")
                        rendered_png = render_page_to_png(file_path, page_idx)
                        if rendered_png:
                            ocr_text = transcribe_page_image(rendered_png)
                            if ocr_text:
                                page_text = ocr_text
                                extraction_method = "gemini_vision"

                # Hyperlink normalization
                page_text = normalize_links(page_text)

                # Table detection & Structured Markdown conversion (from page_text or Docling fallback)
                has_table_indicators = "table" in page_text.lower() or any(line.strip().startswith("|") for line in page_text.split("\n"))
                if has_table_indicators:
                    # If not already markdown table, convert using Docling locally if possible
                    if not any(line.strip().startswith("|") for line in page_text.split("\n")):
                        docling_md = run_local_ocr_on_page(page)
                        if docling_md and any(line.strip().startswith("|") for line in docling_md.split("\n")):
                            page_text = docling_md
                            extraction_method = "local_ocr"
                    
                    # Extract tables as separate table chunks
                    table_pattern = re.compile(r"((?:^|\n)\|[^\n]+\|\n\|[\s:-|]+\|\n(?:\s*\|[^\n]+\|\n?)+)", re.MULTILINE)
                    tables_found = table_pattern.findall(page_text)
                    for tbl in tables_found:
                        tbl_cleaned = tbl.strip()
                        if len(tbl_cleaned) > 10:
                            # Save in SQLite with retry wrapper
                            tbl_id = execute_sqlite_insert(
                                "INSERT INTO [Table] (documentVersionId, pageNumber, csvRepresentation) VALUES (?, ?, ?)",
                                (doc_ver_id or 0, page_num, tbl_cleaned)
                            )
                            if tbl_id:
                                page_tables[page_num].append(tbl_id)
                                chunk_iter.append(PageChunk(
                                    text=f"[TABLE - Page {page_num}]:\n{tbl_cleaned}",
                                    page_start=page_num,
                                    page_end=page_num,
                                    chunk_type="table",
                                    extraction_method=extraction_method,
                                    headings=[f"Page {page_num}", "Table"],
                                    table_ids=[tbl_id]
                                ))

                # Preserve LaTeX equations and nearby context
                eq_pattern = re.compile(r"(\$\$[^\$]+\$\$|\$[^\$]+\$|\\begin\{equation\}[^\\]+\\end\{equation\}|\\begin\{align\}[^\\]+\\end\{align\})", re.DOTALL)
                equations_in_page = eq_pattern.finditer(page_text)
                for match in equations_in_page:
                    eq = match.group(1).strip()
                    if len(eq) > 5:
                        start_idx = max(0, match.start() - 200)
                        end_idx = min(len(page_text), match.end() + 200)
                        nearby_text = page_text[start_idx:end_idx].strip()
                        equations_preserved += 1
                        # Save in SQLite with retry wrapper
                        eq_id = execute_sqlite_insert(
                            "INSERT INTO Equation (documentVersionId, pageNumber, rawText, latexRepresentation, confidence) VALUES (?, ?, ?, ?, ?)",
                            (doc_ver_id or 0, page_num, eq, eq, 1.0)
                        )
                        if eq_id:
                            page_equations[page_num].append(eq_id)
                            # Add equation chunk
                            chunk_iter.append(PageChunk(
                                text=f"[EQUATION - Page {page_num}]: {eq}\nNearby Context:\n...{nearby_text}...",
                                page_start=page_num,
                                page_end=page_num,
                                chunk_type="equation",
                                extraction_method=extraction_method,
                                headings=[f"Page {page_num}", "Equation"],
                                equation_ids=[eq_id]
                            ))

                # Image/Figure extraction, selective WebP filtering (No Gemini calls during Ingestion!)
                try:
                    img_objs = list(page.images)
                    if img_objs:
                        if current_db_status != "IMAGE_EXTRACTION":
                            update_db_status("IMAGE_EXTRACTION")
                            current_db_status = "IMAGE_EXTRACTION"
                        
                        from PIL import Image
                        import io
                        import numpy as np
                        
                        for img_idx, img_obj in enumerate(img_objs):
                            # Skip decorative or extremely small files (<10 KB)
                            if len(img_obj.data) < 10240:
                                continue
                            try:
                                img = Image.open(io.BytesIO(img_obj.data))
                                width, height = img.size
                                # Skip tiny icons, logos or decorative badges
                                if width < 150 or height < 150:
                                    continue
                                
                                # Extreme aspect ratio (separators, borders, header strips)
                                aspect_ratio = width / height
                                if aspect_ratio > 5.0 or aspect_ratio < 0.2:
                                    continue
                                
                                # Check repeated identical dimensions (more than 3 times in a document indicates repeated logos/seals)
                                dimensions = (width, height)
                                dimension_counts[dimensions] = dimension_counts.get(dimensions, 0) + 1
                                if dimension_counts[dimensions] > 3:
                                    print(f"[AUDIT] Skipping repeating logo/decorative icon with dimensions {dimensions}")
                                    continue

                                # Check flat color (std dev of grayscale pixel values < 15 indicates flat/decorative image)
                                pixels_arr = np.array(img.convert("L"))
                                std_dev = np.std(pixels_arr)
                                if std_dev < 15:
                                    print(f"[AUDIT] Skipping flat decorative image with low std dev: {std_dev:.2f}")
                                    continue
                                
                                # Check if image occupies only a tiny percentage of the page (<1.0% of page area)
                                page_width = float(page.mediabox.width or 612.0)
                                page_height = float(page.mediabox.height or 792.0)
                                page_area = page_width * page_height
                                image_area = width * height
                                if image_area < (page_area * 0.01):
                                    print(f"[AUDIT] Skipping tiny image occupying <1% of the page area ({image_area:.0f} vs page {page_area:.0f})")
                                    continue

                                # Perceptual hash duplicate image check
                                phash = compute_phash(img)
                                hash_counts[phash] = hash_counts.get(phash, 0) + 1
                                if hash_counts[phash] > 3:
                                    print(f"[AUDIT] Skipping duplicate/logo image with hash {phash} (repeating on {hash_counts[phash]} pages)")
                                    # Purge any previously stored versions from the chunks queue to eliminate duplicate clutter
                                    chunk_iter = [c for c in chunk_iter if not (c.chunk_type == "figure" and getattr(c, "image_hash", None) == phash)]
                                    continue
                                
                                # Check surrounding text or page context for KTU, logos, publisher, or watermarks
                                # (Avoid saving decorative headers, watermarked branding, publisher icons)
                                if is_logo_or_watermark(page_text):
                                    continue

                                # Compress and save to WebP format (max width 1600px, quality 80)
                                if width > 1600:
                                    ratio = 1600.0 / width
                                    new_size = (1600, int(height * ratio))
                                    img = img.resize(new_size, Image.Resampling.LANCZOS)
                                
                                images_extracted += 1
                                fig_filename = f"doc{doc_ver_id or 'unknown'}_page{page_num}_fig{img_idx}.webp"
                                fig_path = f"frontend/public/extracted_images/{fig_filename}"
                                img.save(fig_path, format="WEBP", quality=80)
                                web_img_path = f"/extracted_images/{fig_filename}"

                                # Store default description locally first (on-demand Gemini captioning during retrieval!)
                                desc = f"Visual figure diagram illustration on Page {page_num}."
                                db_chunk_type = "figure"

                                # Save in SQLite with retry wrapper
                                fig_id = execute_sqlite_insert(
                                    "INSERT INTO Figure (documentVersionId, pageNumber, caption, figureType, imagePath) VALUES (?, ?, ?, ?, ?)",
                                    (doc_ver_id or 0, page_num, desc, "IMAGE", web_img_path)
                                )
                                if fig_id:
                                    page_figures[page_num].append(fig_id)
                                    figure_chunk_text = f"[{db_chunk_type.upper()} - Page {page_num}]: {desc}"
                                    chunk_iter.append(PageChunk(
                                        text=figure_chunk_text,
                                        page_start=page_num,
                                        page_end=page_num,
                                        chunk_type=db_chunk_type,
                                        extraction_method="local_webp_comp",
                                        headings=[f"Page {page_num}", f"Figure {img_idx + 1}"],
                                        image_path=web_img_path,
                                        figure_ids=[fig_id],
                                        image_hash=phash
                                    ))
                            except Exception as parse_img_exc:
                                print(f"[AUDIT] Failed to parse image on page {page_num}: {parse_img_exc}")
                except Exception as img_exc:
                    print(f"[AUDIT] Failed to extract images on page {page_num}: {img_exc}")

                # Accumulate paragraphs for global semantic chunking
                if page_text.strip():
                    paragraphs = page_text.split("\n\n")
                    current_heading = None
                    for p in paragraphs:
                        p_cleaned = p.strip()
                        if p_cleaned:
                            if is_section_header(p_cleaned):
                                current_heading = p_cleaned
                            paragraphs_accumulated.append(AccumulatedParagraph(
                                text=p_cleaned,
                                page_num=page_num,
                                extraction_method=extraction_method,
                                heading=current_heading
                            ))

                pages_processed += 1
                
                # Checkpointing - save progress after each page in PostgreSQL checkpoints table
                local_cur.execute(
                    """
                    INSERT INTO ingestion_checkpoints (
                        document_version_id, 
                        last_processed_page, 
                        number_of_extracted_figures, 
                        number_of_generated_chunks, 
                        checksum, 
                        updated_at
                    )
                    VALUES (%s, %s, %s, %s, %s, CURRENT_TIMESTAMP)
                    ON CONFLICT (document_version_id)
                    DO UPDATE SET 
                        last_processed_page = EXCLUDED.last_processed_page,
                        number_of_extracted_figures = EXCLUDED.number_of_extracted_figures,
                        number_of_generated_chunks = EXCLUDED.number_of_generated_chunks,
                        checksum = EXCLUDED.checksum,
                        updated_at = CURRENT_TIMESTAMP;
                    """,
                    (
                        doc_ver_id, 
                        pages_processed, 
                        images_extracted, 
                        len(chunk_iter) + len(paragraphs_accumulated), 
                        checksum
                    )
                )
                local_conn.commit()

                # Checkpointing stats file
                progress_summary = {
                    "file": file_path,
                    "status": "processing",
                    "progress": pages_processed / total_pages,
                    "pages_processed": pages_processed,
                    "total_pages": total_pages,
                    "images_extracted": images_extracted,
                    "equations_preserved": equations_preserved,
                    "chunks_generated": len(chunk_iter) + len(paragraphs_accumulated),
                }
                try:
                    with open(STATS_FILE, "w", encoding="utf-8") as stats_file:
                        json.dump(progress_summary, stats_file, indent=2)
                except OSError:
                    pass

        else:
            # Fallback for Markdown files
            print(f"[AUDIT] Parsing Markdown file: {file_path}")
            with open(file_path, "r", encoding="utf-8") as f:
                content = f.read()
            content = normalize_links(content)
            paragraphs = content.split("\n\n")
            current_heading = None
            for p in paragraphs:
                p_cleaned = p.strip()
                if p_cleaned:
                    if is_section_header(p_cleaned):
                        current_heading = p_cleaned
                    paragraphs_accumulated.append(AccumulatedParagraph(
                        text=p_cleaned,
                        page_num=1,
                        extraction_method="native_text",
                        heading=current_heading
                    ))
            pages_processed = 1

        # Validation Check
        total_text_length = sum(len(p.text) for p in paragraphs_accumulated)
        print(f"[AUDIT] Filename: {file_path}")
        print(f"[AUDIT] Extracted text length: {total_text_length}")
        
        if total_text_length == 0 and not chunk_iter:
            raise ValueError(f"Extracted text length is zero (empty content) for file: {file_path}")

        # Update status to CHUNKING
        update_db_status("CHUNKING")

        # 3. Document-Level Semantic Chunking over accumulated paragraphs
        current_chunk_paras = []
        current_word_count = 0
        max_words = 400
        overlap_words = 80

        # We construct chunks across page boundaries
        for p_idx, para in enumerate(paragraphs_accumulated):
            para_words = para.text.split()
            if current_word_count + len(para_words) > max_words:
                if current_chunk_paras:
                    # Build chunk
                    chunk_text = "\n\n".join(p.text for p in current_chunk_paras)
                    p_start = min(p.page_num for p in current_chunk_paras)
                    p_end = max(p.page_num for p in current_chunk_paras)
                    methods = list(set(p.extraction_method for p in current_chunk_paras))
                    
                    headings_in_chunk = [p.heading for p in current_chunk_paras if p.heading]
                    unique_headings = []
                    for h in headings_in_chunk:
                        if h not in unique_headings:
                            unique_headings.append(h)
                    headings = [f"Pages {p_start}-{p_end}"] + unique_headings

                    # Map page-linked figures/tables/equations to the semantic chunk metadata
                    fig_ids = []
                    eq_ids = []
                    tbl_ids = []
                    for p_num in range(p_start, p_end + 1):
                        fig_ids.extend(page_figures.get(p_num, []))
                        eq_ids.extend(page_equations.get(p_num, []))
                        tbl_ids.extend(page_tables.get(p_num, []))

                    chunk_iter.append(PageChunk(
                        text=chunk_text,
                        page_start=p_start,
                        page_end=p_end,
                        chunk_type="text",
                        extraction_method=methods[0] if len(methods) == 1 else "hybrid",
                        headings=headings,
                        figure_ids=fig_ids,
                        equation_ids=eq_ids,
                        table_ids=tbl_ids
                    ))
                    # Backtrack for overlap
                    overlap_paras = []
                    overlap_count = 0
                    for p in reversed(current_chunk_paras):
                        pw = p.text.split()
                        if overlap_count + len(pw) <= overlap_words:
                            overlap_paras.insert(0, p)
                            overlap_count += len(pw)
                        else:
                            break
                    current_chunk_paras = overlap_paras
                    current_word_count = overlap_count
            current_chunk_paras.append(para)
            current_word_count += len(para_words)

        if current_chunk_paras:
            chunk_text = "\n\n".join(p.text for p in current_chunk_paras)
            p_start = min(p.page_num for p in current_chunk_paras)
            p_end = max(p.page_num for p in current_chunk_paras)
            methods = list(set(p.extraction_method for p in current_chunk_paras))
            
            headings_in_chunk = [p.heading for p in current_chunk_paras if p.heading]
            unique_headings = []
            for h in headings_in_chunk:
                if h not in unique_headings:
                    unique_headings.append(h)
            headings = [f"Pages {p_start}-{p_end}"] + unique_headings

            # Map page-linked figures/tables/equations
            fig_ids = []
            eq_ids = []
            tbl_ids = []
            for p_num in range(p_start, p_end + 1):
                fig_ids.extend(page_figures.get(p_num, []))
                eq_ids.extend(page_equations.get(p_num, []))
                tbl_ids.extend(page_tables.get(p_num, []))

            chunk_iter.append(PageChunk(
                text=chunk_text,
                page_start=p_start,
                page_end=p_end,
                chunk_type="text",
                extraction_method=methods[0] if len(methods) == 1 else "hybrid",
                headings=headings,
                figure_ids=fig_ids,
                equation_ids=eq_ids,
                table_ids=tbl_ids
            ))

        print(f"Total chunks generated for {file_path}: {len(chunk_iter)}")

        # Update status to EMBEDDING
        update_db_status("EMBEDDING")

        # Filename normalization
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

        # Content-based chunk IDs & embedding consistency verification helper
        def prepare_entry(index: int, chunk):
            import hashlib
            # Content-based deterministic hash to prevent duplicate embeddings
            chunk_hash = hashlib.sha256(chunk.text.encode("utf-8")).hexdigest()

            headings = getattr(chunk.meta, "headings", []) or []
            headers = [h for h in headings]
            hierarchy_path = " > ".join(headers) if headers else "Root"

            chapter = headers[0] if headers else None
            section = " > ".join(headers[1:]) if len(headers) > 1 else None

            keywords = extract_keywords(chunk.text)
            embedding = get_embedding(chunk.text)

            # Validate embedding consistency and dimensions
            if not embedding:
                raise ValueError(f"Embedding generation returned None or empty for chunk {index}")
            if len(embedding) != EMBED_DIM:
                raise ValueError(f"Embedding dimension mismatch for chunk {index}: expected {EMBED_DIM}, got {len(embedding)}")
            
            nonlocal embeddings_generated
            embeddings_generated += 1

            def classify_image_type(chunk_text):
                t_lower = chunk_text.lower()
                if "circuit" in t_lower or "schematic" in t_lower or "resistor" in t_lower or "capacitor" in t_lower:
                    return "circuit"
                elif "flowchart" in t_lower or "flow chart" in t_lower or "algorithm" in t_lower:
                    return "flowchart"
                elif "graph" in t_lower or "plot" in t_lower or "axis" in t_lower or "axes" in t_lower or "chart" in t_lower:
                    return "graph"
                elif "table" in t_lower or "tabular" in t_lower:
                    return "table"
                elif "architecture" in t_lower or "block diagram" in t_lower or "component" in t_lower:
                    return "architecture"
                return "figure"

            # Store versioning, extraction method, and page range metadata
            metadata = {
                "document_version_id": doc_ver_id,
                "checksum": checksum,
                "page_start": chunk.page_start,
                "page_end": chunk.page_end,
                "section_title": section or chapter or "General",
                "chunk_type": chunk.chunk_type,
                "embedding_model": f"{EMBED_BACKEND}-embedding-001" if EMBED_BACKEND == "gemini" else "sentence-transformers/all-MiniLM-L6-v2",
                "embedding_dimension": EMBED_DIM,
                "figure_ids": chunk.figure_ids,
                "graph_ids": chunk.graph_ids,
                "table_ids": chunk.table_ids,
                "equation_ids": chunk.equation_ids,
                "circuit_ids": chunk.circuit_ids,
                "hierarchy_path": hierarchy_path,
                "source": meta_src.get("source"),
                "subject": meta_src.get("subject"),
                "semester": meta_src.get("semester"),
                "department": meta_src.get("department"),
                "chapter": chapter,
                "section": section,
                "extraction_method": chunk.extraction_method,
                "image_path": getattr(chunk, "image_path", None),
                "chunk_hash": chunk_hash
            }

            if chunk.chunk_type == "figure":
                linked_ids = [
                    idx for idx, ch in enumerate(chunk_iter)
                    if ch.chunk_type == "text" and ch.page_start <= chunk.page_start <= ch.page_end
                ]
                metadata.update({
                    "image_type": classify_image_type(chunk.text),
                    "page": chunk.page_start,
                    "linked_chunk_ids": linked_ids,
                    "hash": getattr(chunk, "image_hash", None) or "",
                    "compressed": True
                })


            entry = (
                chunk.text,
                embedding,
                filename_for_db,
                index,
                chunk.chunk_type,
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
                chunk.page_start,
                chunk.page_end,
            )

            # Detailed insert logging
            print(f"[AUDIT] Preparing chunk: document_version_id={doc_ver_id}, chunk_type={chunk.chunk_type}, chunk_index={index}, text_length={len(chunk.text)}")

            record = {
                "index": index,
                "content_type": chunk.chunk_type,
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
                f"INSERT INTO {TABLE_NAME} (text, embedding, filename, chunk_index, chunk_type, keywords, metadata, source, subject, semester, department, chapter, section, document_version_id, document_id, checksum, page_start, page_end) VALUES %s",
                entries,
            )
            stats["batches"] += 1
            stats["pushed"] += len(entries)
            
            nonlocal inserted_rows
            inserted_rows += len(entries)

            pushed_chunk_indexes.extend(item["index"] for item in batch_buffer)
            pushed_batches.append(
                {
                    "batch_size": len(entries),
                    "last_chunk_index": batch_buffer[-1]["index"],
                    "timestamp": time.time(),
                }
            )
            batch_buffer = []

        # Update status to INDEXING
        update_db_status("INDEXING")

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

        # Update status to READY
        update_db_status("READY")

        # Verify insertion on the same connection
        local_cur.execute(f"SELECT COUNT(*) FROM {TABLE_NAME} WHERE document_version_id = %s;", (doc_ver_id,))
        final_count = local_cur.fetchone()[0]
        print(f"[AUDIT] Verification: Row count in {TABLE_NAME} immediately after insertion: {final_count}")

        # Validation statistics report
        print("[VERIFICATION_REPORT] PDF Ingestion Statistics:")
        print(f"  - Pages processed: {pages_processed}")
        print(f"  - Images extracted: {images_extracted}")
        print(f"  - Equations preserved: {equations_preserved}")
        print(f"  - Graphs described: {graphs_described}")
        print(f"  - Chunks generated: {len(chunk_iter)}")
        print(f"  - Embeddings generated: {embeddings_generated}")
        print(f"  - PostgreSQL rows inserted: {inserted_rows}")

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
            "status": "ready",
            "progress": 1.0,
            "metadata": meta_src,
            "stats": stats,
            "processed_chunks": processed_records,
            "pushed_chunk_indexes": pushed_chunk_indexes,
            "pushed_batches": pushed_batches,
            "completed_at": time.time(),
            "report": {
                "pages_processed": pages_processed,
                "images_extracted": images_extracted,
                "equations_preserved": equations_preserved,
                "graphs_described": graphs_described,
                "chunks_generated": len(chunk_iter),
                "embeddings_generated": embeddings_generated,
                "inserted_rows": inserted_rows,
            }
        }
        try:
            with open(STATS_FILE, "w", encoding="utf-8") as stats_file:
                json.dump(processing_summary, stats_file, indent=2)
        except OSError as exc:  # noqa: PERF203
            print(f"Unable to write stats file {STATS_FILE}: {exc}")

        return stats["pushed"]

    except Exception as e:
        print(f"[AUDIT] Ingestion failed: {e}. Executing rollback...")
        update_db_status("FAILED", str(e))
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
