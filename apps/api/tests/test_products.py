import uuid
from pathlib import Path

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import AgentToken, ProductImage
from app.schemas import ProductCreate, ProductUpdate
from app.services import ProductService

ADMIN_HEADERS = {"Authorization": "Bearer test-admin-token"}
AGENT_HEADERS = {"Authorization": "Bearer test-agent-token"}


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
    product_id = uuid.UUID(created.json()["id"])

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


def test_delete_image_endpoint_removes_record_and_storage_object(
    client: TestClient, service: ProductService, session: Session, storage, image_bytes: bytes
) -> None:
    created = client.post("/admin/products", json=product_payload(), headers=ADMIN_HEADERS)
    product_id = uuid.UUID(created.json()["id"])
    upload = client.post(
        f"/admin/products/{product_id}/images",
        files=[
            ("files", ("cover.png", image_bytes, "image/png")),
            ("files", ("detail.png", image_bytes, "image/png")),
        ],
        data={"alt_texts": ["Portada", "Detalle"], "primary_index": "0"},
        headers=ADMIN_HEADERS,
    )
    assert upload.status_code == 200
    product = service.get(product_id)
    detail = next(image for image in product.images if not image.is_primary)
    detail_key = detail.object_key

    deleted = client.delete(f"/admin/products/{product_id}/images/{detail.id}", headers=ADMIN_HEADERS)

    assert deleted.status_code == 200
    assert all(image["id"] != str(detail.id) for image in deleted.json()["images"])
    assert sum(image["is_primary"] for image in deleted.json()["images"]) == 1
    assert session.get(ProductImage, detail.id) is None
    assert detail_key not in storage.objects


def test_delete_image_endpoint_rejects_current_primary_when_alternatives_exist(
    client: TestClient, service: ProductService, storage, image_bytes: bytes
) -> None:
    created = client.post("/admin/products", json=product_payload(), headers=ADMIN_HEADERS)
    product_id = uuid.UUID(created.json()["id"])
    upload = client.post(
        f"/admin/products/{product_id}/images",
        files=[
            ("files", ("cover.png", image_bytes, "image/png")),
            ("files", ("detail.png", image_bytes, "image/png")),
        ],
        data={"primary_index": "0"},
        headers=ADMIN_HEADERS,
    )
    primary_id = next(image["id"] for image in upload.json()["images"] if image["is_primary"])
    stored_keys = set(storage.objects)

    deleted = client.delete(f"/admin/products/{product_id}/images/{primary_id}", headers=ADMIN_HEADERS)

    assert deleted.status_code == 409
    assert set(storage.objects) == stored_keys
    assert sum(image.is_primary for image in service.get(product_id).images) == 1


def test_agent_reads_include_draft_products_with_valid_token(client: TestClient) -> None:
    created = client.post("/admin/products", json=product_payload(), headers=ADMIN_HEADERS)
    product_id = created.json()["id"]

    listed = client.get("/agent/products", headers=AGENT_HEADERS)
    fetched = client.get(f"/agent/products/{product_id}", headers=AGENT_HEADERS)

    assert listed.status_code == 200
    assert [product["id"] for product in listed.json()] == [product_id]
    assert fetched.status_code == 200
    assert fetched.json()["status"] == "draft"


def test_admin_can_create_list_revoke_and_delete_agent_tokens(client: TestClient, session: Session) -> None:
    created = client.post("/admin/agent-tokens", json={"name": "Gallery agent"}, headers=ADMIN_HEADERS)

    assert created.status_code == 201
    body = created.json()
    assert body["name"] == "Gallery agent"
    assert body["token"].startswith("patilu_agent_")
    assert body["token_last_chars"] == body["token"][-6:]
    assert body["active"] is True
    assert "token_hash" not in body
    assert session.get(AgentToken, uuid.UUID(body["id"])).token_hash != body["token"]

    listed = client.get("/admin/agent-tokens", headers=ADMIN_HEADERS)
    assert listed.status_code == 200
    assert listed.json()[0]["id"] == body["id"]
    assert "token" not in listed.json()[0]
    assert "token_hash" not in listed.json()[0]

    revoked = client.post(f"/admin/agent-tokens/{body['id']}/revoke", headers=ADMIN_HEADERS)
    assert revoked.status_code == 200
    assert revoked.json()["active"] is False
    assert revoked.json()["revoked_at"] is not None

    deleted = client.delete(f"/admin/agent-tokens/{body['id']}", headers=ADMIN_HEADERS)
    assert deleted.status_code == 204
    assert session.get(AgentToken, uuid.UUID(body["id"])) is None


