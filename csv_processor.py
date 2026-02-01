# csv_processor.py
# Usage:
#   python csv_processor.py --in products_inv.csv --out products_processed_1.csv
#
# Rules:
# - base_unit in output = value from input column `scale`
# - has_variations = false
# - variation_attributes = []
# - selling_units_json:
#     if missing/invalid -> [{"unit": <scale>, "conversion": 1, "price": <selling_price>}]

import argparse
import csv
import json
import os
from datetime import datetime
from typing import Any, Dict, List, Optional


OUT_FIELDS = [
    "name",
    "sku",
    "category",
    "description",
    "selling_price",
    "cost_price",
    "quantity",
    "base_unit",
    "has_variations",
    "variation_attributes",
    "selling_units_json",
]

ALIASES = {
    "name": ["name", "product_name", "item_name", "title"],
    "sku": ["sku", "barcode", "bar_code", "ean", "upc", "product_code", "code"],
    "category": ["category", "category_name", "cat", "group"],
    "description": ["description", "desc", "details", "product_description"],
    "selling_price": ["selling_price", "sale_price", "price", "mrp", "retail_price"],
    "cost_price": ["cost_price", "cost", "purchase_price", "buy_price"],
    "quantity": ["quantity", "qty", "stock", "stock_qty", "available_qty", "on_hand"],
    # ✅ base unit source (your requirement)
    "scale": ["scale", "unit", "uom"],
    "selling_units_json": ["selling_units_json", "selling_units", "units_json", "units"],
}


def _s(x: Any) -> str:
    return "" if x is None else str(x).strip()


def first_nonempty(row: Dict[str, Any], keys: List[str]) -> str:
    # exact match
    for k in keys:
        if k in row and _s(row.get(k)) != "":
            return _s(row.get(k))
    # case-insensitive match
    lower_map = {str(k).strip().lower(): k for k in row.keys()}
    for k in keys:
        lk = k.lower()
        if lk in lower_map:
            v = _s(row.get(lower_map[lk]))
            if v != "":
                return v
    return ""


def parse_float(x: Any, default: float = 0.0) -> float:
    s = _s(x)
    if not s:
        return default
    try:
        return float(s.replace(",", ""))
    except Exception:
        return default


def parse_int(x: Any, default: int = 0) -> int:
    s = _s(x)
    if not s:
        return default
    try:
        return int(float(s.replace(",", "")))
    except Exception:
        return default


def parse_json_list(s: Any) -> Optional[List]:
    s = _s(s)
    if not s:
        return None
    try:
        val = json.loads(s)
        return val if isinstance(val, list) else None
    except Exception:
        return None


def build_selling_units_json(scale_unit: str, selling_price: float, raw_units: Any) -> str:
    units = parse_json_list(raw_units)
    if not units:
        return json.dumps([{"unit": scale_unit, "conversion": 1, "price": selling_price}], ensure_ascii=False)

    cleaned: List[Dict[str, Any]] = []
    for u in units:
        if not isinstance(u, dict):
            continue
        unit = _s(u.get("unit")) or scale_unit
        conversion = parse_int(u.get("conversion"), 1)
        price = parse_float(u.get("price"), selling_price)
        cleaned.append({"unit": unit, "conversion": conversion, "price": price})

    if not cleaned:
        cleaned = [{"unit": scale_unit, "conversion": 1, "price": selling_price}]

    return json.dumps(cleaned, ensure_ascii=False)


def default_out_path(in_path: str) -> str:
    base = os.path.splitext(os.path.basename(in_path))[0]
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    return f"{base}_processed_{ts}.csv"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--in", dest="in_path", required=True, help="Input raw CSV path")
    ap.add_argument("--out", dest="out_path", default=None, help="Output processed CSV path")
    ap.add_argument("--default-scale", default="item", help="If scale missing, use this (default: item)")
    args = ap.parse_args()

    in_path = args.in_path
    out_path = args.out_path or default_out_path(in_path)

    with open(in_path, "r", newline="", encoding="utf-8-sig") as f_in:
        reader = csv.DictReader(f_in)
        if not reader.fieldnames:
            raise SystemExit("Input CSV has no header row.")

        with open(out_path, "w", newline="", encoding="utf-8") as f_out:
            writer = csv.DictWriter(f_out, fieldnames=OUT_FIELDS, quoting=csv.QUOTE_MINIMAL)
            writer.writeheader()

            for row in reader:
                name = first_nonempty(row, ALIASES["name"])
                sku = first_nonempty(row, ALIASES["sku"])
                category = first_nonempty(row, ALIASES["category"]) or "Uncategorized"
                description = first_nonempty(row, ALIASES["description"])

                selling_price = parse_float(first_nonempty(row, ALIASES["selling_price"]), 0.0)
                cost_price = parse_float(first_nonempty(row, ALIASES["cost_price"]), 0.0)
                quantity = parse_int(first_nonempty(row, ALIASES["quantity"]), 0)

                # ✅ read scale from CSV (your requirement)
                scale_unit = first_nonempty(row, ALIASES["scale"]) or args.default_scale

                # output base_unit = scale
                base_unit = scale_unit

                # forced: variations off
                has_variations = "false"
                variation_attributes = "[]"

                raw_units = first_nonempty(row, ALIASES["selling_units_json"])
                selling_units_json = build_selling_units_json(scale_unit, selling_price, raw_units)

                writer.writerow({
                    "name": name,
                    "sku": sku,
                    "category": category,
                    "description": description,
                    "selling_price": selling_price,
                    "cost_price": cost_price,
                    "quantity": quantity,
                    "base_unit": base_unit,
                    "has_variations": has_variations,
                    "variation_attributes": variation_attributes,
                    "selling_units_json": selling_units_json,
                })

    print(f"✅ Processed CSV created: {out_path}")


if __name__ == "__main__":
    main()
