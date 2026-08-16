import sys
import time
from collections.abc import Generator

from sqlalchemy import create_engine, text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import get_settings


class Base(DeclarativeBase):
    pass


engine = create_engine(get_settings().database_url, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)


def get_session() -> Generator[Session, None, None]:
    with SessionLocal() as session:
        yield session


def wait_for_database(attempts: int = 12, delay_seconds: int = 5) -> None:
    readiness_engine = create_engine(get_settings().database_url, pool_pre_ping=True)
    for attempt in range(1, attempts + 1):
        try:
            with readiness_engine.connect() as connection:
                connection.execute(text("select 1"))
            print("PostgreSQL is ready for migrations", file=sys.stderr)
            return
        except SQLAlchemyError as error:
            print(f"PostgreSQL not ready before migrations ({attempt}/{attempts}): {error}", file=sys.stderr)
            if attempt == attempts:
                raise SystemExit(1) from error
            time.sleep(delay_seconds)


if __name__ == "__main__":
    wait_for_database()
