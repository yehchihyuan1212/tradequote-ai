from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Customer, Email, Inquiry, Product, Quotation
from app.services.ai_service import analyse
from datetime import datetime
from app.models import Customer, Draft, Email, Inquiry, PriceSetting, Product, Quotation
from app.services.gmail_service import create_draft
from app.services.draft_service import compose_quotation_reply
from app.services.draft_service import (compose_quotation_reply,
                                        compose_sample_reply,
                                        compose_delivery_reply,
                                        compose_after_sales_reply,
                                        compose_payment_reply,
                                        compose_blank_reply)

app = FastAPI(title="TradeQuote AI")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class EmailIn(BaseModel):
    subject: str
    body: str

LABELS = {"analysed": "Analysed", "quoted": "Quoted",
          "drafted": "Drafted", "sent": "Sent"}


def _status(e: Email) -> str:
    if not e.inquiry:
        return "Pending"
    return LABELS.get(e.inquiry.status, e.inquiry.status.title())


@app.get("/")
def root():
    return {"service": "TradeQuote AI", "docs": "/docs"}


COUNTRIES = {"italy", "japan", "korea", "south korea", "china", "taiwan",
             "germany", "france", "spain", "egypt", "australia", "mexico",
             "brazil", "poland", "uae", "usa", "united states", "uk",
             "united kingdom", "india", "vietnam", "thailand", "singapore",
             "malaysia", "indonesia", "canada", "netherlands", "belgium",
             "turkey", "saudi arabia", "russia", "hong kong"}


def _clean(v):
    """模型偶爾會回字串 'null'，當成空值處理。"""
    if not v or not isinstance(v, str):
        return None
    s = v.strip()
    return None if s.lower() in {"null", "none", "n/a", "-", ""} else s


def _clean_company(v):
    """公司名不該是國家名。"""
    v = _clean(v)
    return None if v and v.lower() in COUNTRIES else v


@app.get("/api/inbox")
def inbox(archived: bool = False, db: Session = Depends(get_db)):
    q = db.query(Email).filter(Email.ignored_at.is_(None))
    if archived:
        q = q.filter(Email.archived_at.isnot(None))
    else:
        q = q.filter(Email.archived_at.is_(None))
    rows = q.order_by(Email.id.desc()).all()
    return [{
        "message_id": e.message_id,
        "received": e.received_at,
        "company": (e.inquiry.company if e.inquiry and e.inquiry.company
                    else (e.inquiry.contact if e.inquiry and e.inquiry.contact
                             else e.sender_email)),
        "email": e.sender_email,
        "subject": e.subject,
        "intent": e.inquiry.intent if e.inquiry else None,
        "confidence": e.inquiry.confidence if e.inquiry else None,
        "status": _status(e),
        "viewed": e.viewed_at is not None,
        
    } for e in rows]


@app.get("/api/inbox/{message_id}")
def email_detail(message_id: str, db: Session = Depends(get_db)):
    e = db.query(Email).filter_by(message_id=message_id).first()
    if not e:
        return {"error": "Not found"}

    out = {
        "email": {"subject": e.subject, "body": e.body,
                  "sender_name": e.sender_name, "sender_email": e.sender_email,
                  "received": e.received_at},
        "extracted": None, "quote": None, "draft": None,
    }
    if e.inquiry:
        i = e.inquiry
        out["extracted"] = {
            "intent": i.intent, "confidence": i.confidence,
            "company": i.company, "contact": i.contact,
            "product": i.product_text, "quantity": i.quantity,
            "destination": i.destination, "incoterm": i.incoterm,
            "summary": i.summary, "model": i.model_name,
        }
        if i.quotation:
            q = i.quotation
            out["quote"] = {
                "quote_no": q.quote_no, "sku": q.product.sku,
                "product": q.product.name, "quantity": q.quantity,
                "destination": q.destination,
                "cost": q.cost, "exw": q.exw, "fob": q.fob,
                "cif": q.cif, "unit_cif": q.unit_cif,
                "margin": q.margin_used, "freight": q.freight_used,
                "moq": q.product.moq, "lead_days": q.product.lead_days,
            }

        from app.models import Draft
        d = db.query(Draft).filter_by(inquiry_id=i.id).first()
        if d:
            out["draft"] = {
                "id": d.id, "to": d.to_email, "subject": d.subject,
                "body": d.body, "status": d.status,
                "gmail_draft_id": d.gmail_draft_id,
            }
    return out


