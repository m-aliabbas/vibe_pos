from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import Literal, Optional
from pathlib import Path

class Settings(BaseSettings):
    PROJECT_NAME: str = "VibePOS"
    API_V1_STR: str = "/api/v1"

    # Store branding
    STORE_NAME: str = "MyStore"
    STORE_ADDRESS: str = "Gulberg Islamabad"
    
    # Runtime data remains app-owned even when the transactional database is remote.
    DATA_DIR: str = "data"
    DATABASE_PROVIDER: Literal["sqlite", "postgresql", "mysql"] = "sqlite"
    DATABASE_URL: Optional[str] = None
    DATABASE_CONNECT_TIMEOUT: int = 10
    DATABASE_POOL_SIZE: int = 5
    DATABASE_MAX_OVERFLOW: int = 10
    DATABASE_POOL_RECYCLE_SECONDS: int = 1800
    DATABASE_SSL_MODE: Optional[str] = None
    DATABASE_SSL_CA: Optional[str] = None
    DATABASE_MAINTENANCE_MODE: bool = False
    # WhatsApp
    WHATSAPP_PHONE: Optional[str] = None

    @model_validator(mode="after")
    def validate_database_configuration(self):
        url = self.DATABASE_URL
        if self.DATABASE_PROVIDER == "sqlite":
            if url and not url.startswith("sqlite:///"):
                raise ValueError("DATABASE_URL must use sqlite:/// when DATABASE_PROVIDER=sqlite")
            return self

        if not url:
            raise ValueError(
                f"DATABASE_URL is required when DATABASE_PROVIDER={self.DATABASE_PROVIDER}"
            )
        expected = "postgresql" if self.DATABASE_PROVIDER == "postgresql" else "mysql"
        if not url.startswith(f"{expected}+") and not url.startswith(f"{expected}://"):
            raise ValueError(
                f"DATABASE_URL does not match DATABASE_PROVIDER={self.DATABASE_PROVIDER}"
            )
        return self

    @property
    def resolved_database_url(self) -> str:
        if self.DATABASE_URL:
            return self.DATABASE_URL
        return f"sqlite:///{Path(self.DATA_DIR).resolve() / 'pos.db'}"
    
    # Security
    SECRET_KEY: str = "vibe_pos_1234"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 0

    # License / Firebase
    LICENSE_ENFORCEMENT: bool = True
    FIREBASE_CREDENTIALS_PATH: Optional[str] = './k1.json'
    FIREBASE_CREDENTIALS_ENC_PATH: Optional[str] = './k1.json.enc'
    FIREBASE_CREDENTIALS_KEY: Optional[str] = 'EhKGefoVJZoKmg1ikyTppKbmryLi5DcvJcjIUx3zw40='
    FIREBASE_PROJECT_ID: Optional[str] = 'vibepos-4d412'
    FIREBASE_LICENSE_COLLECTION: str = "lisence_pos"
    LICENSE_AUTO_REGISTER: bool = True
    LICENSE_CACHE_PATH: Optional[str] = None
    LICENSE_CACHE_KEY: Optional[str] = None
    
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

settings = Settings()

# Ensure data directory exists
Path(settings.DATA_DIR).mkdir(parents=True, exist_ok=True)
