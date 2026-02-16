from pydantic_settings import BaseSettings
from typing import Optional
from pathlib import Path

class Settings(BaseSettings):
    PROJECT_NAME: str = "VibePOS"
    API_V1_STR: str = "/api/v1"

    # Store branding
    STORE_NAME: str = "MyStore"
    STORE_ADDRESS: str = "Gulberg Islamabad"
    
    # Database
    # Data Directory
    DATA_DIR: str = "data"
    # WhatsApp
    WHATSAPP_PHONE: Optional[str] = None

    @property
    def DATABASE_URL(self) -> str:
        return f"sqlite:///{self.DATA_DIR}/pos.db"
    
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
    
    class Config:
        env_file = ".env"

settings = Settings()

# Ensure data directory exists
Path(settings.DATA_DIR).mkdir(parents=True, exist_ok=True)
