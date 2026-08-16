import io
import json
from dataclasses import dataclass
from urllib.parse import urlparse

from minio import Minio
from PIL import Image, ImageOps, UnidentifiedImageError

from app.config import Settings

ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp"}
MAX_IMAGE_BYTES = 8 * 1024 * 1024
MAX_PRODUCT_IMAGES = 10
MAX_IMAGE_EDGE = 1800


@dataclass(frozen=True)
class ProcessedImage:
    data: bytes
    width: int
    height: int
    content_type: str = "image/webp"


def process_image(data: bytes, content_type: str | None) -> ProcessedImage:
    if content_type not in ALLOWED_IMAGE_TYPES:
        raise ValueError("Formato no permitido. Usá JPG, PNG o WebP.")
    if len(data) > MAX_IMAGE_BYTES:
        raise ValueError("La imagen supera el máximo de 8 MB.")
    try:
        with Image.open(io.BytesIO(data)) as source:
            image = ImageOps.exif_transpose(source).convert("RGB")
            image.thumbnail((MAX_IMAGE_EDGE, MAX_IMAGE_EDGE), Image.Resampling.LANCZOS)
            output = io.BytesIO()
            image.save(output, format="WEBP", quality=84, method=6)
            return ProcessedImage(output.getvalue(), image.width, image.height)
    except (UnidentifiedImageError, OSError) as error:
        raise ValueError("El archivo no contiene una imagen válida.") from error


class ObjectStorage:
    def put(self, object_key: str, image: ProcessedImage) -> None:
        raise NotImplementedError

    def delete(self, object_key: str) -> None:
        raise NotImplementedError

    def public_url(self, object_key: str) -> str:
        raise NotImplementedError


class MinioStorage(ObjectStorage):
    def __init__(self, settings: Settings):
        endpoint = urlparse(settings.s3_endpoint_url)
        minio_endpoint = endpoint.netloc or endpoint.path
        secure = endpoint.scheme == "https"
        self.bucket = settings.s3_bucket
        self.base_url = settings.s3_public_base_url.rstrip("/")
        self.client = Minio(
            minio_endpoint,
            access_key=settings.minio_access_key,
            secret_key=settings.minio_secret_key,
            secure=secure,
        )

    def ensure_bucket(self) -> None:
        if not self.client.bucket_exists(self.bucket):
            self.client.make_bucket(self.bucket)
        self.client.set_bucket_policy(
            self.bucket,
            json.dumps(
                {
                    "Version": "2012-10-17",
                    "Statement": [
                        {
                            "Effect": "Allow",
                            "Principal": {"AWS": ["*"]},
                            "Action": ["s3:GetObject"],
                            "Resource": [f"arn:aws:s3:::{self.bucket}/*"],
                        }
                    ],
                }
            ),
        )

    def put(self, object_key: str, image: ProcessedImage) -> None:
        self.ensure_bucket()
        stream = io.BytesIO(image.data)
        self.client.put_object(self.bucket, object_key, stream, len(image.data), content_type=image.content_type)

    def delete(self, object_key: str) -> None:
        self.client.remove_object(self.bucket, object_key)

    def public_url(self, object_key: str) -> str:
        return f"{self.base_url}/{object_key}"
