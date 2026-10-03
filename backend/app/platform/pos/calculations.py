from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal, ROUND_HALF_UP
from typing import Mapping, Sequence


_CURRENCY_QUANTUM = Decimal("0.01")


@dataclass(frozen=True)
class SaleLineCalculation:
    unit_price: float
    quantity: float
    quantity_in_base_units: float
    item_discount: float
    total_price: float


@dataclass(frozen=True)
class SaleTotals:
    subtotal: float
    total: float


def convert_to_base_quantity(
    quantity: float,
    *,
    unit: str,
    base_unit: str,
    selling_units: Sequence[Mapping[str, object]],
    product_name: str,
) -> float:
    if unit == base_unit:
        return float(quantity)

    selling_unit = next((entry for entry in selling_units if entry.get("unit") == unit), None)
    if selling_unit is None:
        raise ValueError(f"Unit '{unit}' not configured for product {product_name}")

    try:
        conversion = Decimal(str(selling_unit["conversion"]))
        converted_quantity = Decimal(str(quantity)) * conversion
    except (KeyError, ArithmeticError, ValueError) as error:
        raise ValueError(f"Invalid conversion for unit '{unit}' on product {product_name}") from error
    return float(converted_quantity)


def calculate_sale_line(
    *,
    quantity: float,
    unit: str,
    base_unit: str,
    base_price: float,
    selling_units: Sequence[Mapping[str, object]],
    product_name: str,
    item_discount: float = 0.0,
    unit_price_override: float | None = None,
) -> SaleLineCalculation:
    quantity_in_base_units = convert_to_base_quantity(
        quantity,
        unit=unit,
        base_unit=base_unit,
        selling_units=selling_units,
        product_name=product_name,
    )
    unit_price = unit_price_override if unit_price_override is not None else base_price
    if unit != base_unit and unit_price_override is None:
        selling_unit = next(entry for entry in selling_units if entry.get("unit") == unit)
        unit_price = float(selling_unit["price"])
    line_total = Decimal(str(unit_price)) * Decimal(str(quantity)) - Decimal(str(item_discount))
    return SaleLineCalculation(
        unit_price=float(unit_price),
        quantity=float(quantity),
        quantity_in_base_units=quantity_in_base_units,
        item_discount=float(item_discount),
        total_price=float(_round_currency(line_total)),
    )


def _round_currency(amount: Decimal) -> Decimal:
    return amount.quantize(_CURRENCY_QUANTUM, rounding=ROUND_HALF_UP)


def calculate_sale_totals(
    lines: Sequence[SaleLineCalculation],
    *,
    discount: float = 0.0,
    tax: float = 0.0,
    delivery_charges: float = 0.0,
) -> SaleTotals:
    subtotal = _round_currency(sum((Decimal(str(line.total_price)) for line in lines), Decimal("0")))
    total = _round_currency(
        subtotal - Decimal(str(discount)) + Decimal(str(tax)) + Decimal(str(delivery_charges))
    )
    return SaleTotals(subtotal=float(subtotal), total=float(total))
