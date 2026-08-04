from app.services.pricing_service import UNSUPPORTED_INCOTERMS

INCOTERM_LABELS = {
    "exw": "EXW", "fca": "FCA", "fob": "FOB", "cfr": "CFR",
    "cif": "CIF", "cpt": "CPT", "cip": "CIP",
}


def compose_quotation_reply(contact, items, dest, prices, incoterms=None, validity=30):
    """items: list of {product, sku, quantity, unit_exw, moq, lead_days} — one entry
    per requested product (see main._quote_items). prices: dict with exw/fca/fob/cfr/
    cif/cpt/cip totals for the whole quote (see main._quote_prices) — freight/insurance
    are quoted once for the whole shipment, not split per product. incoterms: every
    term the customer asked for (a single email can ask for more than one, e.g. "FOB
    and CIF pricing") — each one we can calculate gets its own total line; any that
    fall in pricing_service.UNSUPPORTED_INCOTERMS get a note instead. Falls back to
    FOB + CIF when nothing usable was requested.
    """
    greeting = contact or "Sir/Madam"
    reqs = [t.upper() for t in (incoterms or []) if t]
    supported = [t for t in reqs if t.lower() in INCOTERM_LABELS]
    unsupported = [t for t in reqs if t in UNSUPPORTED_INCOTERMS]

    items_block = "\n\n".join(
        f"  {it['product']} ({it['sku']})\n"
        f"    Quantity    : {it['quantity']:,} pcs\n"
        f"    Unit price  : USD {it['unit_exw']:.4f} (EXW)\n"
        f"    MOQ         : {it['moq']:,} pcs · Lead time {it['lead_days']} days"
        for it in items
    )

    shown = supported or ["FOB", "CIF"]
    total_lines = "\n".join(
        f"  {INCOTERM_LABELS[t.lower()]} {dest} total : USD {prices[t.lower()]:,.2f}"
        for t in shown
    )

    note = ""
    if unsupported:
        terms_str = " / ".join(unsupported)
        note = (f"  Note: you also asked about {terms_str} terms. This involves destination-side\n"
                 f"  duties/charges we do not have data for and cannot quote automatically — please\n"
                 f"  contact us directly for {terms_str} pricing.\n\n")

    return f"""Dear {greeting},

Thank you for your inquiry. We are pleased to quote as follows:

{items_block}

{note}{total_lines}

This quotation is valid for {validity} days. Please let us know if you
would like to adjust the quantity or trade terms.

Best regards,
Sales Department"""

def compose_sample_reply(contact, product, qty, signature="Sales Department"):
    return f"""Dear {contact or 'Sir/Madam'},

Thank you for your interest in {product or 'our products'}.

We are pleased to arrange samples for you. Before we ship, please confirm:

  Item      : {product or '—'}
  Quantity  : {qty or '—'} pcs
  Delivery  : full shipping address and contact number
  Courier   : your account number, or we can quote the freight

Samples are usually dispatched within 3 working days of confirmation.

Best regards,
{signature}"""


def compose_delivery_reply(contact, reference=None, signature="Sales Department"):
    ref = f" regarding {reference}" if reference else ""
    return f"""Dear {contact or 'Sir/Madam'},

Thank you for your enquiry{ref}.

We are checking the current status with our forwarder and will come back
to you within one working day with the vessel details, container number
and estimated arrival date.

Best regards,
{signature}"""


def compose_after_sales_reply(contact, product, qty, signature="Sales Department"):
    return f"""Dear {contact or 'Sir/Madam'},

Thank you for bringing this to our attention, and we are sorry for the
inconvenience.

  Item reported : {product or '—'}
  Quantity      : {qty or '—'} pcs

Our quality team is reviewing the case now. To speed this up, could you
send photographs of the affected units and the carton markings?

We will confirm the replacement or credit arrangement within two working days.

Best regards,
{signature}"""


def compose_payment_reply(contact, reference=None, signature="Sales Department"):
    ref = f" for {reference}" if reference else ""
    return f"""Dear {contact or 'Sir/Madam'},

Thank you for the remittance advice{ref}.

We are confirming receipt with our bank and will issue the official
receipt once the funds have cleared. Shipment will be arranged
accordingly and we will send you the dispatch details.

Best regards,
{signature}"""


def compose_blank_reply(contact, signature="Sales Department"):
    return f"""Dear {contact or 'Sir/Madam'},



Best regards,
{signature}"""