@app.get("/api/stats")
def stats(db: Session = Depends(get_db)):
    dist = dict(db.query(Inquiry.intent, func.count())
                  .group_by(Inquiry.intent).all())
    from app.models import Draft
    return {
        "emails": db.query(Email).filter(Email.ignored_at.is_(None)).count(),
        "analysed": db.query(Inquiry).count(),
        "quotations": db.query(Quotation).count(),
        "customers": db.query(Customer).count(),
        "unread": db.query(Email).filter(
            Email.viewed_at.is_(None), Email.archived_at.is_(None),
            Email.ignored_at.is_(None)).count(),
        "pending_drafts": db.query(Draft).filter(Draft.status == "draft").count(),
        "intent_distribution": dist,
    }


@app.get("/api/products")
def products(db: Session = Depends(get_db)):
    return [{"sku": p.sku, "name": p.name, "price": p.unit_price,
             "moq": p.moq, "lead": p.lead_days, "hs_code": p.hs_code}
            for p in db.query(Product).order_by(Product.sku).all()]


@app.get("/api/quotations")
def quotations(db: Session = Depends(get_db)):
    return [{"quote_no": q.quote_no, "company": q.inquiry.company,
             "product": q.product.name, "quantity": q.quantity,
             "destination": q.destination, "exw": q.exw, "fob": q.fob,
             "cif": q.cif, "status": q.status}
            for q in db.query(Quotation).order_by(Quotation.id.desc()).all()]


@app.get("/api/customers")
def customers(db: Session = Depends(get_db)):
    rows = []
    for c in db.query(Customer).all():
        active = [e for e in c.emails if e.ignored_at is None]
        if not active:
            continue
        quotes = [e.inquiry.quotation for e in active
                  if e.inquiry and e.inquiry.quotation]
        last = max(active, key=lambda e: e.fetched_at)
        rows.append({
            "id": c.id, "company": c.company, "email": c.email,
            "country": c.country, "language": c.language,
            "industry": c.industry, "emails": len(active),
            "quotations": len(quotes),
            "total_value": sum(q.cif for q in quotes),
            "last_contact": last.received_at,
        })
    return sorted(rows, key=lambda r: -r["emails"])


@app.get("/api/customers/{customer_id}")
def customer_detail(customer_id: int, db: Session = Depends(get_db)):
    c = db.query(Customer).filter_by(id=customer_id).first()
    if not c:
        return {"error": "Not found"}

    active = [e for e in c.emails if e.ignored_at is None]
    history = []
    for e in sorted(active, key=lambda e: e.fetched_at, reverse=True):
        i = e.inquiry
        q = i.quotation if i else None
        history.append({
            "message_id": e.message_id,
            "subject": e.subject,
            "received": e.received_at,
            "intent": i.intent if i else None,
            "status": _status(e),
            "quote_no": q.quote_no if q else None,
            "product": q.product.name if q else (i.product_text if i else None),
            "quantity": q.quantity if q else (i.quantity if i else None),
            "destination": q.destination if q else (i.destination if i else None),
            "cif": q.cif if q else None,
        })

    return {
        "id": c.id, "company": c.company, "email": c.email,
        "contact": c.contact, "country": c.country, "language": c.language,
        "industry": c.industry,
        "quotations": sum(1 for h in history if h["quote_no"]),
        "total_value": sum(h["cif"] for h in history if h["cif"]),
        "history": history,
    }


@app.post("/api/analyse")
def analyse_email(payload: EmailIn):
    try:
        return analyse(payload.subject, payload.body)
    except Exception as e:
        return {"error": str(e)}
    
@app.post("/api/inbox/{message_id}/viewed")
def mark_viewed(message_id: str, db: Session = Depends(get_db)):
    e = db.query(Email).filter_by(message_id=message_id).first()
    if e and not e.viewed_at:
        e.viewed_at = datetime.now()
        db.commit()
    return {"ok": True}

class SettingsIn(BaseModel):
    profit_margin: float
    local_charges: float
    insurance: float
    bank_charges: float
    usd_twd: float


