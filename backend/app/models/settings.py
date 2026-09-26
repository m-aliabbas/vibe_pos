from sqlalchemy import Column, Integer, String as SQLString
from app.db.session import Base

String = SQLString(255)


class StoreSettings(Base):
    __tablename__ = "store_settings"

    id = Column(Integer, primary_key=True, default=1)
    store_name = Column(String, default="My Store")
    store_address = Column(String, default="")
    store_phone = Column(String, default="")
    store_email = Column(String, default="")
    store_city = Column(String, default="")
    store_tax_id = Column(String, default="")
    store_website = Column(String, default="")