def test_agent_token_management_requires_admin_auth(client: TestClient) -> None:
    assert client.get("/admin/agent-tokens").status_code == 401
    assert client.post("/admin/agent-tokens", json={"name": "Nope"}, headers=AGENT_HEADERS).status_code == 401


def test_managed_agent_token_authenticates_until_revoked_or_deleted(client: TestClient, session: Session) -> None:
    created = client.post("/admin/agent-tokens", json={"name": "Gallery agent"}, headers=ADMIN_HEADERS)
    token = created.json()["token"]
    token_id = uuid.UUID(created.json()["id"])
    headers = {"Authorization": f"Bearer {token}"}

    first_auth = client.get("/agent/products", headers=headers)
    session.expire_all()
    stored = session.get(AgentToken, token_id)
    assert first_auth.status_code == 200
    assert stored is not None
    assert stored.last_used_at is not None

    revoked = client.post(f"/admin/agent-tokens/{token_id}/revoke", headers=ADMIN_HEADERS)
    assert revoked.status_code == 200
    assert client.get("/agent/products", headers=headers).status_code == 401

    replacement = client.post("/admin/agent-tokens", json={"name": "Temporary agent"}, headers=ADMIN_HEADERS)
    replacement_token = replacement.json()["token"]
    replacement_id = replacement.json()["id"]
    assert client.get("/agent/products", headers={"Authorization": f"Bearer {replacement_token}"}).status_code == 200
    assert client.delete(f"/admin/agent-tokens/{replacement_id}", headers=ADMIN_HEADERS).status_code == 204
    assert client.get("/agent/products", headers={"Authorization": f"Bearer {replacement_token}"}).status_code == 401


