import enum
import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import Boolean, CheckConstraint, DateTime, ForeignKey, Index, Integer, Numeric, String, Text, Uuid, func, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Availability(str, enum.Enum):
    AVAILABLE = "available"
    MADE_TO_ORDER = "made_to_order"
    RESERVED = "reserved"
    SOLD_OUT = "sold_out"


class PublicationStatus(str, enum.Enum):
    DRAFT = "draft"
    PUBLISHED = "published"
    HIDDEN = "hidden"
    DELETED = "deleted"


class Product(Base):
    __tablename__ = "products"
    __table_args__ = (
        CheckConstraint("price IS NULL OR price >= 0", name="ck_products_price_non_negative"),
        CheckConstraint(
            "availability IN ('available', 'made_to_order', 'reserved', 'sold_out')",
            name="ck_products_availability",
        ),
        CheckConstraint(
            "status IN ('draft', 'published', 'hidden', 'deleted')",
            name="ck_products_status",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    slug: Mapped[str] = mapped_column(String(160), unique=True)
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text)
    measure: Mapped[str] = mapped_column(String(200))
    price: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    currency: Mapped[str] = mapped_column(String(3), default="ARS")
    availability: Mapped[Availability] = mapped_column(String(32), default=Availability.MADE_TO_ORDER)
    status: Mapped[PublicationStatus] = mapped_column(String(32), default=PublicationStatus.DRAFT, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    images: Mapped[list["ProductImage"]] = relationship(
        back_populates="product", cascade="all, delete-orphan", order_by="ProductImage.position"
    )


class ProductImage(Base):
    __tablename__ = "product_images"
    __table_args__ = (
        Index(
            "uq_product_images_one_primary",
            "product_id",
            unique=True,
            postgresql_where=text("is_primary"),
            sqlite_where=text("is_primary = 1"),
        ),
        Index("ix_product_images_product_position", "product_id", "position"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    product_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("products.id", ondelete="CASCADE"), index=True)
    object_key: Mapped[str] = mapped_column(String(500), unique=True)
    alt_text: Mapped[str] = mapped_column(String(300), default="")
    position: Mapped[int] = mapped_column(Integer, default=0)
    is_primary: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    width: Mapped[int] = mapped_column(Integer)
    height: Mapped[int] = mapped_column(Integer)
    content_type: Mapped[str] = mapped_column(String(100), default="image/webp")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    product: Mapped[Product] = relationship(back_populates="images")
