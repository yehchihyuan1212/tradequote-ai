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