from __future__ import annotations

import os

import httpx
from bs4 import BeautifulSoup

BRAVE_KEY = os.getenv("BRAVE_SEARCH_KEY", "")


async def web_search(query: str, num_results: int = 5) -> list[dict]:
    if BRAVE_KEY:
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    "https://api.search.brave.com/res/v1/web/search",
                    headers={"Accept": "application/json", "X-Subscription-Token": BRAVE_KEY},
                    params={"q": query, "count": num_results},
                    timeout=15,
                )
                response.raise_for_status()
                results = response.json().get("web", {}).get("results", [])
                return [
                    {"title": item.get("title", ""), "url": item.get("url", ""), "snippet": item.get("description", "")}
                    for item in results[:num_results]
                ]
        except Exception:
            pass

    return [
        {
            "title": f"Pattern signal for {query[:30] or 'anonymized input'}",
            "url": "https://example.com/privacyforge-demo",
            "snippet": "Demo result produced locally so the MVP remains deterministic without external keys.",
        },
        {
            "title": "Related anomaly summary",
            "url": "https://example.com/anomaly-summary",
            "snippet": "A lightweight stand-in for external search results during early implementation.",
        },
    ][:num_results]
