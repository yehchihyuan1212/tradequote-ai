def compose_quotation_reply(contact, product, sku, qty, dest,
                            cif, unit_cif, moq, lead_days, validity=30):
    greeting = contact or "Sir/Madam"
    return f"""Dear {greeting},

Thank you for your inquiry regarding {product}.

We are pleased to quote as follows:

  Product     : {product} ({sku})
  Quantity    : {qty:,} pcs
  Unit price  : USD {unit_cif:.4f}
  CIF {dest}   : USD {cif:,.2f}
  MOQ         : {moq:,} pcs
  Lead time   : {lead_days} days after order confirmation

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