from app.services.ai_service import analyse

result = analyse(
    "Need quotation for USB Cable 1000pcs",
    """Dear Sales Team,

We are ABC Trading Co., an electronics distributor in Osaka, Japan.
Could you send your best CIF Osaka price for 1,000 pcs USB Type-C cables?
Please also advise MOQ and lead time.

Best regards,
Mr. Smith
Purchasing Manager""",
)

for k, v in result.items():
    print(f"{k:12} {v}")
