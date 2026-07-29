import pytest

from app.config import Settings


def test_settings_load_values_from_dotenv_file(tmp_path, monkeypatch: pytest.MonkeyPatch) -> None:
    secret_file = tmp_path / "backend.env"
    secret_file.write_text("API_ADMIN_TOKEN=from-secret-file\n")
    monkeypatch.delenv("API_ADMIN_TOKEN", raising=False)

    settings = Settings(_env_file=str(secret_file))

    assert settings.api_admin_token == "from-secret-file"


def test_process_env_overrides_dotenv_file(tmp_path, monkeypatch: pytest.MonkeyPatch) -> None:
    secret_file = tmp_path / "backend.env"
    secret_file.write_text("API_ADMIN_TOKEN=from-secret-file\n")
    monkeypatch.setenv("API_ADMIN_TOKEN", "from-process-env")

    settings = Settings(_env_file=str(secret_file))

    assert settings.api_admin_token == "from-process-env"


def test_missing_first_env_file_is_ignored(tmp_path, monkeypatch: pytest.MonkeyPatch) -> None:
    missing_file = tmp_path / "missing.env"
    secret_file = tmp_path / "backend.env"
    secret_file.write_text("API_ADMIN_TOKEN=from-secret-file\n")
    monkeypatch.delenv("API_ADMIN_TOKEN", raising=False)

    settings = Settings(_env_file=(str(missing_file), str(secret_file)))

    assert settings.api_admin_token == "from-secret-file"


def test_later_env_file_overrides_earlier(tmp_path, monkeypatch: pytest.MonkeyPatch) -> None:
    local_file = tmp_path / ".env"
    secret_file = tmp_path / "backend.env"
    local_file.write_text("API_ADMIN_TOKEN=from-local-env\n")
    secret_file.write_text("API_ADMIN_TOKEN=from-secret-file\n")
    monkeypatch.delenv("API_ADMIN_TOKEN", raising=False)

    settings = Settings(_env_file=(str(local_file), str(secret_file)))

    assert settings.api_admin_token == "from-secret-file"
