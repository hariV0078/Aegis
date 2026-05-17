from backend.services.privacy import strip_pii

async def pii_stripper(input_data: str = "", **kwargs):
    clean, _ = strip_pii(input_data)
    return clean
