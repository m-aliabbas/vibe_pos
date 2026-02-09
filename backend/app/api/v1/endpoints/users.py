from typing import Any, List
from fastapi import APIRouter, Body, Depends, HTTPException
from fastapi.encoders import jsonable_encoder
from sqlalchemy.orm import Session
from app.api import deps
from app.core import security
from app.models.user import User
from app.schemas import user as user_schema

router = APIRouter()


def normalize_email(email: str | None) -> str | None:
    if email is None:
        return None
    normalized = email.strip()
    return normalized or None

@router.get("/", response_model=List[user_schema.User])
def read_users(
    db: Session = Depends(deps.get_db),
    skip: int = 0,
    limit: int = 100,
    current_user: User = Depends(deps.get_current_active_admin),
) -> Any:
    users = db.query(User).offset(skip).limit(limit).all()
    return users

@router.post("/", response_model=user_schema.User)
def create_user(
    *,
    db: Session = Depends(deps.get_db),
    user_in: user_schema.UserCreate,
    current_user: User = Depends(deps.get_current_active_admin),
) -> Any:
    user = db.query(User).filter(User.username == user_in.username).first()
    if user:
        raise HTTPException(
            status_code=400,
            detail="The user with this username already exists in the system.",
        )
    normalized_email = normalize_email(user_in.email)
    if normalized_email:
        existing = db.query(User).filter(User.email == normalized_email).first()
        if existing:
            raise HTTPException(status_code=400, detail="Email already taken")
    user = User(
        username=user_in.username,
        email=normalized_email,
        hashed_password=security.get_password_hash(user_in.password),
        role=user_in.role,
        is_active=user_in.is_active,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.get("/me", response_model=user_schema.User)
def get_current_user_info(
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """Get current logged-in user's profile"""
    return current_user


@router.put("/me", response_model=user_schema.User)
def update_current_user(
    *,
    db: Session = Depends(deps.get_db),
    user_in: user_schema.UserUpdateSelf,
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """Update current user's own profile"""
    user = db.query(User).filter(User.id == current_user.id).first()
    
    # Check if new username is taken
    if user_in.username and user_in.username != user.username:
        existing = db.query(User).filter(User.username == user_in.username).first()
        if existing:
            raise HTTPException(status_code=400, detail="Username already taken")
    
    user.username = user_in.username or user.username

    if user_in.email is not None:
        normalized_email = normalize_email(user_in.email)
        if normalized_email and normalized_email != user.email:
            existing = db.query(User).filter(User.email == normalized_email).first()
            if existing and existing.id != user.id:
                raise HTTPException(status_code=400, detail="Email already taken")
        user.email = normalized_email
    
    # Update password if provided
    if user_in.password:
        user.hashed_password = security.get_password_hash(user_in.password)
    
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.get("/{user_id}", response_model=user_schema.User)
def read_user(
    *,
    db: Session = Depends(deps.get_db),
    user_id: int,
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Users can only view their own profile, admins can view anyone
    if current_user.role != "admin" and current_user.id != user_id:
        raise HTTPException(status_code=403, detail="Not authorized to view this user")
    
    return user


@router.put("/{user_id}", response_model=user_schema.User)
def update_user(
    *,
    db: Session = Depends(deps.get_db),
    user_id: int,
    user_in: user_schema.UserUpdate,
    current_user: User = Depends(deps.get_current_active_admin),
) -> Any:
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Check if username is taken by another user
    if user_in.username and user_in.username != user.username:
        existing = db.query(User).filter(User.username == user_in.username).first()
        if existing:
            raise HTTPException(status_code=400, detail="Username already taken")
    
    # Update fields
    user.username = user_in.username or user.username

    if user_in.email is not None:
        normalized_email = normalize_email(user_in.email)
        if normalized_email and normalized_email != user.email:
            existing = db.query(User).filter(User.email == normalized_email).first()
            if existing and existing.id != user.id:
                raise HTTPException(status_code=400, detail="Email already taken")
        user.email = normalized_email
    user.role = user_in.role or user.role
    user.is_active = user_in.is_active if user_in.is_active is not None else user.is_active
    
    # Update password if provided
    if user_in.password:
        user.hashed_password = security.get_password_hash(user_in.password)
    
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.delete("/{user_id}")
def delete_user(
    *,
    db: Session = Depends(deps.get_db),
    user_id: int,
    current_user: User = Depends(deps.get_current_active_admin),
) -> Any:
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Prevent deleting yourself
    if current_user.id == user_id:
        raise HTTPException(status_code=400, detail="Cannot delete your own account")
    
    db.delete(user)
    db.commit()
    return {"message": "User deleted successfully"}