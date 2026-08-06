from dataclasses import dataclass


@dataclass
class PriceSettings:
    profit_margin: float = 0.20
    local_charges: float = 120.0
    insurance: float = 80.0
    bank_charges: float = 35.0
    usd_twd: float = 29.6


DEFAULT_FREIGHT = 500.0

# 涉及目的地內陸運費或進口關稅，系統沒有這些資料，不計算。
UNSUPPORTED_INCOTERMS = {"DAP", "DPU", "DDP", "FAS"}

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


def calculate_from_cost(cost: float, destination: str,
                        s: PriceSettings, freight_lookup=None) -> dict:
    """計算 EXW / FCA / FOB / CFR / CIF / CPT / CIP,吃已經算好的成本總額。

    多品項報價（一封信要好幾樣產品）用這個：每個品項的 unit_price * qty 先加總
    成一筆 cost,運費/保險/出口地手續費是整批貨算一次,不會每個品項各分攤一次。

    DAP、DPU、DDP、FAS 涉及目的地內陸運費或進口關稅，系統沒有這些資料，
    不在計算範圍內（見 UNSUPPORTED_INCOTERMS）。

    freight_lookup: 可傳入一個 {國家: 運費} 的字典，通常來自資料庫。
                    沒傳就用預設運費。
    """
    destination = normalise_destination(destination)

    table = freight_lookup or {}
    freight = table.get(destination, DEFAULT_FREIGHT)

    exw = cost / (1 - s.profit_margin) + s.bank_charges
    fca = exw + s.local_charges / 2
    fob = exw + s.local_charges
    cfr = fob + freight
    cif = fob + freight + s.insurance
    cpt = exw + freight
    cip = exw + freight + s.insurance

    terms = {"exw": exw, "fca": fca, "fob": fob, "cfr": cfr,
              "cif": cif, "cpt": cpt, "cip": cip}

    result = {"cost": round(cost, 2), "freight": freight, "destination": destination,
              "freight_estimated": destination not in table}
    for key, value in terms.items():
        result[key] = round(value, 2)
    return result


def calculate(unit_price: float, qty: int, destination: str,
              s: PriceSettings, freight_lookup=None) -> dict:
    """單一品項版本：算 cost 後委派給 calculate_from_cost,並附上每個條件的 unit 單價。"""
    result = calculate_from_cost(unit_price * qty, destination, s, freight_lookup)
    for key in ("exw", "fca", "fob", "cfr", "cif", "cpt", "cip"):
        result[f"unit_{key}"] = round(result[key] / qty, 4)
    return result