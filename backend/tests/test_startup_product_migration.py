import sqlite3
from pathlib import Path

from run_server import ensure_legacy_product_columns
from sqlalchemy import create_engine
from sqlalchemy.orm import Session


def test_legacy_product_is_readable_before_seeding(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    from app.models.product import Product
    from app.models.user import User
    from seed import is_seeded

    db_path = tmp_path / "pos.db"
    engine = create_engine(f"sqlite:///{db_path}")
    User.__table__.create(engine)
    Product.__table__.create(engine)
    with engine.begin() as connection:
        connection.exec_driver_sql(
            "INSERT INTO users (username, hashed_password) VALUES ('admin', 'hash')"
        )
        connection.exec_driver_sql("ALTER TABLE products DROP COLUMN sale_blocked")
        connection.exec_driver_sql(
            "INSERT INTO products (id, name) VALUES (1, 'Existing product')"
        )

    ensure_legacy_product_columns(db_path)
    ensure_legacy_product_columns(db_path)

    with Session(engine) as session:
        assert is_seeded(session)
        product = session.query(Product).filter_by(id=1).one()
        assert product.name == "Existing product"
        assert product.sale_blocked is False

    with sqlite3.connect(db_path) as connection:
        connection.execute("UPDATE products SET sale_blocked = 1 WHERE id = 1")
    ensure_legacy_product_columns(db_path)
    with sqlite3.connect(db_path) as connection:
        assert connection.execute(
            "SELECT name, sale_blocked FROM products WHERE id = 1"
        ).fetchone() == ("Existing product", 1)

    engine.dispose()
