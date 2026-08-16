import uuid

from fastapi import HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import Product, ProductImage, PublicationStatus
from app.repositories import ProductRepository
from app.schemas import ImageOrderUpdate, ImageUpdate, ProductCreate, ProductRead, ProductUpdate
from app.storage import MAX_PRODUCT_IMAGES, ObjectStorage, process_image


class ProductService:
    def __init__(self, session: Session, storage: ObjectStorage):
        self.session = session
        self.storage = storage
        self.repository = ProductRepository(session)

    def serialize(self, product: Product) -> ProductRead:
        values = {column.name: getattr(product, column.name) for column in Product.__table__.columns}
        values["images"] = [
            {
                "id": image.id,
                "url": self.storage.public_url(image.object_key),
                "alt_text": image.alt_text,
                "position": image.position,
                "is_primary": image.is_primary,
                "width": image.width,
                "height": image.height,
                "content_type": image.content_type,
            }
            for image in sorted(product.images, key=lambda item: item.position)
        ]
        return ProductRead.model_validate(values)

    def list_products(self, *, published_only: bool = False) -> list[ProductRead]:
        return [self.serialize(product) for product in self.repository.list(published_only=published_only)]

    def get(self, product_id: uuid.UUID) -> Product:
        product = self.repository.get(product_id)
        if not product:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Producto no encontrado.")
        return product

    def get_by_slug(self, slug: str, *, published_only: bool = False) -> ProductRead:
        product = self.repository.get_by_slug(slug, published_only=published_only)
        if not product:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Producto no encontrado.")
        return self.serialize(product)

    def create(self, payload: ProductCreate) -> ProductRead:
        product = Product(**payload.model_dump())
        self._validate_publishable(product)
        try:
            self.repository.add(product)
            self.session.commit()
        except IntegrityError as error:
            self.session.rollback()
            raise HTTPException(status.HTTP_409_CONFLICT, "Ya existe un producto con ese slug.") from error
        return self.serialize(product)

    def update(self, product_id: uuid.UUID, payload: ProductUpdate) -> ProductRead:
        product = self.get(product_id)
        for field, value in payload.model_dump(exclude_unset=True).items():
            setattr(product, field, value)
        self._validate_publishable(product)
        try:
            self.session.commit()
        except IntegrityError as error:
            self.session.rollback()
            raise HTTPException(status.HTTP_409_CONFLICT, "Ya existe un producto con ese slug.") from error
        return self.serialize(product)

    def delete_product(self, product_id: uuid.UUID) -> None:
        product = self.get(product_id)
        keys = [image.object_key for image in product.images]
        self.session.delete(product)
        self.session.commit()
        for key in keys:
            self.storage.delete(key)

    def upload_images(
        self,
        product_id: uuid.UUID,
        files: list[tuple[bytes, str | None]],
        alt_texts: list[str],
        primary_index: int | None,
    ) -> ProductRead:
        product = self.get(product_id)
        if not files or len(product.images) + len(files) > MAX_PRODUCT_IMAGES:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Cada producto admite entre 1 y {MAX_PRODUCT_IMAGES} imágenes.")
        if primary_index is not None and not 0 <= primary_index < len(files):
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "La imagen principal indicada no existe.")

        processed = []
        try:
            processed = [process_image(data, content_type) for data, content_type in files]
        except ValueError as error:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(error)) from error

        existing_primary = next((image for image in product.images if image.is_primary), None)
        if primary_index is not None and existing_primary:
            existing_primary.is_primary = False
            self.session.flush()
        uploaded_keys: list[str] = []
        start_position = max((image.position for image in product.images), default=-1) + 1
        try:
            for index, image in enumerate(processed):
                image_id = uuid.uuid4()
                object_key = f"products/{product.id}/{image_id}.webp"
                self.storage.put(object_key, image)
                uploaded_keys.append(object_key)
                product.images.append(
                    ProductImage(
                        id=image_id,
                        object_key=object_key,
                        alt_text=alt_texts[index] if index < len(alt_texts) else product.title,
                        position=start_position + index,
                        is_primary=index == primary_index or (existing_primary is None and primary_index is None and index == 0),
                        width=image.width,
                        height=image.height,
                        content_type=image.content_type,
                    )
                )
            self.session.commit()
        except Exception:
            self.session.rollback()
            for key in uploaded_keys:
                self.storage.delete(key)
            raise
        return self.serialize(product)

    def set_primary(self, product_id: uuid.UUID, image_id: uuid.UUID) -> ProductRead:
        product = self.get(product_id)
        target = self._get_image(product, image_id)
        current = next((image for image in product.images if image.is_primary), None)
        if current and current.id != target.id:
            current.is_primary = False
            self.session.flush()
        target.is_primary = True
        self.session.commit()
        return self.serialize(product)

    def update_image(self, product_id: uuid.UUID, image_id: uuid.UUID, payload: ImageUpdate) -> ProductRead:
        product = self.get(product_id)
        image = self._get_image(product, image_id)
        for field, value in payload.model_dump(exclude_unset=True).items():
            setattr(image, field, value)
        self.session.commit()
        return self.serialize(product)

    def reorder_images(self, product_id: uuid.UUID, payload: ImageOrderUpdate) -> ProductRead:
        product = self.get(product_id)
        if {item.id for item in payload.images} != {image.id for image in product.images}:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "El orden debe incluir todas las imágenes una sola vez.")
        positions = [item.position for item in payload.images]
        if len(set(positions)) != len(positions):
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Las posiciones no pueden repetirse.")
        by_id = {image.id: image for image in product.images}
        for item in payload.images:
            by_id[item.id].position = item.position
        self.session.commit()
        return self.serialize(product)

    def delete_image(self, product_id: uuid.UUID, image_id: uuid.UUID) -> ProductRead:
        product = self.get(product_id)
        image = self._get_image(product, image_id)
        if image.is_primary:
            raise HTTPException(status.HTTP_409_CONFLICT, "Elegí otra imagen principal antes de eliminar esta.")
        object_key = image.object_key
        product.images.remove(image)
        self._validate_publishable(product)
        self.session.commit()
        self.storage.delete(object_key)
        return self.serialize(product)

    @staticmethod
    def _get_image(product: Product, image_id: uuid.UUID) -> ProductImage:
        image = next((candidate for candidate in product.images if candidate.id == image_id), None)
        if not image:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Imagen no encontrada.")
        return image

    @staticmethod
    def _validate_publishable(product: Product) -> None:
        if product.status == PublicationStatus.PUBLISHED and sum(image.is_primary for image in product.images) != 1:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_CONTENT,
                "Un producto publicado debe tener exactamente una imagen principal.",
            )
