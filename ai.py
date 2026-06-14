from __future__ import annotations
import asyncio
import os
from typing import Literal, TypedDict

import streamlit as st
from pydantic_ai.messages import (
    ModelRequest,
    ModelResponse,
    UserPromptPart,
    TextPart,
)

from dotenv import load_dotenv

from agent import rag_pipeline_stream

load_dotenv()

MAX_CONTEXT_TOKENS = int(os.getenv("MAX_TOKEN", "6000"))


class ChatMessage(TypedDict):
    """Format of messages sent to the browser/API."""

    role: Literal["user", "model"]
    timestamp: str
    content: str


def display_message_part(part):
    if part.part_kind == "system-prompt":
        with st.chat_message("system"):
            st.markdown(f"**SyllabiQ**: {part.content}")
    elif part.part_kind == "user-prompt":
        with st.chat_message("user"):
            st.markdown(part.content)
    # text
    elif part.part_kind == "text":
        with st.chat_message("assistant"):
            st.markdown(part.content)


async def run_agent_with_streaming(user_input: str):
    partial_text = ""
    message_placeholder = st.empty()
    async for chunk in rag_pipeline_stream(
        user_input,
        max_context_tokens=MAX_CONTEXT_TOKENS,
    ):
        partial_text += chunk
        message_placeholder.markdown(partial_text)
    st.session_state.messages.append(
        ModelResponse(parts=[TextPart(content=partial_text)])
    )


async def main():
    st.title("SyllabiQ 📚🤖")
    st.write("Ask any question about KTU B.Tech CSE curriculum!")
    if "messages" not in st.session_state:
        st.session_state.messages = []
    for msg in st.session_state.messages:
        if isinstance(msg, ModelRequest) or isinstance(msg, ModelResponse):
            for part in msg.parts:
                display_message_part(part)
    user_input = st.chat_input("Ask a question...")
    if user_input:
        st.session_state.messages.append(
            ModelRequest(parts=[UserPromptPart(content=user_input)])
        )
        with st.chat_message("user"):
            st.markdown(user_input)
        with st.chat_message("assistant"):
            await run_agent_with_streaming(user_input)
            # response = st.write_stream(rag_pipeline_stream(user_input))


if __name__ == "__main__":
    asyncio.run(main())
