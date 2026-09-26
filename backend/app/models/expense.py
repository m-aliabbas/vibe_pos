from sqlalchemy import Column, DateTime, Float, ForeignKey, Integer, String
from sqlalchemy.orm import relationship

from app.core.timezone import now_pkt
from app.db.session import Base


class Expense(Base):
    __tablename__ = "expenses"

    id = Column(Integer, primary_key=True, index=True)
    expense_date = Column(DateTime, default=now_pkt, nullable=False, index=True)
    account_id = Column(Integer, ForeignKey("accounts.id"), nullable=False, index=True)
    amount = Column(Float, nullable=False)
    description = Column(String, nullable=False)
    payment_method = Column(String, default="cash", nullable=False)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    journal_entry_id = Column(Integer, ForeignKey("journal_entries.id"), nullable=True, unique=True)
    created_at = Column(DateTime, default=now_pkt, nullable=False)

    account = relationship("Account")
    journal_entry = relationship("JournalEntry")

    @property
    def account_name(self):
        return self.account.name if self.account else "Expense"
