import json

from app.database import SessionLocal, init_db
from app.main import _clean as clean, _clean_company as clean_company
from app.main import _resolve_customer, _generate_quotation, _freight_table
from app.models import Email, Inquiry, PriceSetting
from app.services.ai_service import MODEL, analyse
from app.services.gmail_service import fetch_new
from app.services.pricing_service import PriceSettings

VALID_INTENTS = {"quotation", "sample_request", "delivery_followup",
                 "after_sales", "payment", "other"}

def ingest(query="is:unread", limit=20):
    init_db()
    db = SessionLocal()
    settings_row = db.query(PriceSetting).first()
    s = PriceSettings(
        profit_margin=settings_row.profit_margin,
        local_charges=settings_row.local_charges,
        insurance=settings_row.insurance,
        bank_charges=settings_row.bank_charges,
        usd_twd=settings_row.usd_twd,
    )
    freight_lookup = _freight_table(db)

    new, skipped = 0, 0

    for m in fetch_new(limit, query):
        if db.query(Email).filter_by(message_id=m["message_id"]).first():
            skipped += 1
            continue

        email = Email(
            message_id=m["message_id"],
            sender_name=m["sender_name"],
            sender_email=m["sender_email"],
            subject=m["subject"],
            body=m["body"],
            received_at=m["date"],
        )
        db.add(email)
        db.flush()

        r = analyse(m["subject"], m["body"])

        company = clean_company(r.get("company"))
        contact = clean(r.get("contact"))
        country = clean(r.get("destination"))
        email.customer_id = _resolve_customer(db, company, contact, m["sender_email"], country).id

        inq = Inquiry(
            email_id=email.id,
            intent=(r.get("intent") if r.get("intent") in VALID_INTENTS else "other"),
            confidence=r.get("confidence", 0),
            company=r.get("company"),
            contact=r.get("contact"),
            product_text=r.get("product"),
            quantity=r.get("quantity"),
            items_json=json.dumps(r.get("items") or []),
            destination=r.get("destination"),
            incoterm=r.get("incoterm"),
            incoterms_json=json.dumps(r.get("incoterms") or []),
            summary=r.get("summary"),
            model_name=MODEL,
        )
        db.add(inq)
        db.flush()

        if inq.intent == "quotation" and _generate_quotation(db, inq, s, freight_lookup):
            inq.status = "quoted"

        db.commit()
        new += 1
        print(f"  {inq.intent:20} {m['subject'][:45]}")

    print(f"\nStored {new} new, skipped {skipped} already seen.")
    db.close()

if __name__ == "__main__":
    ingest(query="is:unread")
