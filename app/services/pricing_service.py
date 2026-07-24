from dataclasses import dataclass


@dataclass
class PriceSettings:
    profit_margin: float = 0.20
    local_charges: float = 120.0
    insurance: float = 80.0
    bank_charges: float = 35.0
    usd_twd: float = 29.6


DEFAULT_FREIGHT = 500.0

PORT_TO_COUNTRY = {
    "osaka": "Japan", "tokyo": "Japan", "yokohama": "Japan", "kobe": "Japan",
    "nagoya": "Japan",
    "busan": "Korea", "incheon": "Korea", "seoul": "Korea",
    "hong kong": "Hong Kong",
    "jebel ali": "UAE", "dubai": "UAE", "abu dhabi": "UAE",
    "manzanillo": "Mexico", "veracruz": "Mexico", "mexico city": "Mexico",
    "sydney": "Australia", "melbourne": "Australia", "brisbane": "Australia",
    "hamburg": "Germany", "bremerhaven": "Germany",
    "rotterdam": "Netherlands",
    "alexandria": "Egypt", "port said": "Egypt", "cairo": "Egypt",
    "singapore": "Singapore",
    "shanghai": "China", "shenzhen": "China", "ningbo": "China",
    "los angeles": "USA", "long beach": "USA", "new york": "USA",
    "genoa": "Italy", "milan": "Italy",
    "warsaw": "Poland", "gdansk": "Poland",
    "santos": "Brazil", "sao paulo": "Brazil",
}


def normalise_destination(d):
    """把城市或港口名換成國家名。"""
    if not d:
        return None
    key = d.strip().lower()
    return PORT_TO_COUNTRY.get(key, d.strip())


def calculate(unit_price: float, qty: int, destination: str,
              s: PriceSettings, freight_lookup=None) -> dict:
    """計算 EXW / FOB / CIF。

    freight_lookup: 可傳入一個 {國家: 運費} 的字典，通常來自資料庫。
                    沒傳就用預設運費。
    """
    destination = normalise_destination(destination)

    table = freight_lookup or {}
    freight = table.get(destination, DEFAULT_FREIGHT)

    cost = unit_price * qty
    exw = cost / (1 - s.profit_margin)
    fob = exw + s.local_charges
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