@app.get("/api/settings")
def get_settings(db: Session = Depends(get_db)):
    s = db.query(PriceSetting).first()
    if not s:
        s = PriceSetting()
        db.add(s)
        db.commit()
    return {
        "profit_margin": s.profit_margin,
        "local_charges": s.local_charges,
        "insurance": s.insurance,
        "bank_charges": s.bank_charges,
        "usd_twd": s.usd_twd,
        "updated_at": s.updated_at.strftime("%Y-%m-%d %H:%M"),
    }


@app.put("/api/settings")
def update_settings(payload: SettingsIn, db: Session = Depends(get_db)):
    s = db.query(PriceSetting).first()
    if not s:
        s = PriceSetting()
        db.add(s)
    s.profit_margin = payload.profit_margin
    s.local_charges = payload.local_charges
    s.insurance = payload.insurance
    s.bank_charges = payload.bank_charges
    s.usd_twd = payload.usd_twd
    db.commit()
    return {"ok": True, "updated_at": s.updated_at.strftime("%Y-%m-%d %H:%M")}


@app.get("/api/freight")
def freight(db: Session = Depends(get_db)):
    from app.models import Freight
    return [{"destination": f.destination, "port": f.port,
             "cost_usd": f.cost_usd, "transit_days": f.transit_days}
            for f in db.query(Freight).order_by(Freight.destination).all()]
       
@app.get("/api/drafts")
def list_drafts(db: Session = Depends(get_db)):
    rows = db.query(Draft).order_by(Draft.id.desc()).all()
    return [{
        "id": d.id,
        "to": d.to_email,
        "subject": d.subject,
        "body": d.body,
        "status": d.status,
        "company": d.inquiry.company,
        "gmail_draft_id": d.gmail_draft_id,
        "updated_at": d.updated_at.strftime("%Y-%m-%d %H:%M"),
    } for d in rows]


@app.post("/api/quotations/{quote_no}/draft")
def generate_draft(quote_no: str, db: Session = Depends(get_db)):
    """從報價產生一封草稿，存進資料庫（還沒送 Gmail）。"""
    q = db.query(Quotation).filter_by(quote_no=quote_no).first()
    if not q:
        return {"error": "Quotation not found"}

    existing = db.query(Draft).filter_by(inquiry_id=q.inquiry_id).first()
    if existing:
        return {"error": "Draft already exists", "draft_id": existing.id}

    inq = q.inquiry
    email = inq.email
    body = compose_quotation_reply(
        contact=inq.contact, product=q.product.name, sku=q.product.sku,
        qty=q.quantity, dest=q.destination, cif=q.cif, unit_cif=q.unit_cif,
        moq=q.product.moq, lead_days=q.product.lead_days,
    )
    d = Draft(
        quotation_id=q.id, inquiry_id=inq.id,
        to_email=email.sender_email,
        subject="Re: " + (email.subject or "Your inquiry"),
        body=body,
    )
    db.add(d)
    inq.status = "drafted"
    db.commit()
    return {"ok": True, "draft_id": d.id}


class DraftEdit(BaseModel):
    subject: str
    body: str


@app.put("/api/drafts/{draft_id}")
def edit_draft(draft_id: int, payload: DraftEdit, db: Session = Depends(get_db)):
    d = db.query(Draft).filter_by(id=draft_id).first()
    if not d:
        return {"error": "Not found"}
    d.subject = payload.subject
    d.body = payload.body
    db.commit()
    return {"ok": True}


@app.post("/api/drafts/{draft_id}/send-to-gmail")
def send_to_gmail(draft_id: int, db: Session = Depends(get_db)):
    """在 Gmail 建立草稿（不是寄出，是存進草稿匣）。"""
    d = db.query(Draft).filter_by(id=draft_id).first()
    if not d:
        return {"error": "Not found"}
    try:
        gmail_id = create_draft(d.to_email, d.subject, d.body)
    except Exception as e:
        return {"error": "Gmail failed: " + str(e)}
    d.gmail_draft_id = gmail_id
    d.status = "sent"
    if d.inquiry.quotation:
        d.inquiry.quotation.draft_id = gmail_id
        d.gmail_draft_id = gmail_id
    d.status = "sent"
    if d.inquiry.quotation:
        d.inquiry.quotation.draft_id = gmail_id
    d.inquiry.status = "sent"
    if d.inquiry.email:
        d.inquiry.email.archived_at = datetime.now()
    db.commit()
    return {"ok": True, "gmail_draft_id": gmail_id}
    db.commit()
    return {"ok": True, "gmail_draft_id": gmail_id}  
