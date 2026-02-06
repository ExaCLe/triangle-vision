# Repository Guidelines

## Project Structure & Module Organization
- `main.py` is the FastAPI entry point; routers live in `routers/`.
- Database setup is in `db/`, SQLAlchemy models in `models/`, Pydantic schemas in `schemas/`, and CRUD helpers in `crud/`.
- `crud/algorithm_state.py` contains shared helpers for loading/syncing algorithm state with the database.
- The adaptive sampling algorithm lives in `algorithm_to_find_combinations/`, including the pretest search (`pretest.py`).
- Database migrations are managed with Alembic (`alembic/` directory, `alembic.ini`).
- Backend tests are in `tests/`, frontend code in `frontend/src/`, and frontend tests in `frontend/src/test/`.
- React build artifacts go to `frontend/build`, and the PyInstaller spec is `triangle_vision.spec`.

## Build, Test, and Development Commands
- `pip install -r requirements.txt` installs backend deps.
- `uvicorn main:app --reload` runs the FastAPI server on `http://localhost:8000`.
- `pytest` runs backend tests in `tests/`.
- `alembic upgrade head` applies database migrations.
- `alembic revision --autogenerate -m "description"` creates a new migration.
- `cd frontend && yarn install` installs frontend deps.
- `cd frontend && yarn start` runs the React dev server on `http://localhost:3000`.
- `cd frontend && yarn build` builds the production React bundle.
- `pip install pyinstaller && cd frontend && yarn build && cd .. && pyinstaller triangle_vision.spec` builds the desktop executable.

## API Routes
All routes are served under the `/api` prefix:
- `/api/tests/` — CRUD for tests
- `/api/test-combinations/` — test combinations, next combination, result submission, CSV export
- `/api/runs/` — run management (create, next trial, submit result, summary)
- `/api/settings/` — pretest settings configuration

## Coding Style & Naming Conventions
- Python uses 4-space indentation and snake_case for functions/variables (see `main.py`, `db/`).
- React code uses 2-space indentation and PascalCase component names (see `frontend/src/components/`).
- Tests follow `test_*.py` in `tests/` and `*.test.js` in `frontend/src/test/`.
- No dedicated formatter config is present; keep diffs consistent with surrounding files.

## Testing Guidelines
- Backend: `pytest` with config in `pytest.ini` (tests collected from `tests/`).
- Frontend: React Testing Library via `yarn test`.
- End-to-end: Cypress config is in `frontend/cypress/`; use `cd frontend && npx cypress open` when needed.

## Commit & Pull Request Guidelines
- Commits in history are short, sentence-style, and mostly lowercase (e.g., "removing print"); follow that tone.
- PRs should include a brief summary, testing notes (commands run), and UI screenshots/gifs when frontend changes are involved.
- If a change affects the algorithm or data model, describe the expected behavior impact and any new parameters.

## Configuration & Data Notes
- SQLite database is `sql_app.db` at the repo root; treat it as local dev data.
- API routes are served under `/api` and the React app is served from the backend in production builds.
