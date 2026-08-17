import logging
import uuid
from datetime import UTC, datetime
from hashlib import sha256
import hmac
from secrets import compare_digest
import secrets
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, HTTPException, Response, UploadFile, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from google.auth.exceptions import GoogleAuthError
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import TOKEN_TTL_SECONDS, create_admin_session_token, validate_admin_session_token, verify_google_id_token
from app.config import get_settings
from app.database import get_session
from app.dependencies import get_product_service
from app.models import AgentToken
from app.schemas import AgentTokenCreate, AgentTokenCreated, AgentTokenRead, AdminSessionRead, GoogleAuthRequest, ImageOrderUpdate, ImageUpdate, ProductCreate, ProductRead, ProductUpdate
from app.services import ProductService
from app.storage import MAX_IMAGE_BYTES

public_router = APIRouter(prefix="/products", tags=["catalog"])
admin_router = APIRouter(prefix="/admin/products", tags=["catalog-admin"])
admin_auth_router = APIRouter(prefix="/admin/auth", tags=["catalog-admin-auth"])
admin_agent_tokens_router = APIRouter(prefix="/admin/agent-tokens", tags=["catalog-admin-agent-tokens"])
agent_router = APIRouter(prefix="/agent/products", tags=["catalog-agent"])
Service = Annotated[ProductService, Depends(get_product_service)]
DatabaseSession = Annotated[Session, Depends(get_session)]
bearer = HTTPBearer(auto_error=False)
logger = logging.getLogger(__name__)
AGENT_TOKEN_PREFIX = "patilu_agent_"


def hash_agent_token(token: str) -> str:
    settings = get_settings()
    secret = settings.api_admin_session_secret or settings.api_agent_token or "patilu-agent-token-dev-secret"
    return hmac.new(secret.encode(), token.encode(), sha256).hexdigest()


def generate_agent_token() -> str:
    return f"{AGENT_TOKEN_PREFIX}{secrets.token_urlsafe(32)}"


def serialize_agent_token(token: AgentToken) -> AgentTokenRead:
    return AgentTokenRead.model_validate(token)


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


def require_agent_token(credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)], session: DatabaseSession) -> None:
    settings = get_settings()
    supplied = credentials.credentials if credentials and credentials.scheme.lower() == "bearer" else ""
    if supplied:
        token_hash = hash_agent_token(supplied)
        agent_token = session.scalar(
            select(AgentToken).where(AgentToken.token_hash == token_hash, AgentToken.revoked_at.is_(None))
        )
        if agent_token:
            agent_token.last_used_at = datetime.now(UTC)
            session.commit()
            logger.info("Agent authenticated with managed token", extra={"agent_token_id": str(agent_token.id)})
            return
    if settings.api_agent_token and supplied and compare_digest(supplied.encode(), settings.api_agent_token.encode()):
        logger.info("Agent authenticated with legacy environment token")
        return
    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid agent credentials.")


AdminAuth = Annotated[None, Depends(require_admin_token)]
AgentAuth = Annotated[None, Depends(require_agent_token)]


async def read_image_uploads(files: list[UploadFile]) -> list[tuple[bytes, str | None]]:
    contents: list[tuple[bytes, str | None]] = []
    for file in files:
        data = await file.read(MAX_IMAGE_BYTES + 1)
        contents.append((data, file.content_type))
    return contents


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


@admin_agent_tokens_router.get("", response_model=list[AgentTokenRead])
def list_agent_tokens(session: DatabaseSession, _: AdminAuth) -> list[AgentTokenRead]:
    tokens = session.scalars(select(AgentToken).order_by(AgentToken.created_at.desc())).all()
    return [serialize_agent_token(token) for token in tokens]


@admin_agent_tokens_router.post("", response_model=AgentTokenCreated, status_code=status.HTTP_201_CREATED)
def create_agent_token(payload: AgentTokenCreate, session: DatabaseSession, _: AdminAuth) -> AgentTokenCreated:
    token = generate_agent_token()
    agent_token = AgentToken(
        name=payload.name,
        token_hash=hash_agent_token(token),
        token_prefix=AGENT_TOKEN_PREFIX,
        token_last_chars=token[-6:],
    )
    session.add(agent_token)
    session.commit()
    session.refresh(agent_token)
    logger.info("Admin created agent token", extra={"agent_token_id": str(agent_token.id)})
    return AgentTokenCreated(**serialize_agent_token(agent_token).model_dump(), token=token)


