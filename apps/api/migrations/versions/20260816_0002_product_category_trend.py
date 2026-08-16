"""Add public catalog category and trend fields."""

from alembic import op
import sqlalchemy as sa

revision = "20260816_0002"
down_revision = "20260727_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("products", sa.Column("category", sa.String(80), nullable=False, server_default="munecos"))
    op.add_column("products", sa.Column("trend", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.alter_column("products", "category", server_default=None)
    op.alter_column("products", "trend", server_default=None)


def downgrade() -> None:
    op.drop_column("products", "trend")
    op.drop_column("products", "category")
