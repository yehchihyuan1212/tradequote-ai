import json
import re

import httpx

MODEL = "qwen3.5:4b" # "qwen3.5:4b" or "qwen3.5:0.8b"
OLLAMA = "http://localhost:11434/api/chat"

SYSTEM = """You extract structured data from international trade emails.

Output ONE JSON object and nothing else. No markdown. No commentary.

Schema:
{
"intent": "quotation" | "sample_request" | "delivery_followup" | "after_sales" | "payment" | "other",
  "confidence": 0-100,
  "company": the customer's company name ONLY, never including a person's name. Look anywhere in the email - the opening line, the body, or the signature. "Kim's Electronics in Seoul, Korea here" means the company is "Kim's Electronics". In "Laura Diaz\nNext Step Inc." the company is "Next Step Inc.", not "Laura Diaz Next Step Inc.". Never put a country, city, or product name here - "Italy" or "Osaka" is not a company. Only use null when no company is named at all,
  "contact": the person's name ONLY, separate from the company,
  "product": string or null,
  "quantity": integer or null,
  "destination": country name only, never a city or port (e.g. "Japan" not "Osaka"),
  "incoterm": "EXW" | "FOB" | "CIF" or null,
  "summary": one English sentence describing what the customer wants
}

Use null for anything not stated. Never guess.

Examples:

Email: "Hello, Kim's Electronics in Seoul, Korea here. We need 500 Bluetooth speakers, FOB Busan. Thanks, Ms. Park"
Output: {"intent":"quotation","confidence":100,"company":"Kim's Electronics","contact":"Ms. Park","product":"Bluetooth speakers","quantity":500,"destination":"Korea","incoterm":"FOB","summary":"Kim's Electronics requests a quotation for 500 Bluetooth speakers, FOB terms."}

Email: "Dear supplier, 12 of the 500 power banks do not charge. Replacement or refund? Laura Diaz, Next Step Inc."
Output: {"intent":"after_sales","confidence":98,"company":"Next Step Inc.","contact":"Laura Diaz","product":"power banks","quantity":12,"destination":null,"incoterm":null,"summary":"Next Step Inc. reports 12 defective power banks and asks for replacement or refund."}

Email: "Hi, could you send 10 USB cable samples to our office in Hamburg? We cover courier. Klaus Weber, Weber GmbH"
Output: {"intent":"sample_request","confidence":95,"company":"Weber GmbH","contact":"Klaus Weber","product":"USB cable","quantity":10,"destination":"Germany","incoterm":null,"summary":"Weber GmbH requests 10 USB cable samples shipped to Hamburg at their own courier cost."}

Email: "We remitted USD 5,440 for invoice INV-2026-118. Please confirm. Ahmed Hassan"
Output: {"intent":"payment","confidence":95,"company":null,"contact":"Ahmed Hassan","product":null,"quantity":null,"destination":null,"incoterm":null,"summary":"Ahmed Hassan confirms a T/T payment of USD 5,440 for invoice INV-2026-118."}
"""


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