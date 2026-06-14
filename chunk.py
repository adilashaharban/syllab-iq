from docling.chunking import HybridChunker
from docling.document_converter import DocumentConverter

DOC_SOURCE = "./data/cn.md"
EMBED_MODEL_ID = "gemma:2b"  # Ollama local model

doc = DocumentConverter().convert(source=DOC_SOURCE).document
chunker = HybridChunker()
chunk_iter = chunker.chunk(dl_doc=doc)


for i, chunk in enumerate(chunk_iter):
    print(f"=== {i} ===")
    print(f"chunk.text:\n{f'{chunk.text[:300]}…'!r}")
    enriched_text = chunker.contextualize(chunk=chunk)
    print(f"chunker.contextualize(chunk):\n{f'{enriched_text[:300]}…'!r}")

    print()
