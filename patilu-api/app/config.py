from functools import lru_cache

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+psycopg://patilu:patilu@localhost:5432/patilu"
    cors_origins: list[str] = ["http://localhost:5173"]
    minio_endpoint: str = "localhost:9000"
    minio_access_key: str = "patilu"
    minio_secret_key: str = "change-me"
    minio_bucket: str = "product-images"
    minio_secure: bool = False
    media_public_url: str = "http://localhost:9000/product-images"
    api_admin_token: str | None = None

    @field_validator("cors_origins", mode="before")
    @classmethod
    def parse_origins(cls, value: object) -> object:
        if isinstance(value, str) and not value.startswith("["):
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        return value


@lru_cache
def get_settings() -> Settings:
    return Settings()