@app.post("/api/quotations/{quote_no}/recalculate")
def recalculate(quote_no: str, db: Session = Depends(get_db)):
    """用目前的 Price Settings 重算,更新快照。"""
    from app.services.pricing_service import PriceSettings, calculate

    q = db.query(Quotation).filter_by(quote_no=quote_no).first()
    if not q:
        return {"error": "Not found"}

    row = db.query(PriceSetting).first()
    s = PriceSettings(
        profit_margin=row.profit_margin,
        local_charges=row.local_charges,
        insurance=row.insurance,
        bank_charges=row.bank_charges,
        usd_twd=row.usd_twd,
    )
    calc = calculate(q.product.unit_price, q.quantity, q.destination, s)
    q.cost = calc["cost"]
    q.exw = calc["exw"]
    q.fob = calc["fob"]
    q.cif = calc["cif"]
    q.unit_cif = calc["unit_cif"]
    q.margin_used = s.profit_margin
    q.freight_used = calc["freight"]
    db.commit()
    return {"ok": True, "cif": q.cif, "margin": q.margin_used} 

@app.post("/api/inbox/sync")
def sync_inbox(query: str = "from:chris990246@gmail.com", limit: int = 20,
               db: Session = Depends(get_db)):
    """抓 Gmail 新信 → AI 分析 → 算價 → 入庫。回傳新增數量。"""
    from app.services.ai_service import MODEL, analyse
    from app.services.gmail_service import fetch_new
    from app.services.pricing_service import PriceSettings, calculate

    row = db.query(PriceSetting).first()
    s = PriceSettings(
        profit_margin=row.profit_margin, local_charges=row.local_charges,
        insurance=row.insurance, bank_charges=row.bank_charges, usd_twd=row.usd_twd,
    )

    def match_product(text):
        if not text:
            return None
        n = text.lower()
        for p in db.query(Product).all():
            names = [p.name.lower()]
            if p.aliases:
                names += [a.strip().lower() for a in p.aliases.split(",")]
            if any(c in n or n in c for c in names):
                return p
        words = {w.strip("-,.").rstrip("s") for w in n.split()}
        best, score = None, 0
        for p in db.query(Product).all():
            target = {w.rstrip("s") for w in p.name.lower().split()}
            hits = len(words & target)
            if hits > score:
                best, score = p, hits
        return best if score else None

    new = 0
    try:
        messages = fetch_new(limit, query)
    except Exception as e:
        return {"error": "Gmail failed: " + str(e)}

    for m in messages:
        existing = db.query(Email).filter_by(message_id=m["message_id"]).first()
        if existing:
            continue

        email = Email(
            message_id=m["message_id"], sender_name=m["sender_name"],
            sender_email=m["sender_email"], subject=m["subject"],
            body=m["body"], received_at=m["date"],
        )
        db.add(email)
        db.flush()

        try:
            r = analyse(m["subject"], m["body"])
        except Exception:
            db.commit()
            continue

        company = _clean_company(r.get("company"))
        country = _clean(r.get("destination"))
        cust = db.query(Customer).filter_by(company=company).first() if company else None
        if not cust and company:
            cust = Customer(company=company, email=m["sender_email"], country=country)
            db.add(cust)
            db.flush()
        elif not cust:
            cust = db.query(Customer).filter_by(email=m["sender_email"]).first()
            if not cust:
                cust = Customer(company=m["sender_email"],
                                email=m["sender_email"], country=country)
                db.add(cust)
                db.flush()
        if country and not cust.country:
            cust.country = country
        email.customer_id = cust.id

        inq = Inquiry(
            email_id=email.id,
            intent=(r.get("intent") if r.get("intent") in
                    {"quotation", "sample_request", "delivery_followup",
                     "after_sales", "payment", "other"} else "other"),
            confidence=r.get("confidence", 0), company=r.get("company"),
            contact=r.get("contact"), product_text=r.get("product"),
            quantity=r.get("quantity"), destination=r.get("destination"),
            incoterm=r.get("incoterm"), summary=r.get("summary"), model_name=MODEL,
        )
        db.add(inq)
        db.flush()


        if inq.intent == "quotation":
            p = match_product(inq.product_text)
            if p:
                qty = inq.quantity or p.moq
                dest = inq.destination or "Japan"
                calc = calculate(p.unit_price, qty, dest, s)
                n = db.query(Quotation).count() + 1
                db.add(Quotation(
                    inquiry_id=inq.id, quote_no=f"Q-2026-{n:03d}",
                    product_id=p.id, quantity=qty, destination=calc["destination"],
                    cost=calc["cost"], exw=calc["exw"], fob=calc["fob"],
                    cif=calc["cif"], unit_cif=calc["unit_cif"],
                    margin_used=s.profit_margin, freight_used=calc["freight"],
                ))
                inq.status = "quoted"

        db.commit()
        new += 1

    return {"ok": True, "new": new}

