import uuid
from secrets import compare_digest
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, HTTPException, Response, UploadFile, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from google.auth.exceptions import GoogleAuthError

from app.auth import TOKEN_TTL_SECONDS, create_admin_session_token, validate_admin_session_token, verify_google_id_token
from app.config import get_settings
from app.dependencies import get_product_service
from app.schemas import AdminSessionRead, GoogleAuthRequest, ImageOrderUpdate, ImageUpdate, ProductCreate, ProductRead, ProductUpdate
from app.services import ProductService
from app.storage import MAX_IMAGE_BYTES

public_router = APIRouter(prefix="/products", tags=["catalog"])
admin_router = APIRouter(prefix="/admin/products", tags=["catalog-admin"])
admin_auth_router = APIRouter(prefix="/admin/auth", tags=["catalog-admin-auth"])
Service = Annotated[ProductService, Depends(get_product_service)]
bearer = HTTPBearer(auto_error=False)


def require_admin_token(credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)]) -> None:
    settings = get_settings()
    supplied = credentials.credentials if credentials and credentials.scheme.lower() == "bearer" else ""
    legacy_token_matches = bool(
        settings.api_admin_token
        and supplied
        and compare_digest(supplied.encode(), settings.api_admin_token.encode())
    )
    if supplied and (validate_admin_session_token(settings, supplied) or legacy_token_matches):
        return
    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Credenciales administrativas inválidas.")


AdminAuth = Annotated[None, Depends(require_admin_token)]


@admin_auth_router.post("/google", response_model=AdminSessionRead)
def authenticate_with_google(payload: GoogleAuthRequest) -> AdminSessionRead:
    settings = get_settings()
    if not settings.google_client_id or not settings.admin_allowed_emails_set:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "La autenticación administrativa no está configurada.")
    try:
        id_info = verify_google_id_token(payload.credential, settings.google_client_id)
    except (ValueError, GoogleAuthError) as error:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Credencial de Google inválida.") from error

    email = str(id_info.get("email", "")).strip().lower()
    subject = str(id_info.get("sub", "")).strip()
    if id_info.get("email_verified") is not True or not email or not subject:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "La cuenta de Google no está verificada.")
    if email not in settings.admin_allowed_emails_set:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Esta cuenta no tiene acceso al CMS.")

    token = create_admin_session_token(settings, email=email, subject=subject)
    return AdminSessionRead(token=token, expires_in=TOKEN_TTL_SECONDS, email=email)


@public_router.get("", response_model=list[ProductRead])
def list_products(service: Service) -> list[ProductRead]:
    return service.list_products(published_only=True)


@public_router.get("/{slug}", response_model=ProductRead)
def get_product(slug: str, service: Service) -> ProductRead:
    return service.get_by_slug(slug, published_only=True)


@admin_router.get("", response_model=list[ProductRead])
def admin_list_products(service: Service, _: AdminAuth) -> list[ProductRead]:
    return service.list_products()


@admin_router.post("", response_model=ProductRead, status_code=status.HTTP_201_CREATED)
def create_product(payload: ProductCreate, service: Service, _: AdminAuth) -> ProductRead:
    return service.create(payload)


@admin_router.get("/{product_id}", response_model=ProductRead)
def admin_get_product(product_id: uuid.UUID, service: Service, _: AdminAuth) -> ProductRead:
    return service.serialize(service.get(product_id))


@admin_router.patch("/{product_id}", response_model=ProductRead)
def update_product(product_id: uuid.UUID, payload: ProductUpdate, service: Service, _: AdminAuth) -> ProductRead:
    return service.update(product_id, payload)


@admin_router.delete("/{product_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_product(product_id: uuid.UUID, service: Service, _: AdminAuth) -> Response:
    service.delete_product(product_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@admin_router.post("/{product_id}/images", response_model=ProductRead)
async def upload_images(
    product_id: uuid.UUID,
    service: Service,
    _: AdminAuth,
    files: Annotated[list[UploadFile], File(description="JPG, PNG or WebP product images")],
    alt_texts: Annotated[list[str] | None, Form()] = None,
    primary_index: Annotated[int | None, Form()] = None,
) -> ProductRead:
    contents: list[tuple[bytes, str | None]] = []
    for file in files:
        data = await file.read(MAX_IMAGE_BYTES + 1)
        contents.append((data, file.content_type))
    return service.upload_images(product_id, contents, alt_texts or [], primary_index)


@admin_router.patch("/{product_id}/images/{image_id}", response_model=ProductRead)
def update_image(product_id: uuid.UUID, image_id: uuid.UUID, payload: ImageUpdate, service: Service, _: AdminAuth) -> ProductRead:
    return service.update_image(product_id, image_id, payload)


@admin_router.put("/{product_id}/images/order", response_model=ProductRead)
def reorder_images(product_id: uuid.UUID, payload: ImageOrderUpdate, service: Service, _: AdminAuth) -> ProductRead:
    return service.reorder_images(product_id, payload)


@admin_router.put("/{product_id}/images/{image_id}/primary", response_model=ProductRead)
def set_primary(product_id: uuid.UUID, image_id: uuid.UUID, service: Service, _: AdminAuth) -> ProductRead:
    return service.set_primary(product_id, image_id)


@admin_router.delete("/{product_id}/images/{image_id}", response_model=ProductRead)
def delete_image(product_id: uuid.UUID, image_id: uuid.UUID, service: Service, _: AdminAuth) -> ProductRead:
    return service.delete_image(product_id, image_id)
