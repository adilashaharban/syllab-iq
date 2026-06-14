from pydantic_settings import BaseSettings


class AISettings(BaseSettings):
    # model_name: str = "ollama:llama3.2:3b"
    # model_name: str = "gemini-2.5-flash-lite"
    model_name: str = "groq:llama-3.1-8b-instant"
    reasoning_model: str = "groq:openai/gpt-oss-20b"
    embedding_model: str = "all-MiniLM-L6-v2"


AIConfig = AISettings()