@app.get("/api/reports")
def reports(db: Session = Depends(get_db)):
    from sqlalchemy import func

    total_emails = db.query(Email).filter(Email.ignored_at.is_(None)).count()
    total_quotes = db.query(Quotation).count()

    # intent 分布
    dist = dict(db.query(Inquiry.intent, func.count())
                  .group_by(Inquiry.intent).all())

    # 各產品被報價次數 + 總金額
    prod_rows = (db.query(Product.name,
                          func.count(Quotation.id),
                          func.sum(Quotation.cif))
                   .join(Quotation, Quotation.product_id == Product.id)
                   .group_by(Product.name)
                   .order_by(func.count(Quotation.id).desc())
                   .all())
    products = [{"name": n, "count": c, "value": float(v or 0)}
                for n, c, v in prod_rows]

    # 報價狀態分布(成交率用)
    status_rows = dict(db.query(Quotation.status, func.count())
                         .group_by(Quotation.status).all())

    # 目的地分布
    dest_rows = (db.query(Quotation.destination, func.count())
                   .group_by(Quotation.destination)
                   .order_by(func.count(Quotation.id).desc()).all())
    destinations = [{"name": d, "count": c} for d, c in dest_rows]

    total_value = db.query(func.sum(Quotation.cif)).scalar() or 0
    avg_conf = db.query(func.avg(Inquiry.confidence)).scalar() or 0

    return {
        "total_emails": total_emails,
        "total_quotes": total_quotes,
        "total_value": float(total_value),
        "avg_confidence": round(float(avg_conf)),
        "intent_distribution": dist,
        "top_products": products,
        "destinations": destinations,
        "quote_status": status_rows,
    }
    
@app.get("/api/system-info")
def system_info(db: Session = Depends(get_db)):
    import os
    from app.services.ai_service import MODEL

    # 檢查 Ollama 是否在線
    ollama_ok = False
    try:
        import httpx
        r = httpx.get("http://localhost:11434/api/tags", timeout=2)
        ollama_ok = r.status_code == 200
    except Exception:
        ollama_ok = False

    # 從 token.json 判斷 Gmail 是否授權
    gmail_ok = os.path.exists("token.json")

    return {
        "model": MODEL,
        "model_runtime": "Ollama (local)",
        "ollama_online": ollama_ok,
        "gmail_authorised": gmail_ok,
        "data_location": "Local SQLite (tradequote.db)",
        "privacy_note": "All email analysis runs on this machine. No data leaves the device.",
    }
    
@app.get("/api/export")
def export_excel(db: Session = Depends(get_db)):
    from io import BytesIO
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill
    from fastapi.responses import StreamingResponse

    wb = Workbook()
    wb.remove(wb.active)

    header_font = Font(bold=True, color="FFFFFF")
    header_fill = PatternFill("solid", fgColor="1E293B")

    def write_sheet(title, headers, rows):
        ws = wb.create_sheet(title[:31])
        ws.append(headers)
        for c in ws[1]:
            c.font = header_font
            c.fill = header_fill
        for r in rows:
            ws.append(r)
        for i, h in enumerate(headers, 1):
            width = max(len(str(h)), *(len(str(r[i-1])) for r in rows)) if rows else len(h)
            ws.column_dimensions[chr(64+i)].width = min(width + 4, 50)

    intents = ["quotation", "sample_request", "delivery_followup", "after_sales", "payment"]
    for intent in intents:
        rows = db.query(Inquiry).filter_by(intent=intent).all()
        write_sheet(
            intent.replace("_", " ").title(),
            ["Date", "Company", "Contact", "Product", "Qty", "Destination", "Confidence", "Summary"],
            [[i.analysed_at.strftime("%Y-%m-%d %H:%M"), i.company or "", i.contact or "",
              i.product_text or "", i.quantity or "", i.destination or "",
              f"{i.confidence}%", i.summary or ""] for i in rows],
        )

    quotes = db.query(Quotation).all()
    write_sheet(
        "Quotations",
        ["Quote No", "Company", "Product", "Qty", "Destination", "EXW", "FOB", "CIF", "Status"],
        [[q.quote_no, q.inquiry.company or "", q.product.name, q.quantity, q.destination,
          round(q.exw), round(q.fob), round(q.cif), q.status] for q in quotes],
    )

    buf = BytesIO()
    wb.save(buf)
    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=tradequote_export.xlsx"},
    )
    
