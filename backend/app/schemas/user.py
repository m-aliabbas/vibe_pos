from typing import Optional
from pydantic import BaseModel
from app.models.user import UserRole

class UserBase(BaseModel):
    username: str
    email: Optional[str] = None
    role: Optional[UserRole] = UserRole.CASHIER
    is_active: Optional[bool] = True

class UserCreate(UserBase):
    password: str

class UserUpdate(UserBase):
    password: Optional[str] = None


class UserUpdateSelf(BaseModel):
    """Schema for users updating their own profile"""
    username: Optional[str] = None
    email: Optional[str] = None
    password: Optional[str] = None

class UserInDBBase(UserBase):
    id: int
    
    class Config:
        from_attributes = True

class User(UserInDBBase):
    pass

class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    username: Optional[str] = None
