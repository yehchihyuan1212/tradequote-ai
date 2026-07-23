from app.database import SessionLocal, init_db
from app.models import Customer, Email, Inquiry, PriceSetting, Product, Quotation
from app.services.ai_service import MODEL, analyse
from app.services.gmail_service import fetch_new
from app.services.pricing_service import PriceSettings, calculate


def get_or_create_customer(db, name, addr, country=None):
    c = None
    if name:
        c = db.query(Customer).filter_by(company=name).first()
    if not c:
        c = db.query(Customer).filter_by(email=addr).first()
    if c:
        if country and not c.country:
            c.country = country
        return c
    c = Customer(company=name or addr, email=addr, country=country)
    db.add(c)
    db.flush()
    return c


def match_product(db, text):
    """先比對名稱，再比對別名。"""
    if not text:
        return None
    n = text.lower()
    for p in db.query(Product).all():
        names = [p.name.lower()]
        if p.aliases:
            names += [a.strip().lower() for a in p.aliases.split(",")]
        for cand in names:
            if cand in n or n in cand:
                return p
    words = {w.strip("-,.").rstrip("s") for w in n.split()}
    best, score = None, 0
    for p in db.query(Product).all():
        target = {w.rstrip("s") for w in p.name.lower().split()}
        hits = len(words & target)
        if hits > score:
            best, score = p, hits
    return best if score else None


def next_quote_no(db):
    n = db.query(Quotation).count() + 1
    return f"Q-2026-{n:03d}"

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

        email.customer_id = get_or_create_customer(
            db, r.get("company") or m["sender_name"],
            m["sender_email"], r.get("destination")
        ).id

        inq = Inquiry(
            email_id=email.id,
            intent=(r.get("intent") if r.get("intent") in VALID_INTENTS else "other"),
            confidence=r.get("confidence", 0),
            company=r.get("company"),
            contact=r.get("contact"),
            product_text=r.get("product"),
            quantity=r.get("quantity"),
            destination=r.get("destination"),
            incoterm=r.get("incoterm"),
            summary=r.get("summary"),
            model_name=MODEL,
        )
        db.add(inq)
        db.flush()

        if inq.intent == "quotation":
            p = match_product(db, inq.product_text)
            if p:
                qty = inq.quantity or p.moq
                dest = inq.destination or "Japan"
                calc = calculate(p.unit_price, qty, dest, s)
                db.add(Quotation(
                    inquiry_id=inq.id,
                    quote_no=next_quote_no(db),
                    product_id=p.id,
                    quantity=qty,
                    destination=calc["destination"],
                    cost=calc["cost"], exw=calc["exw"], fob=calc["fob"],
                    cif=calc["cif"], unit_cif=calc["unit_cif"],
                    margin_used=s.profit_margin,
                    freight_used=calc["freight"],
                ))
                inq.status = "quoted"

        db.commit()
        new += 1
        print(f"  {inq.intent:20} {m['subject'][:45]}")

    print(f"\nStored {new} new, skipped {skipped} already seen.")
    db.close()

if __name__ == "__main__":
    ingest(query="from:chris990246@gmail.com")