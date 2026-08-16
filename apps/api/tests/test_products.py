from pathlib import Path

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import ProductImage
from app.schemas import ProductCreate, ProductUpdate
from app.services import ProductService

ADMIN_HEADERS = {"Authorization": "Bearer test-admin-token"}


def product_payload(**overrides: object) -> dict[str, object]:
    payload: dict[str, object] = {
        "slug": "oveja-crochet",
        "title": "Oveja crochet",
        "description": "Oveja artesanal tejida al crochet.",
        "measure": "Aproximadamente 28 cm de alto",
        "price": "24500.00",
        "currency": "ARS",
        "category": "munecos",
        "trend": True,
        "availability": "available",
        "status": "draft",
    }
    payload.update(overrides)
    return payload


def test_product_schema_normalizes_currency() -> None:
    product = ProductCreate.model_validate(product_payload(currency="ars"))
    assert product.currency == "ARS"
    assert str(product.price) == "24500.00"
    assert product.category == "munecos"
    assert product.trend is True


def test_google_auth_mints_admin_session_token(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    def fake_verify_google_id_token(credential: str, audience: str) -> dict[str, object]:
        assert credential == "google-id-token"
        assert audience == "cms-client-id.apps.googleusercontent.com"
        return {"email": "Admin@Example.com", "email_verified": True, "sub": "google-subject"}

    monkeypatch.setattr("app.routes.verify_google_id_token", fake_verify_google_id_token)

    auth = client.post("/admin/auth/google", json={"credential": "google-id-token"})
    assert auth.status_code == 200
    token = auth.json()["token"]
    assert token != "test-admin-token"
    assert auth.json()["email"] == "admin@example.com"

    created = client.post("/admin/products", json=product_payload(), headers={"Authorization": f"Bearer {token}"})
    assert created.status_code == 201


def test_google_auth_rejects_unverified_or_unlisted_email(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        "app.routes.verify_google_id_token",
        lambda credential, audience: {"email": "admin@example.com", "email_verified": False, "sub": "subject"},
    )
    assert client.post("/admin/auth/google", json={"credential": "google-id-token"}).status_code == 401

    monkeypatch.setattr(
        "app.routes.verify_google_id_token",
        lambda credential, audience: {"email": "other@example.com", "email_verified": True, "sub": "subject"},
    )
    assert client.post("/admin/auth/google", json={"credential": "google-id-token"}).status_code == 403


def test_admin_crud_and_public_visibility(client: TestClient, image_bytes: bytes) -> None:
    created = client.post("/admin/products", json=product_payload(), headers=ADMIN_HEADERS)
    assert created.status_code == 201
    product_id = created.json()["id"]

    upload = client.post(
        f"/admin/products/{product_id}/images",
        files=[("files", ("oveja.png", image_bytes, "image/png"))],
        data={"alt_texts": "Oveja tejida", "primary_index": "0"},
        headers=ADMIN_HEADERS,
    )
    assert upload.status_code == 200
    assert upload.json()["images"][0]["is_primary"] is True
    assert upload.json()["images"][0]["content_type"] == "image/webp"

    published = client.patch(f"/admin/products/{product_id}", json={"status": "published"}, headers=ADMIN_HEADERS)
    assert published.status_code == 200
    public_product = client.get("/products").json()[0]
    assert public_product["slug"] == "oveja-crochet"
    assert public_product["category"] == "munecos"
    assert public_product["trend"] is True
    assert client.get("/products/oveja-crochet").status_code == 200

    updated = client.patch(f"/admin/products/{product_id}", json={"measure": "30 cm de alto"}, headers=ADMIN_HEADERS)
    assert updated.json()["measure"] == "30 cm de alto"


def test_admin_mutations_require_valid_bearer_token(client: TestClient) -> None:
    assert client.post("/admin/products", json=product_payload()).status_code == 401
    assert client.post("/admin/products", json=product_payload(), headers={"Authorization": "Bearer wrong"}).status_code == 401
    assert client.post("/admin/products", json=product_payload(), headers=ADMIN_HEADERS).status_code == 201


def test_admin_reads_require_valid_bearer_token(client: TestClient) -> None:
    created = client.post("/admin/products", json=product_payload(), headers=ADMIN_HEADERS)
    product_id = created.json()["id"]

    for path in ("/admin/products", f"/admin/products/{product_id}"):
        assert client.get(path).status_code == 401
        assert client.get(path, headers={"Authorization": "Bearer wrong"}).status_code == 401
        assert client.get(path, headers=ADMIN_HEADERS).status_code == 200


def test_admin_mutations_fail_closed_without_configured_token(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    from app.config import get_settings

    monkeypatch.delenv("API_ADMIN_TOKEN", raising=False)
    get_settings.cache_clear()
    try:
        response = client.post("/admin/products", json=product_payload(slug="sin-token"), headers=ADMIN_HEADERS)
        assert response.status_code == 401
    finally:
        monkeypatch.setenv("API_ADMIN_TOKEN", "test-admin-token")
        get_settings.cache_clear()


def test_published_product_requires_one_primary(service: ProductService) -> None:
    with pytest.raises(HTTPException, match="exactamente una imagen principal"):
        service.create(ProductCreate.model_validate(product_payload(status="published")))


def test_primary_cannot_be_deleted_until_replaced(
    service: ProductService, image_bytes: bytes
) -> None:
    product = service.create(ProductCreate.model_validate(product_payload()))
    with_images = service.upload_images(
        product.id,
        [(image_bytes, "image/png"), (image_bytes, "image/png")],
        ["Principal", "Detalle"],
        0,
    )
    primary, detail = with_images.images
    with pytest.raises(HTTPException) as error:
        service.delete_image(product.id, primary.id)
    assert error.value.status_code == 409

    service.set_primary(product.id, detail.id)
    result = service.delete_image(product.id, primary.id)
    assert len(result.images) == 1
    assert result.images[0].id == detail.id


def test_switching_primary_keeps_exactly_one(service: ProductService, image_bytes: bytes) -> None:
    product = service.create(ProductCreate.model_validate(product_payload()))
    uploaded = service.upload_images(
        product.id,
        [(image_bytes, "image/png"), (image_bytes, "image/png")],
        ["Frente", "Detalle"],
        0,
    )
    result = service.set_primary(product.id, uploaded.images[1].id)
    assert sum(image.is_primary for image in result.images) == 1
    assert result.images[1].is_primary is True


def test_database_partial_unique_index_rejects_two_primaries(
    service: ProductService, session: Session, image_bytes: bytes
) -> None:
    product_read = service.create(ProductCreate.model_validate(product_payload()))
    product = service.get(product_read.id)
    product.images.extend(
        [
            ProductImage(object_key="one.webp", alt_text="one", position=0, is_primary=True, width=10, height=10),
            ProductImage(object_key="two.webp", alt_text="two", position=1, is_primary=True, width=10, height=10),
        ]
    )
    with pytest.raises(IntegrityError):
        session.commit()
    session.rollback()


def test_upload_rejects_unsupported_mime(service: ProductService) -> None:
    product = service.create(ProductCreate.model_validate(product_payload()))
    with pytest.raises(HTTPException) as error:
        service.upload_images(product.id, [(b"not-an-image", "image/gif")], [], None)
    assert error.value.status_code == 422


def test_slug_conflict_returns_409(service: ProductService) -> None:
    service.create(ProductCreate.model_validate(product_payload()))
    with pytest.raises(HTTPException) as error:
        service.create(ProductCreate.model_validate(product_payload(title="Otra oveja")))
    assert error.value.status_code == 409


def test_migration_contains_postgres_partial_unique_index() -> None:
    migration = Path("migrations/versions/20260727_0001_product_catalog.py").read_text()
    assert "uq_product_images_one_primary" in migration
    assert 'postgresql_where=sa.text("is_primary")' in migration
