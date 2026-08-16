import io
from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient
from PIL import Image
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.config import get_settings
from app.dependencies import get_product_service
from app.main import app
from app.services import ProductService
from app.storage import ObjectStorage, ProcessedImage


class FakeStorage(ObjectStorage):
    def __init__(self) -> None:
        self.objects: dict[str, bytes] = {}

    def put(self, object_key: str, image: ProcessedImage) -> None:
        self.objects[object_key] = image.data

    def delete(self, object_key: str) -> None:
        self.objects.pop(object_key, None)

    def public_url(self, object_key: str) -> str:
        return f"https://media.test/{object_key}"


@pytest.fixture
def session() -> Generator[Session, None, None]:
    engine = create_engine(
        "sqlite+pysqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    with factory() as database_session:
        yield database_session


@pytest.fixture
def storage() -> FakeStorage:
    return FakeStorage()


@pytest.fixture
def service(session: Session, storage: FakeStorage) -> ProductService:
    return ProductService(session, storage)


@pytest.fixture
def client(service: ProductService, monkeypatch: pytest.MonkeyPatch) -> Generator[TestClient, None, None]:
    monkeypatch.setenv("API_ADMIN_TOKEN", "test-admin-token")
    get_settings.cache_clear()
    app.dependency_overrides[get_product_service] = lambda: service
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()
    get_settings.cache_clear()


@pytest.fixture
def image_bytes() -> bytes:
    output = io.BytesIO()
    Image.new("RGB", (120, 80), "#e9a3ae").save(output, "PNG")
    return output.getvalue()
