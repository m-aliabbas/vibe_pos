from __future__ import annotations

import sqlite3

from app.db.migrations.registry import MIGRATIONS as PLATFORM_MIGRATIONS
from app.db.migrations.registry import Migration


def create_workshop_oil_change_schema(connection: sqlite3.Connection) -> None:
    connection.executescript(
        """
        CREATE TABLE IF NOT EXISTS workshop_vehicles (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            customer_id INTEGER NOT NULL REFERENCES customers(id),
            vehicle_id VARCHAR(64) NOT NULL UNIQUE,
            registration_number VARCHAR(64) UNIQUE,
            make VARCHAR(120),
            model VARCHAR(120),
            model_year INTEGER,
            engine VARCHAR(120),
            current_mileage INTEGER,
            next_oil_change_mileage INTEGER,
            last_oil_change_at DATETIME,
            created_at DATETIME NOT NULL,
            updated_at DATETIME NOT NULL
        );

        CREATE INDEX IF NOT EXISTS ix_workshop_vehicles_customer_id
            ON workshop_vehicles(customer_id);
        CREATE INDEX IF NOT EXISTS ix_workshop_vehicles_vehicle_id
            ON workshop_vehicles(vehicle_id);
        CREATE INDEX IF NOT EXISTS ix_workshop_vehicles_registration_number
            ON workshop_vehicles(registration_number);
        CREATE INDEX IF NOT EXISTS ix_workshop_vehicles_next_oil_change_mileage
            ON workshop_vehicles(next_oil_change_mileage);

        CREATE TABLE IF NOT EXISTS workshop_jobs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            job_number VARCHAR(64) NOT NULL UNIQUE,
            vehicle_id INTEGER NOT NULL REFERENCES workshop_vehicles(id),
            customer_id INTEGER NOT NULL REFERENCES customers(id),
            technician_id INTEGER REFERENCES users(id),
            sale_id INTEGER UNIQUE REFERENCES sales(id),
            status VARCHAR(32) NOT NULL DEFAULT 'open',
            previous_mileage INTEGER,
            current_mileage INTEGER NOT NULL,
            oil_change_interval INTEGER NOT NULL,
            next_oil_change_mileage INTEGER NOT NULL,
            notes TEXT,
            subtotal FLOAT NOT NULL DEFAULT 0,
            discount FLOAT NOT NULL DEFAULT 0,
            tax FLOAT NOT NULL DEFAULT 0,
            total FLOAT NOT NULL DEFAULT 0,
            payment_method VARCHAR(32),
            amount_paid FLOAT NOT NULL DEFAULT 0,
            amount_due FLOAT NOT NULL DEFAULT 0,
            created_at DATETIME NOT NULL,
            completed_at DATETIME,
            updated_at DATETIME NOT NULL
        );

        CREATE INDEX IF NOT EXISTS ix_workshop_jobs_job_number ON workshop_jobs(job_number);
        CREATE INDEX IF NOT EXISTS ix_workshop_jobs_vehicle_id ON workshop_jobs(vehicle_id);
        CREATE INDEX IF NOT EXISTS ix_workshop_jobs_customer_id ON workshop_jobs(customer_id);
        CREATE INDEX IF NOT EXISTS ix_workshop_jobs_status ON workshop_jobs(status);
        CREATE INDEX IF NOT EXISTS ix_workshop_jobs_next_oil_change_mileage
            ON workshop_jobs(next_oil_change_mileage);
        CREATE INDEX IF NOT EXISTS ix_workshop_jobs_created_at ON workshop_jobs(created_at);

        CREATE TABLE IF NOT EXISTS workshop_job_lines (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            job_id INTEGER NOT NULL REFERENCES workshop_jobs(id) ON DELETE CASCADE,
            product_id INTEGER NOT NULL REFERENCES products(id),
            variation_id INTEGER REFERENCES product_variations(id),
            description VARCHAR(255) NOT NULL,
            quantity FLOAT NOT NULL,
            unit VARCHAR(64) NOT NULL,
            unit_price FLOAT NOT NULL,
            item_discount FLOAT NOT NULL DEFAULT 0,
            total_price FLOAT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS ix_workshop_job_lines_job_id
            ON workshop_job_lines(job_id);
        """
    )


MIGRATIONS: tuple[Migration, ...] = PLATFORM_MIGRATIONS + (
    Migration(
        migration_id="0007_workshop_oil_change",
        description="Create workshop vehicles, oil-change jobs, and job lines",
        apply=create_workshop_oil_change_schema,
    ),
)
