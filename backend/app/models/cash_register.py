from sqlalchemy import Column, Integer, String, Float, ForeignKey, DateTime
from sqlalchemy.orm import relationship
from app.db.session import Base
from app.core.timezone import now_pkt
import enum


class CashRegisterStatus(str, enum.Enum):
    OPEN = "open"
    CLOSED = "closed"


class CashRegisterSession(Base):
    """A cash drawer session: opening cash declared at login, closed out later
    with counted cash compared against expected cash from cash sales."""
    __tablename__ = "cash_register_sessions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)

    opening_cash = Column(Float, default=0.0)
    opened_at = Column(DateTime, default=now_pkt, index=True)

    closing_cash = Column(Float, nullable=True)
    expected_cash = Column(Float, nullable=True)
    difference = Column(Float, nullable=True)
    closed_at = Column(DateTime, nullable=True)

    status = Column(String, default=CashRegisterStatus.OPEN, index=True)
    notes = Column(String, nullable=True)

    user = relationship("User", backref="cash_register_sessions")
