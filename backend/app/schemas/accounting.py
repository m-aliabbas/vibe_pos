from datetime import datetime, date
from typing import List, Optional
from pydantic import BaseModel


class AccountBase(BaseModel):
    code: str
    name: str
    type: str
    is_active: bool = True


class AccountCreate(AccountBase):
    pass


class Account(AccountBase):
    id: int
    is_system: bool
    created_at: datetime

    class Config:
        from_attributes = True


class JournalLineCreate(BaseModel):
    account_id: Optional[int] = None
    account_code: Optional[str] = None
    debit: float = 0.0
    credit: float = 0.0
    memo: Optional[str] = None


class JournalEntryCreate(BaseModel):
    entry_date: Optional[datetime] = None
    description: str
    source_type: Optional[str] = None
    source_id: Optional[int] = None
    lines: List[JournalLineCreate]


class JournalLine(BaseModel):
    id: int
    account_id: int
    debit: float
    credit: float
    memo: Optional[str] = None
    account: Optional[Account] = None

    class Config:
        from_attributes = True


class JournalEntry(BaseModel):
    id: int
    entry_date: datetime
    description: str
    source_type: Optional[str]
    source_id: Optional[int]
    created_by: Optional[int]
    created_at: datetime
    lines: List[JournalLine]

    class Config:
        from_attributes = True


class TrialBalanceLine(BaseModel):
    account_id: int
    code: str
    name: str
    account_type: str
    debit: float
    credit: float
    balance: float


class TrialBalanceReport(BaseModel):
    as_of: Optional[date]
    total_debits: float
    total_credits: float
    lines: List[TrialBalanceLine]
