from __future__ import annotations

import os

import httpx

RESEND_KEY = os.getenv("RESEND_API_KEY", "")


async def email_send(to: str, subject: str, body: str) -> dict:
    if not RESEND_KEY:
        return {"sent": False, "reason": "No RESEND_API_KEY configured", "to": to}

    async with httpx.AsyncClient() as client:
        response = await client.post(
            "https://api.resend.com/emails",
            headers={"Authorization": f"Bearer {RESEND_KEY}"},
            json={
                "from": "agent@privacyforge.app",
                "to": [to],
                "subject": subject,
                "text": body,
            },
            timeout=15,
        )
        response.raise_for_status()
        return {"sent": True, "id": response.json().get("id")}
