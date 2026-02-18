"""add run method fields

Revision ID: 4c1f4ef8a2c0
Revises: e2b01bb5cfcf
Create Date: 2026-02-10 15:10:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "4c1f4ef8a2c0"
down_revision: Union[str, Sequence[str], None] = "e2b01bb5cfcf"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("runs") as batch_op:
        batch_op.add_column(sa.Column("name", sa.String(), nullable=True))
        batch_op.add_column(
            sa.Column(
                "method",
                sa.String(),
                nullable=False,
                server_default="adaptive_rectangles",
            )
        )
        batch_op.add_column(sa.Column("axis_switch_policy", sa.String(), nullable=True))

    op.execute("UPDATE runs SET method = 'adaptive_rectangles' WHERE method IS NULL")

    with op.batch_alter_table("runs") as batch_op:
        batch_op.alter_column("method", server_default=None)
        batch_op.alter_column(
            "pretest_mode",
            existing_type=sa.String(),
            nullable=True,
        )


def downgrade() -> None:
    op.execute("UPDATE runs SET pretest_mode = 'run' WHERE pretest_mode IS NULL")

    with op.batch_alter_table("runs") as batch_op:
        batch_op.alter_column(
            "pretest_mode",
            existing_type=sa.String(),
            nullable=False,
        )
        batch_op.drop_column("axis_switch_policy")
        batch_op.drop_column("method")
        batch_op.drop_column("name")
