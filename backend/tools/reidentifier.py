from backend.services.privacy import reidentify

async def reidentifier(input_data: str = "", token_map: dict | None = None, **kwargs):
    if token_map:
        return reidentify(input_data, token_map)
    return input_data
