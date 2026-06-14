import traceback
from chunk_and_push import process_and_store_md

if __name__ == "__main__":
    meta = {
        "source": "System.pdf",
        "subject": "Operating Systems",
        "semester": 1,
        "department": "Engineering",
        "document_id": 1,
        "document_version_id": 1,
        "checksum": "testchecksum12345"
    }
    try:
        # We pass stop=True to just test the conversion and chunking without inserting into DB, 
        # or stop=False to run the whole thing. Let's do False to see if it inserts.
        result = process_and_store_md("data/System.pdf", stop=False, custom_metadata=meta)
        print("Success! Processed and stored chunks:", result)
    except Exception as e:
        print("Failed with exception:")
        traceback.print_exc()