def test_agent_reads_require_valid_configured_bearer_token(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    from app.config import get_settings

    assert client.get("/agent/products").status_code == 401
    assert client.get("/agent/products", headers={"Authorization": "Bearer wrong"}).status_code == 401
    assert client.get("/agent/products", headers=AGENT_HEADERS).status_code == 200

    monkeypatch.delenv("API_AGENT_TOKEN", raising=False)
    get_settings.cache_clear()
    try:
        assert client.get("/agent/products", headers=AGENT_HEADERS).status_code == 401
    finally:
        monkeypatch.setenv("API_AGENT_TOKEN", "test-agent-token")
        get_settings.cache_clear()


def test_agent_gallery_management_endpoints(client: TestClient, service: ProductService, image_bytes: bytes) -> None:
    created = client.post("/admin/products", json=product_payload(), headers=ADMIN_HEADERS)
    product_id = uuid.UUID(created.json()["id"])
    upload = client.post(
        f"/agent/products/{product_id}/images",
        files=[
            ("files", ("cover.png", image_bytes, "image/png")),
            ("files", ("detail.png", image_bytes, "image/png")),
        ],
        data={"alt_texts": ["Cover", "Detail"], "primary_index": "0"},
        headers=AGENT_HEADERS,
    )
    assert upload.status_code == 200
    images = upload.json()["images"]
    primary = next(image for image in images if image["is_primary"])
    detail = next(image for image in images if not image["is_primary"])

    updated = client.patch(
        f"/agent/products/{product_id}/images/{detail['id']}",
        json={"alt_text": "Side detail"},
        headers=AGENT_HEADERS,
    )
    assert updated.status_code == 200
    updated_detail = next(image for image in updated.json()["images"] if image["id"] == detail["id"])
    assert updated_detail["alt_text"] == "Side detail"

    reordered = client.put(
        f"/agent/products/{product_id}/images/order",
        json={"images": [{"id": primary["id"], "position": 1}, {"id": detail["id"], "position": 0}]},
        headers=AGENT_HEADERS,
    )
    assert reordered.status_code == 200
    assert [image["id"] for image in reordered.json()["images"]] == [detail["id"], primary["id"]]

    switched = client.put(f"/agent/products/{product_id}/images/{detail['id']}/primary", headers=AGENT_HEADERS)
    assert switched.status_code == 200
    assert next(image for image in switched.json()["images"] if image["is_primary"])["id"] == detail["id"]
    assert sum(image.is_primary for image in service.get(product_id).images) == 1


def test_agent_cannot_delete_current_primary(client: TestClient, image_bytes: bytes) -> None:
    created = client.post("/admin/products", json=product_payload(), headers=ADMIN_HEADERS)
    product_id = created.json()["id"]
    upload = client.post(
        f"/agent/products/{product_id}/images",
        files=[
            ("files", ("cover.png", image_bytes, "image/png")),
            ("files", ("detail.png", image_bytes, "image/png")),
        ],
        data={"primary_index": "0"},
        headers=AGENT_HEADERS,
    )
    primary_id = next(image["id"] for image in upload.json()["images"] if image["is_primary"])

    deleted = client.delete(f"/agent/products/{product_id}/images/{primary_id}", headers=AGENT_HEADERS)

    assert deleted.status_code == 409


def test_agent_delete_non_primary_removes_storage_object(
    client: TestClient, service: ProductService, session: Session, storage, image_bytes: bytes
) -> None:
    created = client.post("/admin/products", json=product_payload(), headers=ADMIN_HEADERS)
    product_id = uuid.UUID(created.json()["id"])
    upload = client.post(
        f"/agent/products/{product_id}/images",
        files=[
            ("files", ("cover.png", image_bytes, "image/png")),
            ("files", ("detail.png", image_bytes, "image/png")),
        ],
        data={"primary_index": "0"},
        headers=AGENT_HEADERS,
    )
    assert upload.status_code == 200
    product = service.get(product_id)
    detail = next(image for image in product.images if not image.is_primary)
    detail_key = detail.object_key

    deleted = client.delete(f"/agent/products/{product_id}/images/{detail.id}", headers=AGENT_HEADERS)

    assert deleted.status_code == 200
    assert all(image["id"] != str(detail.id) for image in deleted.json()["images"])
    assert session.get(ProductImage, detail.id) is None
    assert detail_key not in storage.objects


def test_agent_token_cannot_access_admin_product_delete(client: TestClient) -> None:
    created = client.post("/admin/products", json=product_payload(), headers=ADMIN_HEADERS)
    product_id = created.json()["id"]

    deleted = client.delete(f"/admin/products/{product_id}", headers=AGENT_HEADERS)

    assert deleted.status_code == 401
    assert client.get(f"/admin/products/{product_id}", headers=ADMIN_HEADERS).status_code == 200


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


def test_uploading_multiple_images_with_primary_index_keeps_exactly_one_primary(
    service: ProductService, image_bytes: bytes
) -> None:
    product = service.create(ProductCreate.model_validate(product_payload()))
    initial = service.upload_images(product.id, [(image_bytes, "image/png")], ["Portada anterior"], 0)

    result = service.upload_images(
        product.id,
        [(image_bytes, "image/png"), (image_bytes, "image/png")],
        ["Detalle", "Nueva portada"],
        1,
    )

    assert len(result.images) == 3
    assert sum(image.is_primary for image in result.images) == 1
    assert next(image for image in result.images if image.is_primary).alt_text == "Nueva portada"
    assert next(image for image in result.images if image.id == initial.images[0].id).is_primary is False


def test_upload_endpoint_rejects_invalid_primary_index_without_storing_files(
    client: TestClient, storage, image_bytes: bytes
) -> None:
    created = client.post("/admin/products", json=product_payload(), headers=ADMIN_HEADERS)
    product_id = uuid.UUID(created.json()["id"])

    upload = client.post(
        f"/admin/products/{product_id}/images",
        files=[("files", ("cover.png", image_bytes, "image/png"))],
        data={"primary_index": "1"},
        headers=ADMIN_HEADERS,
    )

    assert upload.status_code == 400
    assert storage.objects == {}


def test_delete_product_removes_all_image_storage_objects(
    client: TestClient, service: ProductService, session: Session, storage, image_bytes: bytes
) -> None:
    created = client.post("/admin/products", json=product_payload(), headers=ADMIN_HEADERS)
    product_id = uuid.UUID(created.json()["id"])
    upload = client.post(
        f"/admin/products/{product_id}/images",
        files=[
            ("files", ("cover.png", image_bytes, "image/png")),
            ("files", ("detail.png", image_bytes, "image/png")),
            ("files", ("detail-2.png", image_bytes, "image/png")),
        ],
        data={"primary_index": "0"},
        headers=ADMIN_HEADERS,
    )
    assert upload.status_code == 200
    image_ids = [image.id for image in service.get(product_id).images]
    stored_keys = set(storage.objects)
    assert len(stored_keys) == 3

    deleted = client.delete(f"/admin/products/{product_id}", headers=ADMIN_HEADERS)

    assert deleted.status_code == 204
    assert all(key not in storage.objects for key in stored_keys)
    assert all(session.get(ProductImage, image_id) is None for image_id in image_ids)
    with pytest.raises(HTTPException) as error:
        service.get(product_id)
    assert error.value.status_code == 404


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
