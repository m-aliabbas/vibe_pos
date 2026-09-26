from __future__ import annotations

from sqlalchemy.ext.compiler import compiles
from sqlalchemy.sql.functions import FunctionElement
from sqlalchemy.types import String


class report_period(FunctionElement):
    """Portable day/week/month reporting bucket in Pakistan local business time."""

    type = String()
    # ``period`` changes emitted SQL and is not a SQL expression child.
    inherit_cache = False

    def __init__(self, expression, period: str):
        if period not in {"daily", "weekly", "monthly"}:
            raise ValueError(f"Unsupported report period: {period}")
        self.period = period
        super().__init__(expression)


def _expression(element, compiler, **kwargs) -> str:
    return compiler.process(list(element.clauses)[0], **kwargs)


@compiles(report_period, "sqlite")
def _sqlite_period(element, compiler, **kwargs):
    value = _expression(element, compiler, **kwargs)
    if element.period == "daily":
        return f"strftime('%Y-%m-%d', {value})"
    if element.period == "monthly":
        return f"strftime('%Y-%m', {value})"
    return (
        f"strftime('%Y-%m-%d', date({value}, "
        f"'-' || ((CAST(strftime('%w', {value}) AS INTEGER) + 6) % 7) || ' days'))"
    )


@compiles(report_period, "postgresql")
def _postgresql_period(element, compiler, **kwargs):
    value = _expression(element, compiler, **kwargs)
    if element.period == "daily":
        return f"to_char(date_trunc('day', {value}), 'YYYY-MM-DD')"
    if element.period == "monthly":
        return f"to_char(date_trunc('month', {value}), 'YYYY-MM')"
    return f"to_char(date_trunc('week', {value}), 'YYYY-MM-DD')"


@compiles(report_period, "mysql")
def _mysql_period(element, compiler, **kwargs):
    value = _expression(element, compiler, **kwargs)
    if element.period == "daily":
        return f"DATE_FORMAT({value}, '%%Y-%%m-%%d')"
    if element.period == "monthly":
        return f"DATE_FORMAT({value}, '%%Y-%%m')"
    return f"DATE_FORMAT(DATE_SUB(DATE({value}), INTERVAL WEEKDAY({value}) DAY), '%%Y-%%m-%%d')"
