"""create_paper_comparisons_table

Revision ID: c741e93da120
Revises: b53273e44fd6
Create Date: 2026-11-23 18:07:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c741e93da120'
down_revision: Union[str, Sequence[str], None] = 'b53273e44fd6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        'paper_comparisons',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('user_id', sa.UUID(), nullable=False),
        sa.Column('paper_ids_key', sa.String(length=512), nullable=False),
        sa.Column('paper_ids', sa.JSON(), nullable=False),
        sa.Column('comparison_data', sa.JSON(), nullable=False),
        sa.Column('model_provider', sa.String(length=50), nullable=False),
        sa.Column('model_name', sa.String(length=100), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_paper_comparisons_user_id'), 'paper_comparisons', ['user_id'], unique=False)
    op.create_index(op.f('ix_paper_comparisons_paper_ids_key'), 'paper_comparisons', ['paper_ids_key'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f('ix_paper_comparisons_paper_ids_key'), table_name='paper_comparisons')
    op.drop_index(op.f('ix_paper_comparisons_user_id'), table_name='paper_comparisons')
    op.drop_table('paper_comparisons')
