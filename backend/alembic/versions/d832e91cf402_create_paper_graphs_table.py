"""create paper_graphs table

Revision ID: d832e91cf402
Revises: c741e93da120
Create Date: 2026-11-23 19:42:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'd832e91cf402'
down_revision: Union[str, None] = 'c741e93da120'
branch_labels: Union[Sequence[str], None] = None
depends_on: Union[Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'paper_graphs',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('paper_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('papers.id', ondelete='CASCADE'), nullable=False),
        sa.Column('graph_data', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index(op.f('ix_paper_graphs_paper_id'), 'paper_graphs', ['paper_id'], unique=True)


def downgrade() -> None:
    op.drop_index(op.f('ix_paper_graphs_paper_id'), table_name='paper_graphs')
    op.drop_table('paper_graphs')
