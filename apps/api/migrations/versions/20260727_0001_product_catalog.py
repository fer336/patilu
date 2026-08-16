"""Create product catalog and image metadata."""

from alembic import op
import sqlalchemy as sa

revision = "20260727_0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "products",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("slug", sa.String(160), nullable=False),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("measure", sa.String(200), nullable=False),
        sa.Column("price", sa.Numeric(12, 2), nullable=True),
        sa.Column("currency", sa.String(3), nullable=False),
        sa.Column("availability", sa.String(32), nullable=False),
        sa.Column("status", sa.String(32), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("price IS NULL OR price >= 0", name="ck_products_price_non_negative"),
        sa.CheckConstraint("availability IN ('available', 'made_to_order', 'reserved', 'sold_out')", name="ck_products_availability"),
        sa.CheckConstraint("status IN ('draft', 'published', 'hidden', 'deleted')", name="ck_products_status"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("slug"),
    )
    op.create_index("ix_products_status", "products", ["status"])
    op.create_table(
        "product_images",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("product_id", sa.Uuid(), nullable=False),
        sa.Column("object_key", sa.String(500), nullable=False),
        sa.Column("alt_text", sa.String(300), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("is_primary", sa.Boolean(), nullable=False),
        sa.Column("width", sa.Integer(), nullable=False),
        sa.Column("height", sa.Integer(), nullable=False),
        sa.Column("content_type", sa.String(100), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["product_id"], ["products.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("object_key"),
    )
    op.create_index("ix_product_images_product_id", "product_images", ["product_id"])
    op.create_index("ix_product_images_product_position", "product_images", ["product_id", "position"])
    op.create_index(
        "uq_product_images_one_primary",
        "product_images",
        ["product_id"],
        unique=True,
        postgresql_where=sa.text("is_primary"),
    )


def downgrade() -> None:
    op.drop_table("product_images")
    op.drop_table("products")
