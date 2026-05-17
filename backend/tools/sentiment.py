from backend.services.llm_router import call_llm

async def sentiment(input_data: str = "", llm_provider: str = "groq", api_key: str | None = None, **kwargs):
    messages = [
        {"role": "system", "content": "Analyze the sentiment of this text. Return either POSITIVE, NEGATIVE, or NEUTRAL followed by a one sentence reasoning."},
        {"role": "user", "content": input_data}
    ]
    response = await call_llm(messages=messages, provider=llm_provider, api_key=api_key)
    return response.strip()
