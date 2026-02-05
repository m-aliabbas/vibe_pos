from fastapi import APIRouter
from app.api.v1.endpoints import auth, users, vendors, products, purchases, sales, files, reports, whatsapp, customers, returns, backup

api_router = APIRouter()
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(users.router, prefix="/users", tags=["users"])
api_router.include_router(customers.router, prefix="/customers", tags=["customers"])
api_router.include_router(vendors.router, prefix="/vendors", tags=["vendors"])
api_router.include_router(products.router, prefix="/products", tags=["products"])
api_router.include_router(purchases.router, prefix="/purchases", tags=["purchases"])
api_router.include_router(sales.router, prefix="/sales", tags=["sales"])
api_router.include_router(returns.router, prefix="/returns", tags=["returns"])
api_router.include_router(files.router, tags=["files"])
api_router.include_router(reports.router, prefix="/reports", tags=["reports"])
api_router.include_router(whatsapp.router, tags=["whatsapp"])
api_router.include_router(backup.router, prefix="/backup", tags=["backup"])
