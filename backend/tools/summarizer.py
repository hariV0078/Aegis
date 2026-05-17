from backend.services.llm_router import call_llm

async def summarizer(input_data: str = "", llm_provider: str = "groq", api_key: str | None = None, **kwargs):
    messages = [
        {"role": "system", "content": "You are a medical assistant reviewing clinical notes. Summarize key treatment plans, vitals, and next steps from this note."},
        {"role": "user", "content": input_data}
    ]
    response = await call_llm(messages=messages, provider=llm_provider, api_key=api_key)
    return response
