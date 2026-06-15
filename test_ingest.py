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
        # Let's ingest document version 7 PDF
        result = process_and_store_md(
            "frontend/public/uploads/70683e30629d0217f20636d03032d59c66f222542f5da2c94219058d0fe113eb.pdf", 
            stop=False, 
            custom_metadata={
                "source": "OPERATING SYSTEMS .pdf",
                "subject": "Operating Systems",
                "semester": 6,
                "department": "Engineering",
                "document_id": 7,
                "document_version_id": 7,
                "checksum": "70683e30629d0217f20636d03032d59c66f222542f5da2c94219058d0fe113eb_fresh_test_v2"
            }
        )
        print("Success! Processed and stored chunks:", result)
    except Exception as e:
        print("Failed with exception:")
        traceback.print_exc()
