from pydantic_settings import BaseSettings
from typing import Optional
from pathlib import Path

class Settings(BaseSettings):
    PROJECT_NAME: str = "POS System"
    API_V1_STR: str = "/api/v1"
    
    # Database
    # Data Directory
    DATA_DIR: str = "data"

    @property
    def DATABASE_URL(self) -> str:
        return f"sqlite:///{self.DATA_DIR}/pos.db"
    
    # Security
    SECRET_KEY: str = "your-super-secret-key-change-this-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30

    # License / Firebase
    LICENSE_ENFORCEMENT: bool = False
    FIREBASE_CREDENTIALS_PATH: Optional[str] = './k1.json'
    FIREBASE_PROJECT_ID: Optional[str] = 'posapplication-742cd'
    FIREBASE_LICENSE_COLLECTION: str = "licenses"
    LICENSE_AUTO_REGISTER: bool = True
    
    class Config:
        env_file = ".env"

settings = Settings()

# Ensure data directory exists
Path(settings.DATA_DIR).mkdir(parents=True, exist_ok=True)
