from sqlalchemy import Boolean, Column, Integer, String as SQLString, Enum
from app.db.session import Base
import enum

String = SQLString(255)

class UserRole(str, enum.Enum):
    ADMIN = "admin"
    CASHIER = "cashier"

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    email = Column(String, unique=True, index=True, nullable=True)
    hashed_password = Column(String)
    role = Column(String, default=UserRole.CASHIER)
    is_active = Column(Boolean, default=True)
