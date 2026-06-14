import traceback
from docling.document_converter import DocumentConverter

def test_file(file_path):
    print(f"Testing Docling conversion for {file_path}...")
    try:
        converter = DocumentConverter()
        result = converter.convert(file_path)
        print("Success!")
    except Exception as e:
        print(f"Failed with exception: {e}")
        traceback.print_exc()

if __name__ == "__main__":
    import os
    if os.path.exists("data/System.pdf"):
        test_file("data/System.pdf")
    if os.path.exists("data/book.pdf"):
        test_file("data/book.pdf")
