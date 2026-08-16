from fastapi import Depends
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.database import get_session
from app.services import ProductService
from app.storage import MinioStorage


def get_product_service(
    session: Session = Depends(get_session), settings: Settings = Depends(get_settings)
) -> ProductService:
    return ProductService(session, MinioStorage(settings))