@app.post("/api/inbox/{message_id}/quote")
def quote_from_email(message_id: str, db: Session = Depends(get_db)):
    """對這封信產生報價。已有報價就直接回傳。"""
    from app.services.pricing_service import PriceSettings, calculate

    e = db.query(Email).filter_by(message_id=message_id).first()
    if not e or not e.inquiry:
        return {"error": "Email not analysed yet"}

    i = e.inquiry
    if i.quotation:
        return {"ok": True, "quote_no": i.quotation.quote_no, "existing": True}

    if i.intent != "quotation":
        return {"error": "This email is not a quotation request"}

    def match(text):
        if not text:
            return None
        n = text.lower()
        for p in db.query(Product).all():
            names = [p.name.lower()]
            if p.aliases:
                names += [a.strip().lower() for a in p.aliases.split(",")]
            if any(c in n or n in c for c in names):
                return p
        words = {w.strip("-,.").rstrip("s") for w in n.split()}
        best, score = None, 0
        for p in db.query(Product).all():
            target = {w.rstrip("s") for w in p.name.lower().split()}
            hits = len(words & target)
            if hits > score:
                best, score = p, hits
        return best if score else None

    p = match(i.product_text)
    if not p:
        return {"error": f"No product in the catalogue matches '{i.product_text}'"}

    row = db.query(PriceSetting).first()
    s = PriceSettings(
        profit_margin=row.profit_margin, local_charges=row.local_charges,
        insurance=row.insurance, bank_charges=row.bank_charges, usd_twd=row.usd_twd,
    )
    qty = i.quantity or p.moq
    dest = i.destination or "Japan"
    calc = calculate(p.unit_price, qty, dest, s)
    n = db.query(Quotation).count() + 1

    q = Quotation(
        inquiry_id=i.id, quote_no=f"Q-2026-{n:03d}",
        product_id=p.id, quantity=qty, destination=calc["destination"],
        cost=calc["cost"], exw=calc["exw"], fob=calc["fob"],
        cif=calc["cif"], unit_cif=calc["unit_cif"],
        margin_used=s.profit_margin, freight_used=calc["freight"],
    )
    db.add(q)
    i.status = "quoted"
    db.commit()
    return {"ok": True, "quote_no": q.quote_no}


@app.post("/api/inbox/{message_id}/draft")
def draft_from_email(message_id: str, db: Session = Depends(get_db)):
    """對這封信的報價產生草稿。"""
    from app.models import Draft

    e = db.query(Email).filter_by(message_id=message_id).first()
    if not e or not e.inquiry:
        return {"error": "Email not analysed yet"}

    i = e.inquiry
    existing = db.query(Draft).filter_by(inquiry_id=i.id).first()
    if existing:
        return {"ok": True, "draft_id": existing.id, "existing": True}

    q = i.quotation
    if not q:
        return {"error": "Generate a quotation first"}

    body = compose_quotation_reply(
        contact=i.contact, product=q.product.name, sku=q.product.sku,
        qty=q.quantity, dest=q.destination, cif=q.cif, unit_cif=q.unit_cif,
        moq=q.product.moq, lead_days=q.product.lead_days,
    )
    d = Draft(
        quotation_id=q.id, inquiry_id=i.id,
        to_email=e.sender_email,
        subject="Re: " + (e.subject or "Your inquiry"),
        body=body,
    )
    db.add(d)
    i.status = "drafted"
    db.commit()
    return {"ok": True, "draft_id": d.id}
