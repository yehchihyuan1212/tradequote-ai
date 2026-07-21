import json
import re

import httpx

MODEL = "qwen3.5:0.8b"
OLLAMA = "http://localhost:11434/api/chat"

SYSTEM = """You extract structured data from international trade emails.

Output ONE JSON object and nothing else. No markdown. No commentary.

Schema:
{
"intent": "quotation" | "sample_request" | "delivery_followup" | "after_sales" | "payment" | "other",
  "confidence": 0-100,
  "company": the customer's company name ONLY, never including a person's name. Read the signature block: in "Laura Diaz\nNext Step Inc." the company is "Next Step Inc.", not "Laura Diaz Next Step Inc.". If no company appears, use null,
  "contact": the person's name ONLY, separate from the company,
  "product": string or null,
  "quantity": integer or null,
  "destination": country name only, never a city or port (e.g. "Japan" not "Osaka"),
  "incoterm": "EXW" | "FOB" | "CIF" or null,
  "summary": one English sentence describing what the customer wants
}

Use null for anything not stated. Never guess."""


def _clean(raw: str) -> str:
    raw = re.sub(r"<think>.*?</think>", "", raw, flags=re.DOTALL)
    raw = re.sub(r"^```(?:json)?|```$", "", raw.strip(), flags=re.MULTILINE)
    start, end = raw.find("{"), raw.rfind("}")
    if start != -1 and end != -1:
        raw = raw[start:end + 1]
    return raw.strip()


def analyse(subject: str, body: str) -> dict:
    r = httpx.post(OLLAMA, timeout=180.0, json={
        "model": MODEL,
        "stream": False,
        "think": False,
        "format": "json",
        "options": {"temperature": 0},
        "messages": [
            {"role": "system", "content": SYSTEM},
            {"role": "user", "content": f"Subject: {subject}\n\n{body}"},
        ],
    })
    r.raise_for_status()
    raw = r.json()["message"]["content"]
    cleaned = _clean(raw)
    if not cleaned:
        raise ValueError(f"Model returned nothing usable: {raw!r}")
    return json.loads(cleaned)