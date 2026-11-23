"""create research_gap_analyses table

Revision ID: e58f01b7a2d1
Revises: d832e91cf402
Create Date: 2026-11-23 21:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'e58f01b7a2d1'
down_revision: Union[str, None] = 'd832e91cf402'
branch_labels: Union[Sequence[str], None] = None
depends_on: Union[Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'research_gap_analyses',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('project_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('projects.id', ondelete='CASCADE'), nullable=False),
        sa.Column('paper_ids_key', sa.String(length=512), nullable=False),
        sa.Column('paper_ids', sa.JSON(), nullable=False),
        sa.Column('analysis_data', sa.JSON(), nullable=False),
        sa.Column('model_provider', sa.String(length=50), nullable=False),
        sa.Column('model_name', sa.String(length=100), nullable=False),
        sa.Column('version', sa.Integer(), nullable=False, server_default='1'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index(op.f('ix_research_gap_analyses_user_id'), 'research_gap_analyses', ['user_id'], unique=False)
    op.create_index(op.f('ix_research_gap_analyses_project_id'), 'research_gap_analyses', ['project_id'], unique=False)
    op.create_index(op.f('ix_research_gap_analyses_paper_ids_key'), 'research_gap_analyses', ['paper_ids_key'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_research_gap_analyses_paper_ids_key'), table_name='research_gap_analyses')
    op.drop_index(op.f('ix_research_gap_analyses_project_id'), table_name='research_gap_analyses')
    op.drop_index(op.f('ix_research_gap_analyses_user_id'), table_name='research_gap_analyses')
    op.drop_table('research_gap_analyses')
