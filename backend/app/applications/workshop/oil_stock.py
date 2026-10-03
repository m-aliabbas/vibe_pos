"""Open-bottle oil stock logic: sealed containers plus litres in opened containers."""
from __future__ import annotations

import calendar
from datetime import date, datetime

from app.models.workshop import OilProduct

_EPS = 1e-6


class InsufficientOilStock(ValueError):
    pass


def total_litres(oil: OilProduct) -> float:
    return round((oil.open_litres or 0.0) + (oil.sealed_containers or 0) * oil.container_litres, 3)


def consume(oil: OilProduct, litres: float, now: datetime | None = None) -> None:
    """Draw from the open container first; open a sealed one only when needed."""
    if litres <= 0:
        raise ValueError("Litres must be positive")
    if total_litres(oil) + _EPS < litres:
        raise InsufficientOilStock(
            f"Only {total_litres(oil):g} L of {oil.name} in stock, {litres:g} L requested"
        )
    need = round(litres, 3)
    open_litres = oil.open_litres or 0.0
    sealed = oil.sealed_containers or 0
    while need > _EPS:
        if open_litres <= _EPS:
            sealed -= 1
            open_litres = oil.container_litres
            oil.opened_at = now
        taken = min(open_litres, need)
        open_litres = round(open_litres - taken, 3)
        need = round(need - taken, 3)
    if open_litres <= _EPS:
        open_litres = 0.0
        oil.opened_at = None
    oil.sealed_containers = sealed
    oil.open_litres = open_litres


def restore(oil: OilProduct, litres: float) -> None:
    """Return litres to stock (e.g. a removed job line); full containers become sealed again."""
    open_litres = round((oil.open_litres or 0.0) + litres, 3)
    sealed = oil.sealed_containers or 0
    while open_litres + _EPS >= oil.container_litres:
        open_litres = round(open_litres - oil.container_litres, 3)
        sealed += 1
    oil.sealed_containers = sealed
    oil.open_litres = max(open_litres, 0.0)


def add_months(start: date, months: int) -> date:
    index = start.month - 1 + months
    year, month = start.year + index // 12, index % 12 + 1
    return date(year, month, min(start.day, calendar.monthrange(year, month)[1]))
