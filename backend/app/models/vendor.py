from sqlalchemy import Column, Integer, String, Float
from app.db.session import Base

class Vendor(Base):
    __tablename__ = "vendors"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True, unique=True)
    contact_name = Column(String, nullable=True)
    email = Column(String, nullable=True)
    phone = Column(String, nullable=True)
    address = Column(String, nullable=True)
    prepaid_credit = Column(Float, default=0.0)  # Track overpayments/advances
