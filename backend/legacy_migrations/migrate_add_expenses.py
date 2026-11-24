"""Create the expenses table for existing VibePOS SQLite databases."""
import os
import sqlite3


DB_PATH = os.path.join(os.path.dirname(__file__), "data", "pos.db")


def migrate(db_path: str = DB_PATH) -> None:
    connection = sqlite3.connect(db_path)
    try:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS expenses (
                id INTEGER PRIMARY KEY,
                expense_date DATETIME NOT NULL,
                account_id INTEGER NOT NULL,
                amount REAL NOT NULL,
                description VARCHAR NOT NULL,
                payment_method VARCHAR NOT NULL DEFAULT 'cash',
                created_by INTEGER,
                journal_entry_id INTEGER UNIQUE,
                created_at DATETIME NOT NULL,
                FOREIGN KEY(account_id) REFERENCES accounts(id),
                FOREIGN KEY(created_by) REFERENCES users(id),
                FOREIGN KEY(journal_entry_id) REFERENCES journal_entries(id)
            )
            """
        )
        connection.execute("CREATE INDEX IF NOT EXISTS ix_expenses_expense_date ON expenses (expense_date)")
        connection.execute("CREATE INDEX IF NOT EXISTS ix_expenses_account_id ON expenses (account_id)")
        connection.commit()
    finally:
        connection.close()


if __name__ == "__main__":
    migrate()