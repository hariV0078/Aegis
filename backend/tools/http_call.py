from __future__ import annotations

import httpx


async def http_call(
    url: str,
    method: str = "GET",
    headers: dict | None = None,
    payload: dict | None = None,
) -> dict:
    async with httpx.AsyncClient() as client:
        response = await client.request(
            method=method.upper(),
            url=url,
            headers=headers or {},
            json=payload,
            timeout=20,
        )
        body = response.text[:2000]
        return {"status": response.status_code, "body": body}
