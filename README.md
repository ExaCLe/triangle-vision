# Triangle Vision

Visual perception testing application for studying the relationship between triangle size and color saturation on visual perception.

## Prerequisites

- Python 3.11+
- Node.js 18+ and Yarn
- conda (recommended) or virtualenv

## Installation

### 1. Create and activate a Python environment

```bash
conda create -n triangle-vision python=3.11
conda activate triangle-vision
```

### 2. Install Python dependencies

```bash
pip install -r requirements.txt
```

### 3. Install frontend dependencies

```bash
cd frontend
yarn install
cd ..
```

### 4. Create a fresh database

The database is created automatically on first startup via Alembic migrations. If you need to start from scratch, delete the existing database file and restart:

```bash
rm -f sql_app.db
```

The next time the backend starts it will run `alembic upgrade head` and create all tables.

To manually run migrations:

```bash
alembic upgrade head
```

## Running (CLI)

### Backend

```bash
uvicorn main:app --reload
```

The API will be available at `http://localhost:8000`. Docs at `http://localhost:8000/docs`.

### Frontend

```bash
cd frontend
yarn start
```

The dev server will be available at `http://localhost:3000`.

## Running (PyCharm)

Shared run configurations are included in the `.run/` directory. After opening the project in PyCharm:

1. Make sure the Python interpreter is set to the `triangle-vision` conda environment.
2. Select **Backend** or **Frontend** from the run configuration dropdown in the toolbar and click Run.

- **Backend** &mdash; runs `uvicorn main:app --reload` from the project root.
- **Frontend** &mdash; runs `yarn start` inside the `frontend/` directory.

## Running tests

```bash
pytest
```

## Database migrations

This project uses [Alembic](https://alembic.sqlalchemy.org/) for schema migrations.

```bash
# Apply all pending migrations
alembic upgrade head

# Create a new migration after changing models
alembic revision --autogenerate -m "describe the change"

# Check if models are in sync with the database
alembic check
```

## Building the desktop app

```bash
pip install pyinstaller
cd frontend && yarn build && cd ..
pyinstaller triangle_vision.spec
```
