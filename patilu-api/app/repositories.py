import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.models import Product, PublicationStatus


class ProductRepository:
    def __init__(self, session: Session):
        self.session = session

    def list(self, *, published_only: bool = False) -> list[Product]:
        statement = select(Product).options(selectinload(Product.images)).order_by(Product.created_at.desc())
        if published_only:
            statement = statement.where(Product.status == PublicationStatus.PUBLISHED)
        return list(self.session.scalars(statement).unique())

    def get(self, product_id: uuid.UUID) -> Product | None:
        return self.session.scalar(
            select(Product).where(Product.id == product_id).options(selectinload(Product.images))
        )

    def get_by_slug(self, slug: str, *, published_only: bool = False) -> Product | None:
        statement = select(Product).where(Product.slug == slug).options(selectinload(Product.images))
        if published_only:
            statement = statement.where(Product.status == PublicationStatus.PUBLISHED)
        return self.session.scalar(statement)

    def add(self, product: Product) -> Product:
        self.session.add(product)
        self.session.flush()
        return product
