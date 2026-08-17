from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=(".env", "/run/secrets/backend.env"), extra="ignore")

    database_url: str = "postgresql+psycopg://patilu:patilu@localhost:5432/patilu"
    cors_origins: str = "http://localhost:5173,http://localhost:3000"
    s3_endpoint_url: str = "http://localhost:9000"
    minio_access_key: str = "minioadmin"
    minio_secret_key: str = "minioadmin"
    s3_bucket: str = "patilu-productos"
    s3_region: str = "us-east-1"
    s3_public_base_url: str = "http://localhost:9000/patilu-productos"
    api_admin_token: str | None = None
    api_agent_token: str | None = None
    api_admin_session_secret: str | None = None
    google_client_id: str | None = None
    admin_allowed_emails: str = ""

    @property
    def cors_origins_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def admin_allowed_emails_set(self) -> set[str]:
        return {email.strip().lower() for email in self.admin_allowed_emails.split(",") if email.strip()}


@lru_cache
def get_settings() -> Settings:
    return Settings()
