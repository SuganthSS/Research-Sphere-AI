"""add paper discovery metadata to papers table

Revision ID: f67a2139bc8e
Revises: e58f01b7a2d1
Create Date: 2026-11-23 22:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'f67a2139bc8e'
down_revision: Union[str, None] = 'e58f01b7a2d1'
branch_labels: Union[Sequence[str], None] = None
depends_on: Union[Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('papers', sa.Column('doi', sa.String(length=255), nullable=True))
    op.add_column('papers', sa.Column('external_id', sa.String(length=255), nullable=True))
    op.add_column('papers', sa.Column('arxiv_id', sa.String(length=100), nullable=True))
    op.add_column('papers', sa.Column('venue', sa.String(length=500), nullable=True))
    op.add_column('papers', sa.Column('year', sa.Integer(), nullable=True))
    op.add_column('papers', sa.Column('citation_count', sa.Integer(), nullable=True))
    op.add_column('papers', sa.Column('authors_str', sa.String(length=1000), nullable=True))
    op.add_column('papers', sa.Column('source_url', sa.String(length=1000), nullable=True))
    op.add_column('papers', sa.Column('open_access_pdf_url', sa.String(length=1000), nullable=True))

    op.create_index(op.f('ix_papers_doi'), 'papers', ['doi'], unique=False)
    op.create_index(op.f('ix_papers_external_id'), 'papers', ['external_id'], unique=False)
    op.create_index(op.f('ix_papers_arxiv_id'), 'papers', ['arxiv_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_papers_arxiv_id'), table_name='papers')
    op.drop_index(op.f('ix_papers_external_id'), table_name='papers')
    op.drop_index(op.f('ix_papers_doi'), table_name='papers')

    op.drop_column('papers', 'open_access_pdf_url')
    op.drop_column('papers', 'source_url')
    op.drop_column('papers', 'authors_str')
    op.drop_column('papers', 'citation_count')
    op.drop_column('papers', 'year')
    op.drop_column('papers', 'venue')
    op.drop_column('papers', 'arxiv_id')
    op.drop_column('papers', 'external_id')
    op.drop_column('papers', 'doi')
