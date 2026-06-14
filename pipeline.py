import sys
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

from dotenv import load_dotenv
from pypdf import PdfReader

from lib import chunk_pages, init_worker, parse_pages, strip_hyperlinks

load_dotenv()  # Load environment variables from .env file


def _merge_markdown_parts(stem: str, output_name: str) -> None:
    """Merge per-range markdown files into a single markdown file.

    Expects input files named like `{stem}-start-end.md` in `./markdowns`.
    They are concatenated in ascending order of `start`.
    """

    md_dir = Path("./markdowns")
    pattern = f"{stem}-*.md"
    part_files = sorted(
        md_dir.glob(pattern),
        key=lambda p: (
            int(p.stem.split("-")[-2])
            if len(p.stem.split("-")) >= 3 and p.stem.split("-")[-2].isdigit()
            else 0
        ),
    )

    if not part_files:
        print(f"No markdown parts found for stem '{stem}', nothing to merge.")
        return

    output_path = md_dir / output_name
    with output_path.open("w", encoding="utf-8") as out_f:
        for idx, part in enumerate(part_files):
            text = part.read_text(encoding="utf-8")
            if idx > 0:
                out_f.write("\n\n")
            out_f.write(text)

    print(f"Merged {len(part_files)} markdown parts into {output_path}.")


if __name__ == "__main__":
    source_folder = Path("./data")
    file_name = sys.argv[1] if len(sys.argv) > 1 else "book"
    pages_arg = sys.argv[2] if len(sys.argv) > 2 else "50"
    # pages_arg can be an integer number of pages or the string "full".
    pages = None
    if isinstance(pages_arg, str) and pages_arg.lower() == "full":
        pages = "full"
    else:
        pages = int(pages_arg)
    chunk_size = int(sys.argv[3]) if len(sys.argv) > 3 else 5
    skip = int(sys.argv[4]) if len(sys.argv) > 4 else 0
    files = [p for p in source_folder.iterdir()]
    count = 0

    for f in files:
        if f.stem == file_name:
            # Strip clickable hyperlinks before conversion to reduce
            # Docling parsing issues caused by link annotations.
            cleaned_pdf = strip_hyperlinks(f)

            if pages == "full":
                # Determine total pages from the (cleaned) PDF, then chunk
                # all pages while still respecting the skip argument.
                reader = PdfReader(str(cleaned_pdf))
                total_pages = len(reader.pages)
            else:
                total_pages = pages

            page_chunks = list(chunk_pages(total_pages, chunk_size, skip=skip))
            with ProcessPoolExecutor(
                max_workers=2, initializer=init_worker
            ) as executor:
                futures = []
                for count, (start, end) in enumerate(page_chunks, 1):
                    futures.append(
                        executor.submit(
                            parse_pages,
                            cleaned_pdf,
                            (start, end),
                        )
                    )

                for f in futures:
                    f.result()

            # After all chunks are processed, merge the generated markdown
            # parts into a single markdown file named after the original
            # file stem (e.g., `book.md`).
            merged_name = f"{file_name}.md"
            _merge_markdown_parts(cleaned_pdf.stem, merged_name)

            # We found and processed the target file; no need to continue.
            break

    print("EXITING")
    sys.exit()
