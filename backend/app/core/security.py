from datetime import datetime, timedelta
from typing import Optional, Union, Any, Dict
from jose import jwt
from passlib.context import CryptContext
from app.core.config import settings

# pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
pwd_context = CryptContext(schemes=["argon2"], deprecated="auto")

def create_access_token(
    subject: Union[str, Any],
    expires_delta: Optional[timedelta] = None,
    claims: Optional[Dict[str, Any]] = None,
) -> str:
    to_encode = {"sub": str(subject)}

    if expires_delta:
        expire = datetime.utcnow() + expires_delta
        to_encode["exp"] = expire
    elif settings.ACCESS_TOKEN_EXPIRE_MINUTES > 0:
        expire = datetime.utcnow() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
        to_encode["exp"] = expire

    if claims:
        to_encode.update(claims)
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    return encoded_jwt

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)
