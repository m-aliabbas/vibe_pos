from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import MetaData, Table, func, inspect, select, text
from sqlalchemy.engine import Connection, Engine


PROTECTED_TOTALS = {
    "products": ("quantity",),
    "product_variations": ("quantity",),
    "stock_batches": ("quantity_received", "quantity_remaining"),
    "customers": ("outstanding_balance", "opening_balance"),
    "vendors": ("opening_balance", "prepaid_credit"),
}


@dataclass(frozen=True)
class IntegritySnapshot:
    values: dict[str, int | float]


def capture_integrity_snapshot(bind: Engine | Connection) -> IntegritySnapshot:
    inspector = inspect(bind)
    table_names = set(inspector.get_table_names())
    metadata = MetaData()
    values: dict[str, int | float] = {}
    connection = bind.connect() if isinstance(bind, Engine) else bind
    owns_connection = connection is not bind
    try:
        for name in sorted(table_names - {"schema_migrations"}):
            table = Table(name, metadata, autoload_with=connection)
            values[f"rows:{name}"] = int(
                connection.execute(select(func.count()).select_from(table)).scalar_one()
            )
            for column_name in PROTECTED_TOTALS.get(name, ()):
                if column_name in table.c:
                    value = connection.execute(
                        select(func.coalesce(func.sum(table.c[column_name]), 0))
                    ).scalar_one()
                    values[f"sum:{name}.{column_name}"] = float(value or 0)
    finally:
        if owns_connection:
            connection.close()
    return IntegritySnapshot(values)


def compare_integrity_snapshots(
    source: IntegritySnapshot,
    target: IntegritySnapshot,
) -> dict[str, tuple[int | float, int | float | None]]:
    return {
        key: (value, target.values.get(key))
        for key, value in source.values.items()
        if target.values.get(key) != value
    }


def assert_journals_balanced(bind: Engine | Connection) -> None:
    inspector = inspect(bind)
    if not {"journal_entries", "journal_lines"}.issubset(inspector.get_table_names()):
        return
    connection = bind.connect() if isinstance(bind, Engine) else bind
    owns_connection = connection is not bind
    try:
        row = connection.execute(
            text(
                """
                SELECT je.id
                FROM journal_entries je
                JOIN journal_lines jl ON jl.entry_id = je.id
                GROUP BY je.id
                HAVING ABS(COALESCE(SUM(jl.debit), 0) - COALESCE(SUM(jl.credit), 0)) > 0.005
                """
            )
        ).first()
        if row:
            raise RuntimeError(f"Journal entry {row[0]} is not balanced")
    finally:
        if owns_connection:
            connection.close()
