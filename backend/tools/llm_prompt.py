from backend.services.llm_router import call_llm

async def llm_prompt(input_data: str = "", prompt: str = "", llm_provider: str = "groq", api_key: str | None = None, **kwargs):
    system_instruction = prompt or "You are an expert AI clinical scribe. Draft a highly professional, structured clinical note based on this doctor-patient visit transcript. Include Chief Complaint, History of Present Illness (HPI), Vitals, Assessment, and Plan."
    messages = [
        {"role": "system", "content": system_instruction},
        {"role": "user", "content": f"Here is the doctor-patient visit transcript:\n\n{input_data}"}
    ]
    response = await call_llm(messages=messages, provider=llm_provider, api_key=api_key)
    return response
