import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models import Availability, PublicationStatus


class ProductBase(BaseModel):
    slug: str = Field(pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$", max_length=160)
    title: str = Field(min_length=2, max_length=200)
    description: str = Field(min_length=2)
    measure: str = Field(min_length=1, max_length=200)
    price: Decimal | None = Field(default=None, ge=0, decimal_places=2)
    currency: str = Field(default="ARS", min_length=3, max_length=3)
    availability: Availability = Availability.MADE_TO_ORDER
    status: PublicationStatus = PublicationStatus.DRAFT

    @field_validator("currency")
    @classmethod
    def uppercase_currency(cls, value: str) -> str:
        return value.upper()


class ProductCreate(ProductBase):
    pass


class ProductUpdate(BaseModel):
    slug: str | None = Field(default=None, pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$", max_length=160)
    title: str | None = Field(default=None, min_length=2, max_length=200)
    description: str | None = Field(default=None, min_length=2)
    measure: str | None = Field(default=None, min_length=1, max_length=200)
    price: Decimal | None = Field(default=None, ge=0, decimal_places=2)
    currency: str | None = Field(default=None, min_length=3, max_length=3)
    availability: Availability | None = None
    status: PublicationStatus | None = None


class ProductImageRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    url: str
    alt_text: str
    position: int
    is_primary: bool
    width: int
    height: int
    content_type: str


class ProductRead(ProductBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    images: list[ProductImageRead]
    created_at: datetime
    updated_at: datetime


class ImageUpdate(BaseModel):
    alt_text: str | None = Field(default=None, max_length=300)
    position: int | None = Field(default=None, ge=0)


class ImageOrderItem(BaseModel):
    id: uuid.UUID
    position: int = Field(ge=0)


class ImageOrderUpdate(BaseModel):
    images: list[ImageOrderItem]
