from backend.services.llm_router import call_llm

async def classifier(input_data: str = "", categories: str = "general", llm_provider: str = "groq", api_key: str | None = None, **kwargs):
    messages = [
        {"role": "system", "content": f"Classify this input text into one of these categories: {categories}. Return only the category name."},
        {"role": "user", "content": input_data}
    ]
    response = await call_llm(messages=messages, provider=llm_provider, api_key=api_key)
    return response.strip()
