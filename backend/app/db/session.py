from sqlalchemy.orm import sessionmaker, declarative_base
from app.core.config import settings
from app.db.providers import create_provider

provider = create_provider(settings)
engine = provider.create_engine()

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
