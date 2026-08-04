import json
import re

import httpx

MODEL = "qwen3.5:4b" # "qwen3.5:4b" or "qwen3.5:0.8b"
OLLAMA = "http://localhost:11434/api/chat"

VALID_INCOTERMS = {"EXW", "FCA", "FAS", "FOB", "CFR", "CIF", "CPT", "CIP", "DAP", "DPU", "DDP"}

SYSTEM = """You extract structured data from international trade emails.

Output ONE JSON object and nothing else. No markdown. No commentary.

Schema:
{
"intent": "quotation" | "sample_request" | "delivery_followup" | "after_sales" | "payment" | "other".
  Use "other" whenever the email is NOT a genuine business enquiry from a trade customer:
  personal messages between friends, dinner invitations, marketing or promotional emails,
  newsletters, subscription notices, spam, or internal company notices.
  A promotional email offering a discount is "other", not a quotation or sample request.
  Only use the five business categories when a real customer is asking about your products,
  orders, shipments, defects, or payments.
  A customer asking for product samples IS a sample_request, never "other",
  "confidence": 0-100,
  "company": the customer's company name ONLY, never including a person's name. Look anywhere in the email - the opening line, the body, or the signature. "Kim's Electronics in Seoul, Korea here" means the company is "Kim's Electronics". In "Laura Diaz\nNext Step Inc." the company is "Next Step Inc.", not "Laura Diaz Next Step Inc.". Never put a country, city, or product name here - "Italy" or "Osaka" is not a company. Only use null when no company is named at all,
  "contact": the person's name ONLY, separate from the company,
  "items": a list of {"product": string, "quantity": integer or null} — ONE entry per
  distinct product mentioned. Most emails ask about a single product: return a
  one-item list. When the email lists several products (e.g. a table of SKUs with
  quantities), return one entry per product with its own quantity — never merge them
  into one comma-separated product string. Empty list if no product is mentioned.
  If the email gives ONE combined quantity covering several products with no per-product
  breakdown (e.g. "180 units affected" across two named products, with no split stated),
  do NOT split that number across the items or guess how it divides — set quantity to
  null for each affected item and mention the combined total in the summary instead,
  "destination": country name only, never a city or port (e.g. "Japan" not "Osaka"),
  "incoterms": a list of Incoterms mentioned in the email, from
  EXW/FCA/FAS/FOB/CFR/CIF/CPT/CIP/DAP/DPU/DDP. Most emails mention zero or one term:
  return a one-item list, or an empty list if none is stated. Some emails ask for
  pricing under SEVERAL terms at once (e.g. "please quote FOB and CIF Hamburg") —
  return every term mentioned, one entry each, never just the first one,
  "summary": one English sentence describing what the customer wants
}

Use null for anything not stated. Never guess.

Examples:

Email: "Hello, Kim's Electronics in Seoul, Korea here. We need 500 Bluetooth speakers, FOB Busan. Thanks, Ms. Park"
Output: {"intent":"quotation","confidence":100,"company":"Kim's Electronics","contact":"Ms. Park","items":[{"product":"Bluetooth speakers","quantity":500}],"destination":"Korea","incoterms":["FOB"],"summary":"Kim's Electronics requests a quotation for 500 Bluetooth speakers, FOB terms."}

Email: "Dear Sales Team, please quote us CIF Hamburg for: USB Cable 5,000 pcs, Power Bank 2,000 pcs, Charger 3,000 pcs. Also let us know FOB pricing. Best, Hans Wu"
Output: {"intent":"quotation","confidence":100,"company":null,"contact":"Hans Wu","items":[{"product":"USB Cable","quantity":5000},{"product":"Power Bank","quantity":2000},{"product":"Charger","quantity":3000}],"destination":"Germany","incoterms":["CIF","FOB"],"summary":"Hans Wu requests both CIF and FOB Hamburg quotations for USB cables, power banks and chargers."}

Email: "Dear supplier, 12 of the 500 power banks do not charge. Replacement or refund? Laura Diaz, Next Step Inc."
Output: {"intent":"after_sales","confidence":98,"company":"Next Step Inc.","contact":"Laura Diaz","items":[{"product":"power banks","quantity":12}],"destination":null,"incoterms":[],"summary":"Next Step Inc. reports 12 defective power banks and asks for replacement or refund."}

Email: "SKU A1003 Bluetooth Speaker has unstable connections, SKU A1004 Charger has scratches. Total quantity affected is approximately 180 units. Kevin Johnson"
Output: {"intent":"after_sales","confidence":95,"company":null,"contact":"Kevin Johnson","items":[{"product":"Bluetooth Speaker","quantity":null},{"product":"Charger","quantity":null}],"destination":null,"incoterms":[],"summary":"Kevin Johnson reports quality issues affecting a combined total of approximately 180 units of Bluetooth Speakers and Chargers, with no per-product breakdown given."}

Email: "Hi Chris, this Saturday night do you want to grab dinner? I booked that new Japanese place. Let me know."
Output: {"intent":"other","confidence":95,"company":null,"contact":"Chris","items":[],"destination":null,"incoterms":[],"summary":"A personal dinner invitation, unrelated to business."}

Email: "Limited time offer - 50% off business software. Upgrade your workflow today! Click here to claim your discount. Unsubscribe anytime."
Output: {"intent":"other","confidence":95,"company":null,"contact":null,"items":[],"destination":null,"incoterms":[],"summary":"A marketing email promoting software, not a customer enquiry."}
Email: "We remitted USD 5,440 for invoice INV-2026-118. Please confirm. Ahmed Hassan"
Output: {"intent":"payment","confidence":95,"company":null,"contact":"Ahmed Hassan","items":[],"destination":null,"incoterms":[],"summary":"Ahmed Hassan confirms a T/T payment of USD 5,440 for invoice INV-2026-118."}

Email: "Hi Chris, 這週六晚上要不要一起吃飯？我訂了新開的那家日料。記得回我。"
Output: {"intent":"other","confidence":95,"company":null,"contact":"Chris","items":[],"destination":null,"incoterms":[],"summary":"Personal message with no business content."}

Email: "Limited time offer - 50% off business software. Upgrade your workflow today! Click here to claim your discount. Unsubscribe anytime."
Output: {"intent":"other","confidence":95,"company":null,"contact":null,"items":[],"destination":null,"incoterms":[],"summary":"Unsolicited marketing email, not a customer enquiry."}

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
            {"role": "user", "content": f"Subject: {subject}\n\n{(body or '')[:1500]}"},
        ],
    })
    r.raise_for_status()
    raw = r.json()["message"]["content"]
    cleaned = _clean(raw)
    if not cleaned:
        raise ValueError(f"Model returned nothing usable: {raw!r}")
    try:
        data = json.loads(cleaned)
    except json.JSONDecodeError:
        # 模型輸出被截斷或格式壞掉：回傳安全預設值，不中斷整批處理
        return {"intent": "other", "confidence": 0, "company": None,
                "contact": None, "product": None, "quantity": None, "items": [],
                "destination": None, "incoterm": None, "incoterms": [],
                "summary": "（AI 回應格式異常，已跳過分析）"}

    # 清理 AI 輸出：把清單欄位轉成資料庫能存的型別
    def _to_text(v):
        if isinstance(v, list):
            return ", ".join(str(x) for x in v)
        return v

    def _to_int(v):
        if isinstance(v, list):
            v = v[0] if v else None
        if isinstance(v, str):
            digits = "".join(ch for ch in v if ch.isdigit())
            return int(digits) if digits else None
        if isinstance(v, (int, float)):
            return int(v)
        return None

    data["company"] = _to_text(data.get("company"))
    data["contact"] = _to_text(data.get("contact"))
    data["destination"] = _to_text(data.get("destination"))

    # items 是每個品項各自的 product/quantity；product/quantity 兩個舊欄位
    # 保留給只需要「一個代表性品項」的畫面用（例如非報價信的模板、Excel 匯出）。
    raw_items = data.get("items")
    if not isinstance(raw_items, list):
        raw_items = []
    items = []
    for it in raw_items:
        if not isinstance(it, dict):
            continue
        product = _to_text(it.get("product"))
        if not product:
            continue
        items.append({"product": product, "quantity": _to_int(it.get("quantity"))})

    # 舊模型輸出格式（沒有 items）：把單一 product/quantity 包成一個品項，向下相容。
    if not items and data.get("product"):
        items = [{"product": _to_text(data["product"]), "quantity": _to_int(data.get("quantity"))}]

    data["items"] = items
    data["product"] = ", ".join(it["product"] for it in items) if items else None
    data["quantity"] = items[0]["quantity"] if len(items) == 1 else None

    # incoterms 是信裡提到的每一個貿易條件（可能不只一個，例如客戶問
    # 「FOB and CIF pricing」）；incoterm 這個舊欄位保留給只需要「一個代表性
    # 條件」的畫面用，取第一個。
    raw_incoterms = data.get("incoterms")
    if not isinstance(raw_incoterms, list):
        raw_incoterms = []
    incoterms = []
    for t in raw_incoterms:
        t = _to_text(t)
        if isinstance(t, str):
            t = t.strip().upper()
            if t in VALID_INCOTERMS and t not in incoterms:
                incoterms.append(t)

    # 舊模型輸出格式（沒有 incoterms，只有單一 incoterm）：包成一個列表，向下相容。
    if not incoterms and data.get("incoterm"):
        single = _to_text(data["incoterm"])
        if isinstance(single, str):
            single = single.strip().upper()
            if single in VALID_INCOTERMS:
                incoterms = [single]

    data["incoterms"] = incoterms
    data["incoterm"] = incoterms[0] if incoterms else None
    return data