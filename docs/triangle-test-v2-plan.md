# Pretest Redesign Plan: Fast Rectangle Discovery for Adaptive Mode

## Brief Summary
Replace the previous staircase-style pretest with a **programmatic cutting search** that discovers the adaptive search rectangle efficiently and systematically.

Core goal:
- Find rectangle bounds in `(size, contrast_strength)` space where performance transitions through the target band.
- Use pretest to initialize adaptive search window.
- Keep confidence logic as agreed: pretest data may contribute to confidence estimate, but pretest trials do **not** count toward the `min_main_trials=200` gate.

## Target Behavior (Decision Complete)

### 1) Pretest output
Pretest returns one rectangle:
- `size_min = size at lower target (40%)`
- `size_max = size at upper target (95%)`
- `contrast_min = contrast at lower target (40%)` (measured at `size_max`)
- `contrast_max = contrast at upper target (95%)` (measured at `size_max`)

Final window:
- `size in [size_40, size_95]`
- `contrast in [contrast_40, contrast_95]`

### 2) Axis order
1. Find size bounds first at strongest contrast (`contrast_strength = global_max`).
2. Then find contrast bounds at `size = size_95`.

### 3) Probe rule at one test point
For one probed value (size or contrast):
- Show random triangle orientations repeatedly.
- Stop when either:
  - `correct_count == success_target` (default `10`), or
  - `trial_count == trial_cap` (default `30`).
- Point score:
  - `p_hat = correct_count / trial_count`.

### 4) Target thresholds
- Lower target default: `0.40`
- Upper target default: `0.95`
- Both configurable.

### 5) Cutting search algorithm (per axis)

#### A. Find an in-band anchor point
- Start at midpoint of global range.
- Probe midpoint and evaluate `p_hat`.
- Move interval:
  - If `p_hat > upper_target`, move toward harder side.
  - If `p_hat < lower_target`, move toward easier side.
  - If `lower_target <= p_hat <= upper_target`, anchor found.
- Repeat until anchor found or `max_probes_per_axis` reached (default `12`).

#### B. Refine each boundary from anchor
After anchor is found, refine both edges separately:
- Lower edge (`~40%`)
- Upper edge (`~95%`)

Refinement method:
- Maintain bracket around threshold crossing.
- Midpoint probe, replace fail/pass side accordingly.
- Run exactly `refine_steps_per_edge` iterations (default `2`).

#### C. Not found handling
If threshold crossing cannot be established within global range:
- Clamp to global limit for that edge.
- Mark warning in run summary (`pretest_clamped_bounds=true` + edge details).

### 6) Global limits
- Size limits from configured display bounds.
- Contrast limits in normalized range `[0.0, 1.0]`.
- Search logic uses normalized `contrast_strength` (higher = easier), renderer maps to HSL/RGB.

## Session Flow Rules

### 1) Run start options
Operator can choose:
- Run full pretest,
- Reuse last pretest rectangle,
- Enter manual rectangle (`size_min,size_max,contrast_min,contrast_max`).

No validation step on reuse/manual.

### 2) Confidence integration
- Pretest trials are stored and included in final model/confidence estimate.
- Pretest trials are excluded from `main_trials_count` for stop gate.
- Stop gate remains: `confidence >= target` AND `main_trials_count >= 200`.

## Important API / Interface Changes

### Backend API additions (`/api/sessions`)
- `POST /runs`:
  - add `pretest_mode` enum: `run | reuse_last | manual`
  - if `manual`: require rectangle values
- `GET /runs/{id}/summary`:
  - include `pretest_bounds`, `pretest_warnings`, `pretest_trial_count`
  - include both counters:
    - `main_trials_count`
    - `total_trials_count` (includes pretest)
- `GET /settings` / `PUT /settings`:
  - add pretest config block.

### Settings schema additions
`pretest` block:
- `enabled_by_default` (bool, default true)
- `lower_target` (default 0.40)
- `upper_target` (default 0.95)
- `probe_rule`:
  - `success_target` (default 10)
  - `trial_cap` (default 30)
- `search`:
  - `method` = `cutting_search`
  - `max_probes_per_axis` (default 12)
  - `refine_steps_per_edge` (default 2)
- `global_limits`:
  - `size_min`, `size_max`
  - `contrast_min=0.0`, `contrast_max=1.0`

### Frontend interfaces
- Start-run UI:
  - pretest mode selector (`run/reuse/manual`)
  - manual rectangle inputs when selected
- Settings UI:
  - expose configurable pretest parameters
- Summary/export UI:
  - show pretest-derived rectangle and warnings

## Test Cases and Scenarios

### Backend tests
1. Probe scoring (`10/10`, `5/25`, cap at 30).
2. In-band anchor search on synthetic monotonic responder.
3. Boundary refinement for 40% and 95% with configured steps.
4. Clamp behavior with warning when crossing missing.
5. Axis order (size at max contrast, contrast at `size_95`).
6. Session counters: pretest contributes to confidence inputs but not `main_trials_count`.
7. Run modes: `run`, `reuse_last`, `manual`.

### Frontend tests
1. Start-run mode switching and required manual fields.
2. Settings roundtrip for new pretest parameters.
3. Summary shows pretest bounds and warnings.
4. Export includes phase flag (`pretest`/`main`).

### End-to-end
- Full pretest -> adaptive main -> stop decision with main-count gate -> exports with phase rows and pretest bounds.

## Explicit Assumptions and Defaults
- Targets default to `95%` and `40%`, both configurable.
- Probe rule defaults to `success_target=10`, `trial_cap=30`, configurable.
- Cutting search is midpoint-driven and threshold-oriented.
- `max_probes_per_axis=12` default, configurable.
- `refine_steps_per_edge=2` default, configurable.
- Reuse/manual start modes supported without validation.
- Pretest is one rectangle over full `(size, contrast)` axes (not per discrete contrast level).