@admin_agent_tokens_router.post("/{token_id}/revoke", response_model=AgentTokenRead)
def revoke_agent_token(token_id: uuid.UUID, session: DatabaseSession, _: AdminAuth) -> AgentTokenRead:
    agent_token = session.get(AgentToken, token_id)
    if not agent_token:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Agent token not found.")
    if agent_token.revoked_at is None:
        agent_token.revoked_at = datetime.now(UTC)
        session.commit()
        session.refresh(agent_token)
        logger.info("Admin revoked agent token", extra={"agent_token_id": str(agent_token.id)})
    return serialize_agent_token(agent_token)


@admin_agent_tokens_router.delete("/{token_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_agent_token(token_id: uuid.UUID, session: DatabaseSession, _: AdminAuth) -> Response:
    agent_token = session.get(AgentToken, token_id)
    if not agent_token:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Agent token not found.")
    session.delete(agent_token)
    session.commit()
    logger.info("Admin deleted agent token", extra={"agent_token_id": str(token_id)})
    return Response(status_code=status.HTTP_204_NO_CONTENT)


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
    contents = await read_image_uploads(files)
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


@agent_router.get("", response_model=list[ProductRead])
def agent_list_products(service: Service, _: AgentAuth) -> list[ProductRead]:
    return service.list_products()


@agent_router.get("/{product_id}", response_model=ProductRead)
def agent_get_product(product_id: uuid.UUID, service: Service, _: AgentAuth) -> ProductRead:
    return service.serialize(service.get(product_id))


@agent_router.post("/{product_id}/images", response_model=ProductRead)
async def agent_upload_images(
    product_id: uuid.UUID,
    service: Service,
    _: AgentAuth,
    files: Annotated[list[UploadFile], File(description="JPG, PNG or WebP product images")],
    alt_texts: Annotated[list[str] | None, Form()] = None,
    primary_index: Annotated[int | None, Form()] = None,
) -> ProductRead:
    contents = await read_image_uploads(files)
    product = service.upload_images(product_id, contents, alt_texts or [], primary_index)
    logger.info("Agent uploaded product images", extra={"product_id": str(product_id), "image_count": len(files)})
    return product


@agent_router.patch("/{product_id}/images/{image_id}", response_model=ProductRead)
def agent_update_image(
    product_id: uuid.UUID, image_id: uuid.UUID, payload: ImageUpdate, service: Service, _: AgentAuth
) -> ProductRead:
    product = service.update_image(product_id, image_id, payload)
    logger.info("Agent updated product image", extra={"product_id": str(product_id), "image_id": str(image_id)})
    return product


@agent_router.put("/{product_id}/images/order", response_model=ProductRead)
def agent_reorder_images(
    product_id: uuid.UUID, payload: ImageOrderUpdate, service: Service, _: AgentAuth
) -> ProductRead:
    product = service.reorder_images(product_id, payload)
    logger.info("Agent reordered product images", extra={"product_id": str(product_id)})
    return product


@agent_router.put("/{product_id}/images/{image_id}/primary", response_model=ProductRead)
def agent_set_primary(product_id: uuid.UUID, image_id: uuid.UUID, service: Service, _: AgentAuth) -> ProductRead:
    product = service.set_primary(product_id, image_id)
    logger.info("Agent set primary product image", extra={"product_id": str(product_id), "image_id": str(image_id)})
    return product


@agent_router.delete("/{product_id}/images/{image_id}", response_model=ProductRead)
def agent_delete_image(
    product_id: uuid.UUID, image_id: uuid.UUID, service: Service, _: AgentAuth
) -> ProductRead:
    product = service.delete_image(product_id, image_id)
    logger.info("Agent deleted product image", extra={"product_id": str(product_id), "image_id": str(image_id)})
    return product
