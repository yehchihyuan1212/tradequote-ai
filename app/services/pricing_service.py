from dataclasses import dataclass


@dataclass
class PriceSettings:
    """從 price_settings 資料表讀出來的公司設定"""
    profit_margin: float = 0.20
    local_charges: float = 120.0
    insurance: float = 80.0
    bank_charges: float = 35.0
    usd_twd: float = 29.6


FREIGHT_TABLE = {
    "Japan": 350.0,
    "Korea": 300.0,
    "Hong Kong": 180.0,
    "UAE": 980.0,
    "Mexico": 1450.0,
}


def calculate(unit_price: float, qty: int, destination: str,
              s: PriceSettings) -> dict[str, float]:
    """計算 EXW / FOB / CIF 三種貿易條件的報價。

    AI 不參與計算，所有數字都從設定表推導。
    """
    destination = normalise_destination(destination)
    cost = unit_price * qty
    exw = cost / (1 - s.profit_margin)
    fob = exw + s.local_charges
    freight = FREIGHT_TABLE.get(destination, 500.0)
    cif = fob + freight + s.insurance

    return {
        "cost": round(cost, 2),
        "exw": round(exw, 2),
        "fob": round(fob, 2),
        "cif": round(cif, 2),
        "unit_cif": round(cif / qty, 4),
        "freight": freight,
        "destination": destination,
    }


PORT_TO_COUNTRY = {
    "osaka": "Japan", "tokyo": "Japan", "yokohama": "Japan", "kobe": "Japan",
    "busan": "Korea", "incheon": "Korea",
    "hong kong": "Hong Kong",
    "jebel ali": "UAE", "dubai": "UAE",
    "manzanillo": "Mexico", "veracruz": "Mexico",
}


def normalise_destination(d):
    if not d:
        return None
    key = d.strip().lower()
    if key in FREIGHT_TABLE or d in FREIGHT_TABLE:
        return d
    return PORT_TO_COUNTRY.get(key, d)