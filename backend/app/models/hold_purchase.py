from sqlalchemy import Column, Integer, String as SQLString, DateTime, ForeignKey, JSON
from sqlalchemy.orm import relationship
from datetime import datetime
from app.db.session import Base
from app.core.timezone import now_pkt

String = SQLString(255)


class HoldPurchase(Base):
    __tablename__ = "hold_purchases"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    label = Column(String, nullable=True)
    payload = Column(JSON, nullable=False)
    created_at = Column(DateTime, default=now_pkt, index=True)
    updated_at = Column(DateTime, default=now_pkt, onupdate=now_pkt)

    user = relationship("User", backref="hold_purchases")
