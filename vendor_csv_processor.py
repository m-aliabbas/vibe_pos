# customer_csv_processor.py
# Usage:
#   python customer_csv_processor.py --in customers_creditors.csv --out customers_processed.csv
#
# Output columns:
#   phone, customer_id, name, email, address, opening_balance
#
# Rules:
# - phone: prefer mobile column (mobile no / MobileNo / phone num), else phone column (PhoneNo / phone no)
# - customer_id: from CSV if present, else auto-generate:
#       - if phone exists: CUST<last8digits_of_phone>
#       - else: CUST000001, CUST000002, ...
# - email: email/email_address aliases; missing -> ""
# - address: Address + Area + City combined (deduped)
# - opening_balance: if present -> float, else 0

import argparse
import csv
import os
import re
from datetime import datetime
from typing import Any, Dict, List


OUT_FIELDS = ["phone", "customer_id", "name", "email", "address", "opening_balance"]

ALIASES = {
    "name": [
        "name", "customer_name", "customer", "party", "vendor", "supplier",
        "accounttitle", "account_title", "AccountTitle",
        "contactperson", "contact_person", "ContactPerson",
    ],
    "customer_id": [
        "customer_id", "customerid", "id", "code",
        "accountcode", "account_code", "AccountCode",
        "accountid", "account_id", "AccountId","PhoneNo",
    ],
    # phone priority: mobile first, then phone
    "mobile": [
        "mobile", "mobile_no", "mobileno", "mobile number", "mobile_number",
        "MobileNo", "Mobile",
        "phone num", "phone_num", "phone-number",
    ],
    "phone": [
        "mobile", "mobile_no", "mobileno", "mobile number", "mobile_number",
        "MobileNo", "Mobile",
        "phone num", "phone_num", "phone-number",
    ],
    "email": ["email", "email_address", "emailaddress", "Email", "EmailAddress", "e-mail", "mail"],
    "address": ["address", "addrress", "addr", "Address", "location", "full_address"],
    "area": ["area", "Area", "town", "block"],
    "city": ["city", "City"],
    "opening_balance": [
        "opening_balance", "openingbalance", "opening", "opening bal", "op_balance",
        "opening_balance_amount", "OpeningBalance", "Opening_Balance"
    ],
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


def normalize_phone(x: Any) -> str:
    s = _s(x)
    if not s:
        return ""
    # keep digits only
    return re.sub(r"\D+", "", s)


def build_address(row: Dict[str, Any]) -> str:
    addr = first_nonempty(row, ALIASES["address"])
    area = first_nonempty(row, ALIASES["area"])
    city = first_nonempty(row, ALIASES["city"])

    parts = [_s(p) for p in [addr, area, city] if _s(p)]
    # de-duplicate (case-insensitive) while keeping order
    seen = set()
    out = []
    for p in parts:
        key = p.lower()
        if key in seen:
            continue
        seen.add(key)
        out.append(p)
    return ", ".join(out)


def default_out_path(in_path: str) -> str:
    base = os.path.splitext(os.path.basename(in_path))[0]
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    return f"{base}_customers_processed_{ts}.csv"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--in", dest="in_path", required=True, help="Input raw CSV path")
    ap.add_argument("--out", dest="out_path", default=None, help="Output processed CSV path")
    ap.add_argument("--default-opening-balance", type=float, default=0.0, help="Default opening_balance if missing")
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

            for idx, row in enumerate(reader, start=1):
                mobile = first_nonempty(row, ALIASES["mobile"])
                phone = first_nonempty(row, ALIASES["phone"])
                phone_out = normalize_phone(mobile or phone)

                name = first_nonempty(row, ALIASES["name"])
                email = first_nonempty(row, ALIASES["email"])
                address = build_address(row)

                opening_balance = parse_float(
                    first_nonempty(row, ALIASES["opening_balance"]),
                    args.default_opening_balance,
                )

                customer_id = first_nonempty(row, ALIASES["customer_id"])
                if not customer_id:
                    if phone_out:
                        customer_id = f"CUST{phone_out[-8:]}"
                    else:
                        customer_id = f"CUST{idx:06d}"

                writer.writerow(
                    {
                        "phone": phone_out,
                        "customer_id": customer_id,
                        "name": name,
                        "email": email,
                        "address": address,
                        "opening_balance": opening_balance,
                    }
                )

    print(f"✅ Processed customers CSV created: {out_path}")


if __name__ == "__main__":
    main()
