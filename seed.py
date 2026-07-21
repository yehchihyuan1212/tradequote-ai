from app.database import SessionLocal, init_db
from app.models import Freight, PriceSetting, Product

init_db()
db = SessionLocal()

if db.query(Product).count() == 0:
    db.add_all([
        Product(sku="A1001", name="USB Cable", unit_price=3.2, moq=500,
                lead_days=20, weight_kg=0.05, hs_code="8544.42",
                aliases="USB Type-C,type c cable,傳輸線,charging cable"),
        Product(sku="A1002", name="Power Bank", unit_price=8.5, moq=300,
                lead_days=25, weight_kg=0.22, hs_code="8507.60",
                aliases="powerbank,行動電源,portable charger"),
        Product(sku="A1003", name="Bluetooth Speaker", unit_price=12.8, moq=200,
                lead_days=30, weight_kg=0.35, hs_code="8518.22",
                aliases="BT speaker,藍牙喇叭,wireless speaker"),
        Product(sku="A1004", name="Charger", unit_price=5.6, moq=500,
                lead_days=20, weight_kg=0.11, hs_code="8504.40",
                aliases="adapter,充電器,wall charger"),
        Product(sku="A1005", name="Plastic Case", unit_price=1.4, moq=1000,
                lead_days=15, weight_kg=0.03, hs_code="3926.90",
                aliases="case,塑膠外殼,enclosure"),
    ])

if db.query(PriceSetting).count() == 0:
    db.add(PriceSetting())

if db.query(Freight).count() == 0:
    db.add_all([
        Freight(destination="Japan", port="Osaka", cost_usd=350, transit_days=5),
        Freight(destination="Korea", port="Busan", cost_usd=300, transit_days=4),
        Freight(destination="Hong Kong", port="Hong Kong", cost_usd=180, transit_days=2),
        Freight(destination="UAE", port="Jebel Ali", cost_usd=980, transit_days=18),
        Freight(destination="Mexico", port="Manzanillo", cost_usd=1450, transit_days=24),
    ])

db.commit()
print("Database ready.")
for p in db.query(Product).all():
    print(f"  {p.sku}  {p.name:20} USD {p.unit_price}")
db.close()