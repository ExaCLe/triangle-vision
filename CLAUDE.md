# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Triangle Vision is a visual perception testing application for studying the relationship between triangle size and color saturation on visual perception. It uses an adaptive sampling algorithm to efficiently explore parameter combinations and identify perception thresholds.

## Architecture

The application is a full-stack web app packaged as a desktop executable:

- **Backend**: FastAPI (Python) with SQLAlchemy ORM and SQLite database
- **Frontend**: React app served by the FastAPI backend
- **Desktop**: PyInstaller bundles both into a standalone executable

### Key Components

**Backend Structure:**
- `main.py` - FastAPI app entry point, mounts routers and serves React build
- `app_launcher.py` - Desktop launcher that starts uvicorn and opens browser
- `routers/test_router.py` - CRUD endpoints for tests, visualization plotting
- `routers/test_combination_router.py` - Endpoints for test combinations and the adaptive sampling algorithm
- `models/test.py` - SQLAlchemy models (Test, Rectangle, TestCombination) and Pydantic schemas
- `db/database.py` - Database connection setup

**Algorithm Module** (`algorithm_to_find_combinations/`):
- `algorithm.py` - Core adaptive sampling algorithm with `AlgorithmState` class and two sampling strategies:
  - `get_next_combination` - Rectangle-based probability sampling
  - `get_next_combinations_confidence_bounds` - Confidence bounds strategy using mean/variance grids
- `plotting.py` - Visualization functions including soft brush smoothing
- `ground_truth.py` - Simulated ground truth probability functions for testing
- `main.py` - Standalone script for algorithm experimentation

### Data Model

- **Test**: Defines parameter bounds (triangle_size, saturation) for a test session
- **Rectangle**: Subdivisions of the parameter space, tracks sampling statistics
- **TestCombination**: Individual test results (triangle_size, saturation, orientation, success)

## Common Commands

### Backend Development
```bash
# Install dependencies
pip install -r requirements.txt

# Run development server
uvicorn main:app --reload

# Run tests
pytest

# Run single test
pytest tests/test_test_endpoints.py::test_name
```

### Frontend Development
```bash
cd frontend
yarn install
yarn start  # Development server on port 3000
yarn build  # Build for production
yarn test   # Run React tests
```

### Building Desktop App
```bash
pip install pyinstaller
cd frontend && yarn build && cd ..
pyinstaller triangle_vision.spec
```

## API Routes

All API routes are prefixed with `/api`:
- `/api/tests` - Test CRUD operations
- `/api/tests/{id}/plot` - Generate visualization plot
- `/api/test-combinations` - Test combination operations
- `/api/test-combinations/next/{test_id}` - Get next combination from algorithm
- `/api/test-combinations/result` - Submit test result
