"""initial schema

Revision ID: e2b01bb5cfcf
Revises:
Create Date: 2026-02-06 20:07:37.835404

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e2b01bb5cfcf'
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'tests',
        sa.Column('id', sa.Integer(), primary_key=True, index=True),
        sa.Column('title', sa.String(), index=True),
        sa.Column('description', sa.String()),
        sa.Column('min_triangle_size', sa.Float()),
        sa.Column('max_triangle_size', sa.Float()),
        sa.Column('min_saturation', sa.Float()),
        sa.Column('max_saturation', sa.Float()),
        sa.Column('created_at', sa.DateTime()),
    )

    op.create_table(
        'rectangles',
        sa.Column('id', sa.Integer(), primary_key=True, index=True),
        sa.Column('test_id', sa.Integer(), sa.ForeignKey('tests.id')),
        sa.Column('min_triangle_size', sa.Float()),
        sa.Column('max_triangle_size', sa.Float()),
        sa.Column('min_saturation', sa.Float()),
        sa.Column('max_saturation', sa.Float()),
        sa.Column('area', sa.Float()),
        sa.Column('true_samples', sa.Integer(), server_default='0'),
        sa.Column('false_samples', sa.Integer(), server_default='0'),
    )

    op.create_table(
        'runs',
        sa.Column('id', sa.Integer(), primary_key=True, index=True),
        sa.Column('test_id', sa.Integer(), sa.ForeignKey('tests.id'), nullable=False),
        sa.Column('pretest_mode', sa.String(), nullable=False),
        sa.Column('status', sa.String(), nullable=False, server_default='pretest'),
        sa.Column('pretest_size_min', sa.Float(), nullable=True),
        sa.Column('pretest_size_max', sa.Float(), nullable=True),
        sa.Column('pretest_saturation_min', sa.Float(), nullable=True),
        sa.Column('pretest_saturation_max', sa.Float(), nullable=True),
        sa.Column('pretest_warnings', sa.Text(), nullable=True),
        sa.Column('pretest_state_json', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime()),
    )

    op.create_table(
        'test_combinations',
        sa.Column('id', sa.Integer(), primary_key=True, index=True),
        sa.Column('rectangle_id', sa.Integer(), sa.ForeignKey('rectangles.id'), nullable=True),
        sa.Column('test_id', sa.Integer(), sa.ForeignKey('tests.id')),
        sa.Column('run_id', sa.Integer(), sa.ForeignKey('runs.id'), nullable=True),
        sa.Column('triangle_size', sa.Float()),
        sa.Column('saturation', sa.Float()),
        sa.Column('orientation', sa.String()),
        sa.Column('success', sa.Integer()),
        sa.Column('phase', sa.String(), server_default='main'),
        sa.Column('created_at', sa.DateTime()),
    )

    op.create_table(
        'settings',
        sa.Column('id', sa.Integer(), primary_key=True, index=True),
        sa.Column('key', sa.String(), unique=True, index=True, nullable=False),
        sa.Column('value', sa.Text(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table('settings')
    op.drop_table('test_combinations')
    op.drop_table('runs')
    op.drop_table('rectangles')
    op.drop_table('tests')
