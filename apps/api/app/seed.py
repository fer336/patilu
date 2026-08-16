import argparse
from pathlib import Path

from app.config import get_settings
from app.database import SessionLocal
from app.models import Availability, PublicationStatus
from app.schemas import ProductCreate, ProductUpdate
from app.services import ProductService
from app.storage import MinioStorage

SEED_PRODUCTS = [
    ("muneca-tejida", "Muñeca tejida", "Muñeca artesanal tejida al crochet, ideal para consultar como regalo o recuerdo personalizado.", "Medida a confirmar", "muneca.webp"),
    ("oveja-crochet", "Oveja crochet", "Oveja tejida al crochet con terminación suave y detalles artesanales a consultar.", "Medida a confirmar", "oveja.webp"),
    ("taza-tejida", "Taza tejida", "Pieza tejida al crochet para regalar o decorar, con precio y disponibilidad a confirmar.", "Medida a confirmar", "taza.webp"),
    ("muneco-personalizado", "Muñeco personalizado", "Diseño personalizado tejido al crochet, sujeto a revisión de idea, colores, tamaño y detalles.", "A definir según el diseño", "muneco-stranger-1.webp"),
    ("muneco-especial", "Muñeco especial", "Muñeco tejido con detalles especiales. Consultá posibilidades antes de avanzar.", "A definir según el diseño", "muneco-stranger-2.webp"),
    ("muneca-artesanal", "Muñeca artesanal", "Muñeca artesanal con detalles tejidos, pensada para regalos únicos y consultas personalizadas.", "Medida a confirmar", "muneca-floral.webp"),
]


def seed(assets_dir: Path) -> None:
    with SessionLocal() as session:
        service = ProductService(session, MinioStorage(get_settings()))
        for slug, title, description, measure, filename in SEED_PRODUCTS:
            if service.repository.get_by_slug(slug):
                print(f"skip {slug}: already exists")
                continue
            asset = assets_dir / filename
            if not asset.is_file():
                raise FileNotFoundError(f"Missing seed asset: {asset}")
            product = service.create(
                ProductCreate(
                    slug=slug,
                    title=title,
                    description=description,
                    measure=measure,
                    availability=Availability.MADE_TO_ORDER,
                )
            )
            service.upload_images(product.id, [(asset.read_bytes(), "image/webp")], [title], 0)
            service.update(product.id, ProductUpdate(status=PublicationStatus.PUBLISHED))
            print(f"seeded {slug}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Import the current Patilu fallback catalog into PostgreSQL and MinIO.")
    parser.add_argument("--assets-dir", type=Path, required=True)
    arguments = parser.parse_args()
    seed(arguments.assets_dir)
