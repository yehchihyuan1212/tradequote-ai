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


@app.get("/api/inbox")
def inbox(db: Session = Depends(get_db)):
    rows = db.query(Email).order_by(Email.id.desc()).all()
    return [{
        "message_id": e.message_id,
        "received": e.received_at,
        "company": (e.inquiry.company if e.inquiry and e.inquiry.company
                    else e.sender_name),
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
        "extracted": None, "quote": None,
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
            }
    return out


@app.get("/api/stats")
def stats(db: Session = Depends(get_db)):
    dist = dict(db.query(Inquiry.intent, func.count())
                  .group_by(Inquiry.intent).all())
    from app.models import Draft
    return {
        "emails": db.query(Email).count(),
        "analysed": db.query(Inquiry).count(),
        "quotations": db.query(Quotation).count(),
        "customers": db.query(Customer).count(),
        "unread": db.query(Email).filter(Email.viewed_at.is_(None)).count(),
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
    return [{"company": c.company, "email": c.email, "country": c.country,
             "language": c.language, "emails": len(c.emails)}
            for c in db.query(Customer).all()]


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
        if db.query(Email).filter_by(message_id=m["message_id"]).first():
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

        cust = db.query(Customer).filter_by(company=r.get("company")).first() if r.get("company") else None
        if not cust:
            cust = db.query(Customer).filter_by(email=m["sender_email"]).first()
        if not cust:
            cust = Customer(company=r.get("company") or m["sender_name"],
                            email=m["sender_email"], country=r.get("destination"))
            db.add(cust)
            db.flush()
        email.customer_id = cust.id

        inq = Inquiry(
            email_id=email.id, intent=r.get("intent", "other"),
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