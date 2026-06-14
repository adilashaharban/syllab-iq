from docling.document_converter import DocumentConverter, PdfFormatOption
from docling.datamodel.base_models import InputFormat
from docling.datamodel.pipeline_options import (
    AcceleratorDevice,
    AcceleratorOptions,
    PdfPipelineOptions,
)
from docling.exceptions import ConversionError
from pathlib import Path
from multiprocessing import Pool

from dotenv import load_dotenv
from pypdf import PdfReader, PdfWriter


load_dotenv()  # Load environment variables from .env file

converter = None


def init_worker():
    global converter
    import sys
    import torch
    if torch.cuda.is_available():
        device_val = AcceleratorDevice.CUDA
    elif sys.platform != "win32" and hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
        device_val = AcceleratorDevice.MPS
    else:
        device_val = AcceleratorDevice.CPU

    pipeline_options = PdfPipelineOptions(
        accelerator_options=AcceleratorOptions(device=device_val),
        do_ocr=True,
    )
    converter = DocumentConverter(
        format_options={
            InputFormat.PDF: PdfFormatOption(
                pipeline_options=pipeline_options,
            )
        }
    )



def chunk_pages(total_pages, chunk_size, skip=0):
    """Yield (start, end) page ranges.

    `skip` defines how many pages to skip from the beginning.
    For example, total_pages=10, chunk_size=3, skip=2 ->
    (3,5), (6,8), (9,10).
    """

    start_page = max(1, skip + 1)
    for i in range(start_page, total_pages + 1, chunk_size):
        yield (i, min(i + chunk_size - 1, total_pages))


def strip_hyperlinks(input_path: Path) -> Path:
    """Return a copy of the PDF with clickable hyperlinks removed.

    Only link annotations (/Subtype /Link) are removed. Visible URL text
    remains unchanged.
    """

    output_path = input_path.with_name(input_path.stem + "_nolinks" + input_path.suffix)

    # Simple cache: reuse the cleaned file if it exists and is up-to-date.
    if (
        output_path.exists()
        and output_path.stat().st_mtime >= input_path.stat().st_mtime
    ):
        return output_path

    reader = PdfReader(str(input_path))
    writer = PdfWriter()

    for page in reader.pages:
        if "/Annots" in page:
            annots = page["/Annots"]
            new_annots = []
            for annot_ref in annots:
                annot = annot_ref.get_object()
                subtype = annot.get("/Subtype")
                # Drop only link annotations.
                if subtype == "/Link":
                    continue
                new_annots.append(annot_ref)

            if new_annots:
                page["/Annots"] = new_annots
            else:
                # No annotations remain on this page.
                page.pop("/Annots")

        writer.add_page(page)

    # Preserve document metadata when present.
    if reader.metadata:
        writer.add_metadata(reader.metadata)

    with output_path.open("wb") as f:
        writer.write(f)

    return output_path


def parse_chunk(pdf, page, count):
    if pdf.is_file() and pdf.match("*.pdf"):
        print(f"process {pdf}")
        doc = converter.convert(pdf, page_numbers=list(range(page, page + 20)))
        markdown = doc.document.export_to_markdown()
        print(f"Writing to {pdf.stem}.md")
        output_path = f"./markdowns/{pdf.stem}-{count}.md"
        with open(output_path, "w", encoding="utf-8") as pdf:
            pdf.write(markdown)
        print(f"Saved markdown to {output_path}")


def parse_pages(pdf_path, page_range):
    """Convert the given page range, splitting on Docling errors if needed.

    If Docling raises a ConversionError for the full range, recursively split
    the range to isolate problematic pages. Single pages that still fail are
    skipped, but the rest of the document continues to be processed.
    """

    global converter
    start, end = page_range

    def _convert_range(s: int, e: int, depth: int = 0, max_depth: int = 5):
        print(f"Processing pages {s}-{e}")
        try:
            doc = converter.convert(pdf_path, page_range=(s, e + 1))
            markdown = doc.document.export_to_markdown()
            output_path = f"./markdowns/{pdf_path.stem}-{s}-{e}.md"
            with open(output_path, "w", encoding="utf-8") as f:
                f.write(markdown)
            print(f"Saved {output_path}")
        except ConversionError as exc:
            # If a range fails, try to bisect it until we either isolate
            # individual failing pages or hit max_depth.
            if s == e or depth >= max_depth:
                print(f"Skipping pages {s}-{e} due to ConversionError: {exc}")
                return

            mid = (s + e) // 2
            _convert_range(s, mid, depth + 1, max_depth=max_depth)
            _convert_range(mid + 1, e, depth + 1, max_depth=max_depth)

    _convert_range(start, end)
