import sys
import torch
from sentence_transformers import SentenceTransformer

# Automatically select the best available device
if torch.cuda.is_available():
    device = "cuda"
elif sys.platform != "win32" and hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
    device = "mps"
else:
    device = "cpu"

model = SentenceTransformer("all-MiniLM-L6-v2", device=device)


def get_embeddings(content):
    return model.encode(content, batch_size=32, show_progress_bar=False, device=device)


if __name__ == "__main__":
    sentences = ["Llama 3.2 is great for chat", "Embeddings are useful for search"]
    embeddings = model.encode(sentences)
    print(embeddings)  # (2, 384)
    print(embeddings.shape)  # (2, 384)

