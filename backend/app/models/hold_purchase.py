from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, JSON
from sqlalchemy.orm import relationship
from datetime import datetime
from app.db.session import Base


class HoldPurchase(Base):
    __tablename__ = "hold_purchases"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    label = Column(String, nullable=True)
    payload = Column(JSON, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = relationship("User", backref="hold_purchases")