@app.post("/api/drafts/{draft_id}/regenerate")
def regenerate_draft(draft_id: int, db: Session = Depends(get_db)):
    """用目前的報價重新產生草稿內容（覆蓋原本的）。"""
    from app.models import Draft

    d = db.query(Draft).filter_by(id=draft_id).first()
    if not d:
        return {"error": "Not found"}

    i = d.inquiry
    q = i.quotation
    if not q:
        return {"error": "No quotation attached to this draft"}

    d.body = compose_quotation_reply(
        contact=i.contact, product=q.product.name, sku=q.product.sku,
        qty=q.quantity, dest=q.destination, cif=q.cif, unit_cif=q.unit_cif,
        moq=q.product.moq, lead_days=q.product.lead_days,
    )
    db.commit()
    return {"ok": True}

TEMPLATES = {
    "sample_request": lambda i: compose_sample_reply(i.contact, i.product_text, i.quantity),
    "delivery_followup": lambda i: compose_delivery_reply(i.contact, None),
    "after_sales": lambda i: compose_after_sales_reply(i.contact, i.product_text, i.quantity),
    "payment": lambda i: compose_payment_reply(i.contact, None),
}


@app.post("/api/inbox/{message_id}/reply")
def reply_from_email(message_id: str, mode: str = "template",
                     db: Session = Depends(get_db)):
    """為非報價信產生草稿。mode = template | blank"""
    from app.models import Draft

    e = db.query(Email).filter_by(message_id=message_id).first()
    if not e or not e.inquiry:
        return {"error": "Email not analysed yet"}

    i = e.inquiry
    existing = db.query(Draft).filter_by(inquiry_id=i.id).first()
    if existing:
        return {"ok": True, "draft_id": existing.id, "existing": True}

    if mode == "blank":
        body = compose_blank_reply(i.contact)
    else:
        maker = TEMPLATES.get(i.intent)
        body = maker(i) if maker else compose_blank_reply(i.contact)

    d = Draft(
        inquiry_id=i.id,
        to_email=e.sender_email,
        subject="Re: " + (e.subject or "Your enquiry"),
        body=body,
    )
    db.add(d)
    i.status = "drafted"
    db.commit()
    return {"ok": True, "draft_id": d.id}


@app.post("/api/inbox/{message_id}/archive")
def archive_email(message_id: str, db: Session = Depends(get_db)):
    e = db.query(Email).filter_by(message_id=message_id).first()
    if not e:
        return {"error": "Not found"}
    e.archived_at = datetime.now()
    db.commit()
    return {"ok": True}


@app.post("/api/inbox/{message_id}/unarchive")
def unarchive_email(message_id: str, db: Session = Depends(get_db)):
    e = db.query(Email).filter_by(message_id=message_id).first()
    if not e:
        return {"error": "Not found"}
    e.archived_at = None
    db.commit()
    return {"ok": True}
@app.get("/api/irrelevant")
def irrelevant_emails(db: Session = Depends(get_db)):
    rows = (db.query(Email).join(Inquiry)
              .filter(Inquiry.intent == "other", Email.ignored_at.is_(None))
              .order_by(Email.id.desc()).all())
    return [{
        "message_id": e.message_id,
        "received": e.received_at,
        "company": (e.inquiry.company if e.inquiry and e.inquiry.company
                    else e.sender_name),
        "email": e.sender_email,
        "subject": e.subject,
        "summary": e.inquiry.summary if e.inquiry else None,
        "confidence": e.inquiry.confidence if e.inquiry else None,
    } for e in rows]


@app.post("/api/irrelevant/purge")
def purge_irrelevant(db: Session = Depends(get_db)):
    """清除所有不相關的信：刪掉內容，保留 message_id 供去重。"""
    rows = (db.query(Email).join(Inquiry)
              .filter(Inquiry.intent == "other", Email.ignored_at.is_(None)).all())
    n = 0
    for e in rows:
        if e.inquiry:
            db.delete(e.inquiry)
        e.body = ""
        e.subject = e.subject or ""
        e.ignored_at = datetime.now()
        n += 1
    db.commit()
    return {"ok": True, "purged": n}


@app.post("/api/inbox/{message_id}/keep")
def keep_email(message_id: str, db: Session = Depends(get_db)):
    """誤判的信：從 irrelevant 移回正常流程（需要重新分析）。"""
    e = db.query(Email).filter_by(message_id=message_id).first()
    if not e or not e.inquiry:
        return {"error": "Not found"}
    e.inquiry.intent = "quotation"
    e.inquiry.reviewed = True
    e.inquiry.corrected_intent = "quotation"
    db.commit()
    return {"ok": True}