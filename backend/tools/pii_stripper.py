from backend.services.privacy import strip_pii

async def pii_stripper(input_data: str = "", token_map: dict | None = None, **kwargs):
    clean, new_token_map = strip_pii(input_data)
    if token_map is not None:
        token_map.update(new_token_map)
    return clean
