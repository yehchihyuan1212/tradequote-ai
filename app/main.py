from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Customer, Email, Inquiry, Product, Quotation
from app.services.ai_service import analyse
from datetime import datetime
from app.models import Customer, Email, Inquiry, PriceSetting, Product, Quotation

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
    return {
        "emails": db.query(Email).count(),
        "analysed": db.query(Inquiry).count(),
        "quotations": db.query(Quotation).count(),
        "customers": db.query(Customer).count(),
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