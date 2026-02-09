import { useState, useEffect, useRef } from "react";
import "../css/TuningPage.css";
import HeatmapCanvas, { rdYlGn } from "./shared/HeatmapCanvas";

const API = "http://localhost:8000/api";

function parseNum(raw, fallback) {
  if (raw === "" || raw == null) return fallback;
  const n = Number(raw);
  return isNaN(n) ? fallback : n;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function sliceHeatmap(heatmap, windowBounds) {
  if (!heatmap || !windowBounds) return heatmap;
  const xs = heatmap.triangle_sizes || [];
  const ys = heatmap.saturations || [];
  const grid = heatmap.grid || [];
  if (xs.length < 2 || ys.length < 2 || grid.length < 2) return heatmap;

  const xMin = clamp(windowBounds.sizeMin, xs[0], xs[xs.length - 1]);
  const xMax = clamp(windowBounds.sizeMax, xs[0], xs[xs.length - 1]);
  const yMin = clamp(windowBounds.satMin, ys[0], ys[ys.length - 1]);
  const yMax = clamp(windowBounds.satMax, ys[0], ys[ys.length - 1]);

  if (xMin >= xMax || yMin >= yMax) return heatmap;

  const findStart = (arr, target) => Math.max(0, arr.findIndex((v) => v >= target));
  const findEnd = (arr, target) => {
    let idx = arr.length - 1;
    for (let i = arr.length - 1; i >= 0; i -= 1) {
      if (arr[i] <= target) {
        idx = i;
        break;
      }
    }
    return idx;
  };

  let xStart = findStart(xs, xMin);
  let xEnd = findEnd(xs, xMax);
  let yStart = findStart(ys, yMin);
  let yEnd = findEnd(ys, yMax);

  if (xEnd <= xStart) {
    xStart = Math.max(0, xStart - 1);
    xEnd = Math.min(xs.length - 1, xStart + 1);
  }
  if (yEnd <= yStart) {
    yStart = Math.max(0, yStart - 1);
    yEnd = Math.min(ys.length - 1, yStart + 1);
  }

  return {
    triangle_sizes: xs.slice(xStart, xEnd + 1),
    saturations: ys.slice(yStart, yEnd + 1),
    grid: grid.slice(yStart, yEnd + 1).map((row) => row.slice(xStart, xEnd + 1)),
  };
}

function TuningPage() {
  const [models, setModels] = useState([]);
  const [config, setConfig] = useState({
    model_name: "default",
    pretest_mode: "run",
    // Pretest
    lower_target: 0.40,
    upper_target: 0.95,
    success_target: 10,
    trial_cap: 30,
    max_probes_per_axis: 12,
    refine_steps_per_edge: 2,
    global_size_min: 1,
    global_size_max: 100,
    global_sat_min: 0,
    global_sat_max: 1,
    // Main
    main_iterations: 300,
    success_rate_threshold: 0.85,
    total_samples_threshold: 5,
    max_samples_before_split: 60,
    main_snapshot_interval: 10,
    heatmap_steps: 140,
    algorithm_heatmap_steps: 140,
    seed: "",
  });
  const [inspectBounds, setInspectBounds] = useState({
    sizeMin: 1,
    sizeMax: 100,
    satMin: 0,
    satMax: 1,
  });
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [snapshotIdx, setSnapshotIdx] = useState(0);
  const [algorithmView, setAlgorithmView] = useState("rectangles");
  const [algoHeatmap, setAlgoHeatmap] = useState(null);
  const [algoHeatmapScore, setAlgoHeatmapScore] = useState(null);
  const [algoHeatmapLoading, setAlgoHeatmapLoading] = useState(false);
  const [algoHeatmapError, setAlgoHeatmapError] = useState(null);

  useEffect(() => {
    fetch(`${API}/settings/simulation-models`)
      .then((r) => r.json())
      .then((data) => setModels(data))
      .catch(() => {});
  }, []);

  const setField = (key, raw, fallback) => {
    setConfig((c) => ({ ...c, [key]: parseNum(raw, fallback) }));
  };
  const setInspectField = (key, raw, fallback) => {
    setInspectBounds((b) => ({ ...b, [key]: parseNum(raw, fallback) }));
  };

  const setPretestMode = (mode) => {
    setConfig((c) => ({ ...c, pretest_mode: mode }));
  };

  const runSimulation = async () => {
    if (config.global_size_min >= config.global_size_max) {
      alert("Global size min must be smaller than global size max.");
      return;
    }
    if (config.global_sat_min >= config.global_sat_max) {
      alert("Global saturation min must be smaller than global saturation max.");
      return;
    }
    if (config.pretest_mode === "manual") {
      if (inspectBounds.sizeMin >= inspectBounds.sizeMax) {
        alert("Run window size min must be smaller than run window size max.");
        return;
      }
      if (inspectBounds.satMin >= inspectBounds.satMax) {
        alert("Run window saturation min must be smaller than run window saturation max.");
        return;
      }
    }

    setLoading(true);
    setResult(null);
    setSnapshotIdx(0);
    try {
      const body = { ...config };
      if (config.pretest_mode === "manual") {
        body.manual_size_min = inspectBounds.sizeMin;
        body.manual_size_max = inspectBounds.sizeMax;
        body.manual_sat_min = inspectBounds.satMin;
        body.manual_sat_max = inspectBounds.satMax;
      }
      if (body.seed === "" || body.seed == null) {
        delete body.seed;
      } else {
        body.seed = Number(body.seed);
      }
      const r = await fetch(`${API}/tuning/simulate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const err = await r.json();
        alert(`Simulation failed: ${err.detail || r.status}`);
        return;
      }
      const data = await r.json();
      setResult(data);
      // Start at last snapshot
      if (data.snapshots?.length > 0) {
        setSnapshotIdx(data.snapshots.length - 1);
      }
    } catch (err) {
      alert(`Simulation error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const snapshot = result?.snapshots?.[snapshotIdx] ?? null;
  const inspectValid =
    inspectBounds.sizeMin < inspectBounds.sizeMax &&
    inspectBounds.satMin < inspectBounds.satMax;
  const algorithmBounds = inspectValid
    ? inspectBounds
    : {
        sizeMin: config.global_size_min,
        sizeMax: config.global_size_max,
        satMin: config.global_sat_min,
        satMax: config.global_sat_max,
      };
  const viewedHeatmap = sliceHeatmap(result?.ground_truth_heatmap, algorithmBounds);

  useEffect(() => {
    if (!result || !snapshot || !inspectValid) {
      setAlgoHeatmap(null);
      setAlgoHeatmapScore(null);
      setAlgoHeatmapError(null);
      setAlgoHeatmapLoading(false);
      return;
    }

    const trials = Array.isArray(snapshot.trials) ? snapshot.trials : [];
    if (trials.length === 0) {
      setAlgoHeatmap(null);
      setAlgoHeatmapScore(null);
      setAlgoHeatmapError("No trials available for smoothing.");
      setAlgoHeatmapLoading(false);
      return;
    }

    const controller = new AbortController();
    let active = true;

    const loadHeatmap = async () => {
      setAlgoHeatmapLoading(true);
      setAlgoHeatmapError(null);
      try {
        const response = await fetch(`${API}/tuning/smooth-heatmap`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            model_name: config.model_name,
            trials: trials.map((t) => ({
              triangle_size: t.triangle_size,
              saturation: t.saturation,
              success: Boolean(t.success),
            })),
            size_min: algorithmBounds.sizeMin,
            size_max: algorithmBounds.sizeMax,
            sat_min: algorithmBounds.satMin,
            sat_max: algorithmBounds.satMax,
            steps: config.algorithm_heatmap_steps,
          }),
        });

        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(payload?.detail || `Heatmap request failed (${response.status})`);
        }

        const payload = await response.json();
        if (!active) return;
        setAlgoHeatmap(payload.heatmap || null);
        setAlgoHeatmapScore(
          typeof payload.error_score === "number" ? payload.error_score : null
        );
      } catch (err) {
        if (!active || err.name === "AbortError") return;
        setAlgoHeatmap(null);
        setAlgoHeatmapScore(null);
        setAlgoHeatmapError(err.message || "Failed to compute heatmap.");
      } finally {
        if (active) setAlgoHeatmapLoading(false);
      }
    };

    loadHeatmap();

    return () => {
      active = false;
      controller.abort();
    };
  }, [
    result,
    snapshot,
    snapshotIdx,
    inspectValid,
    config.model_name,
    config.algorithm_heatmap_steps,
    algorithmBounds.sizeMin,
    algorithmBounds.sizeMax,
    algorithmBounds.satMin,
    algorithmBounds.satMax,
  ]);

  return (
    <div className="tuning-container">
      <div className="tuning-header">
        <h1 className="tuning-title">Algorithm Tuning</h1>
        <p className="tuning-subtitle">
          Simulate the algorithm against ground-truth models and inspect snapshots
        </p>
      </div>

      {/* Config panel */}
      <div className="tuning-config">
        <div className="tuning-config-row">
          <div className="tuning-param">
            <label>Model</label>
            <select
              value={config.model_name}
              onChange={(e) => setConfig((c) => ({ ...c, model_name: e.target.value }))}
            >
              {models.map((m) => (
                <option key={m.name} value={m.name}>{m.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="tuning-config-row">
          <div className="tuning-config-section">
            <h3>Pretest</h3>
            <div className="tuning-mode-row">
              <label className="tuning-mode-option">
                <input
                  type="radio"
                  name="tuning_pretest_mode"
                  value="run"
                  checked={config.pretest_mode === "run"}
                  onChange={() => setPretestMode("run")}
                />
                <span>Run pretest</span>
              </label>
              <label className="tuning-mode-option">
                <input
                  type="radio"
                  name="tuning_pretest_mode"
                  value="manual"
                  checked={config.pretest_mode === "manual"}
                  onChange={() => setPretestMode("manual")}
                />
                <span>Skip pretest (manual window)</span>
              </label>
            </div>

            {config.pretest_mode === "run" && (
              <div className="tuning-params">
                <div className="tuning-param">
                  <label>Lower target</label>
                  <input type="number" step="0.05" value={config.lower_target}
                    onChange={(e) => setField("lower_target", e.target.value, config.lower_target)} />
                </div>
                <div className="tuning-param">
                  <label>Upper target</label>
                  <input type="number" step="0.05" value={config.upper_target}
                    onChange={(e) => setField("upper_target", e.target.value, config.upper_target)} />
                </div>
                <div className="tuning-param">
                  <label>Success target</label>
                  <input type="number" min="1" value={config.success_target}
                    onChange={(e) => setField("success_target", e.target.value, config.success_target)} />
                </div>
                <div className="tuning-param">
                  <label>Trial cap</label>
                  <input type="number" min="1" value={config.trial_cap}
                    onChange={(e) => setField("trial_cap", e.target.value, config.trial_cap)} />
                </div>
                <div className="tuning-param">
                  <label>Probes/axis</label>
                  <input type="number" min="1" value={config.max_probes_per_axis}
                    onChange={(e) => setField("max_probes_per_axis", e.target.value, config.max_probes_per_axis)} />
                </div>
                <div className="tuning-param">
                  <label>Refine steps</label>
                  <input type="number" min="1" value={config.refine_steps_per_edge}
                    onChange={(e) => setField("refine_steps_per_edge", e.target.value, config.refine_steps_per_edge)} />
                </div>
              </div>
            )}

          </div>

          <div className="tuning-config-section">
            <h3>Simulation Space</h3>
            <div className="tuning-params">
              <div className="tuning-param">
                <label>Heatmap size min</label>
                <input type="number" value={config.global_size_min}
                  onChange={(e) => setField("global_size_min", e.target.value, config.global_size_min)} />
              </div>
              <div className="tuning-param">
                <label>Heatmap size max</label>
                <input type="number" value={config.global_size_max}
                  onChange={(e) => setField("global_size_max", e.target.value, config.global_size_max)} />
              </div>
              <div className="tuning-param">
                <label>Heatmap sat min</label>
                <input type="number" step="0.01" value={config.global_sat_min}
                  onChange={(e) => setField("global_sat_min", e.target.value, config.global_sat_min)} />
              </div>
              <div className="tuning-param">
                <label>Heatmap sat max</label>
                <input type="number" step="0.01" value={config.global_sat_max}
                  onChange={(e) => setField("global_sat_max", e.target.value, config.global_sat_max)} />
              </div>
            </div>
            <p className="tuning-inspect-hint">
              This is the full simulated space. Pretest searches inside this range.
            </p>
          </div>

          <div className="tuning-config-section">
            <h3>Run / Inspection Window</h3>
            <div className="tuning-params">
              <div className="tuning-param">
                <label>Size min</label>
                <input
                  type="number"
                  value={inspectBounds.sizeMin}
                  onChange={(e) => setInspectField("sizeMin", e.target.value, inspectBounds.sizeMin)}
                />
              </div>
              <div className="tuning-param">
                <label>Size max</label>
                <input
                  type="number"
                  value={inspectBounds.sizeMax}
                  onChange={(e) => setInspectField("sizeMax", e.target.value, inspectBounds.sizeMax)}
                />
              </div>
              <div className="tuning-param">
                <label>Sat min</label>
                <input
                  type="number"
                  step="0.01"
                  value={inspectBounds.satMin}
                  onChange={(e) => setInspectField("satMin", e.target.value, inspectBounds.satMin)}
                />
              </div>
              <div className="tuning-param">
                <label>Sat max</label>
                <input
                  type="number"
                  step="0.01"
                  value={inspectBounds.satMax}
                  onChange={(e) => setInspectField("satMax", e.target.value, inspectBounds.satMax)}
                />
              </div>
            </div>
            <div className="tuning-inline-actions">
              {result?.final_bounds && (
                <button
                  className="tuning-small-btn"
                  onClick={() =>
                    setInspectBounds({
                      sizeMin: result.final_bounds.size_lower,
                      sizeMax: result.final_bounds.size_upper,
                      satMin: result.final_bounds.saturation_lower,
                      satMax: result.final_bounds.saturation_upper,
                    })
                  }
                >
                  Use final bounds
                </button>
              )}
              <button
                className="tuning-small-btn"
                onClick={() =>
                  setInspectBounds({
                    sizeMin: config.global_size_min,
                    sizeMax: config.global_size_max,
                    satMin: config.global_sat_min,
                    satMax: config.global_sat_max,
                  })
                }
              >
                Use simulation space
              </button>
            </div>
            <p className="tuning-inspect-hint">
              Used for inspection always. In "Skip pretest" mode, these are also the run bounds.
            </p>
          </div>

          <div className="tuning-config-section">
            <h3>Main Algorithm</h3>
            <div className="tuning-params">
              <div className="tuning-param">
                <label>Iterations</label>
                <input type="number" min="1" max="5000" value={config.main_iterations}
                  onChange={(e) => setField("main_iterations", e.target.value, config.main_iterations)} />
              </div>
              <div className="tuning-param">
                <label>Success thresh</label>
                <input type="number" step="0.05" value={config.success_rate_threshold}
                  onChange={(e) => setField("success_rate_threshold", e.target.value, config.success_rate_threshold)} />
              </div>
              <div className="tuning-param">
                <label>Sample thresh</label>
                <input type="number" min="1" value={config.total_samples_threshold}
                  onChange={(e) => setField("total_samples_threshold", e.target.value, config.total_samples_threshold)} />
              </div>
              <div className="tuning-param">
                <label>Max samples</label>
                <input type="number" min="1" value={config.max_samples_before_split}
                  onChange={(e) => setField("max_samples_before_split", e.target.value, config.max_samples_before_split)} />
              </div>
              <div className="tuning-param">
                <label>Snap interval</label>
                <input type="number" min="1" value={config.main_snapshot_interval}
                  onChange={(e) => setField("main_snapshot_interval", e.target.value, config.main_snapshot_interval)} />
              </div>
              <div className="tuning-param">
                <label>GT heatmap res</label>
                <input type="number" min="10" max="500" value={config.heatmap_steps}
                  onChange={(e) => setField("heatmap_steps", e.target.value, config.heatmap_steps)} />
              </div>
              <div className="tuning-param">
                <label>Algo heatmap res</label>
                <input type="number" min="10" max="500" value={config.algorithm_heatmap_steps}
                  onChange={(e) => setField("algorithm_heatmap_steps", e.target.value, config.algorithm_heatmap_steps)} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Run controls */}
      <div className="tuning-controls">
        <button
          className="tuning-run-btn"
          onClick={runSimulation}
          disabled={loading || !config.model_name}
        >
          <svg viewBox="0 0 24 24" fill="currentColor">
            <polygon points="5,3 19,12 5,21" />
          </svg>
          {loading ? "Running..." : "Run Simulation"}
        </button>
        <div className="tuning-seed">
          <label>Seed:</label>
          <input
            type="number"
            placeholder="random"
            value={config.seed}
            onChange={(e) => setConfig((c) => ({ ...c, seed: e.target.value }))}
          />
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="tuning-loading">
          Simulating...
        </div>
      )}

      {/* Results */}
      {result && !loading && (
        <div className="tuning-results">
          {/* Snapshot navigator */}
          {result.snapshots.length > 1 && (
            <div className="snapshot-navigator">
              <button
                className="snapshot-btn"
                disabled={snapshotIdx <= 0}
                onClick={() => setSnapshotIdx((i) => Math.max(0, i - 1))}
              >
                &#x25C0;
              </button>
              <input
                type="range"
                className="snapshot-slider"
                min={0}
                max={result.snapshots.length - 1}
                value={snapshotIdx}
                onChange={(e) => setSnapshotIdx(Number(e.target.value))}
              />
              <button
                className="snapshot-btn"
                disabled={snapshotIdx >= result.snapshots.length - 1}
                onClick={() => setSnapshotIdx((i) => Math.min(result.snapshots.length - 1, i + 1))}
              >
                &#x25B6;
              </button>
              <div className="snapshot-info">
                Snapshot {snapshotIdx + 1}/{result.snapshots.length}
                {snapshot && (
                  <>
                    <span className={`snapshot-phase ${snapshot.phase}`}>
                      {snapshot.phase}
                    </span>
                    {" "}{snapshot.trial_count} trials
                  </>
                )}
              </div>
            </div>
          )}

          {/* Side-by-side canvases */}
          <div className="tuning-canvas-grid">
            <div className="tuning-canvas-panel">
              <div className="tuning-panel-header">
                <h4>
                  Algorithm Progress
                  {snapshot?.phase === "main" ? " (inspection window)" : ""}
                </h4>
                <div className="tuning-view-toggle">
                  <button
                    className={algorithmView === "rectangles" ? "active" : ""}
                    onClick={() => setAlgorithmView("rectangles")}
                  >
                    Rectangles
                  </button>
                  <button
                    className={algorithmView === "heatmap" ? "active" : ""}
                    onClick={() => setAlgorithmView("heatmap")}
                    disabled={!algoHeatmap && !algoHeatmapLoading}
                    title={
                      !algoHeatmap && !algoHeatmapLoading
                        ? "Heatmap not available for this snapshot/window yet."
                        : ""
                    }
                  >
                    Heatmap
                  </button>
                </div>
              </div>
              {snapshot && algorithmView === "rectangles" && (
                <AlgorithmCanvas
                  snapshot={snapshot}
                  bounds={algorithmBounds}
                  finalBounds={result.final_bounds}
                />
              )}
              {snapshot && algorithmView === "heatmap" && algoHeatmap && (
                <HeatmapCanvas
                  heatmap={algoHeatmap}
                  showLegend={false}
                  plotWidth={500}
                  plotHeight={400}
                />
              )}
              {snapshot && algorithmView === "heatmap" && algoHeatmapLoading && (
                <div className="tuning-canvas-empty">
                  Calculating smoothed heatmap...
                </div>
              )}
              {snapshot && algorithmView === "heatmap" && !algoHeatmapLoading && !algoHeatmap && (
                <div className="tuning-canvas-empty">
                  {algoHeatmapError || "Heatmap view unavailable for this snapshot/window."}
                </div>
              )}
              <p className="tuning-canvas-note">
                {algorithmView === "rectangles"
                  ? "Label = successes/total visible main-phase dots inside this rectangle at this snapshot. Fill color uses the same ratio (red low, green high). No label means 0 samples or box too small for text."
                  : "Heatmap color = soft-brush smoothed success surface (same method as analysis plot)."}
              </p>
              {algorithmView === "heatmap" && algoHeatmapScore != null && (
                <p className="tuning-canvas-score">
                  Error score (MSE x 100, inspection window): {algoHeatmapScore.toFixed(4)}
                </p>
              )}
            </div>
            <div className="tuning-canvas-panel">
              <h4>Ground Truth</h4>
              <HeatmapCanvas
                heatmap={viewedHeatmap}
                showLegend={false}
                plotWidth={500}
                plotHeight={400}
              />
            </div>
          </div>

          {/* Stats */}
          <TuningStats result={result} snapshot={snapshot} />

          {/* Warnings */}
          {result.warnings.length > 0 && (
            <div className="tuning-warnings">
              <strong>Warnings:</strong>
              <ul>
                {result.warnings.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}


/* ══════════════════════════════════════════════════════════
   Algorithm Canvas - shows pretest probes + main rectangles
   ══════════════════════════════════════════════════════════ */
function AlgorithmCanvas({ snapshot, bounds, finalBounds }) {
  const canvasRef = useRef(null);
  const { sizeMin, sizeMax, satMin, satMax } = bounds;

  const mLeft = 60, mBottom = 50, mTop = 14, mRight = 20;
  const plotW = 500;
  const plotH = 400;
  const totalW = plotW + mLeft + mRight;
  const totalH = plotH + mTop + mBottom;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const margin = { left: mLeft, bottom: mBottom, top: mTop, right: mRight };
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    canvas.width = totalW * dpr;
    canvas.height = totalH * dpr;
    canvas.style.width = totalW + "px";
    canvas.style.height = totalH + "px";
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, totalW, totalH);

    // Background
    ctx.fillStyle = "#f5f5f0";
    ctx.fillRect(margin.left, margin.top, plotW, plotH);

    // Coordinate helpers
    const sizeRange = Math.max(sizeMax - sizeMin, 1e-9);
    const satRange = Math.max(satMax - satMin, 1e-9);
    const toX = (ts) => margin.left + ((ts - sizeMin) / sizeRange) * plotW;
    const toY = (sat) => margin.top + (1 - (sat - satMin) / satRange) * plotH;
    const mainTrials = (snapshot.trials || []).filter((t) => t.phase === "main");
    const rectangles = snapshot.rectangles || [];

    // Build display stats from visible dots so labels/colors match what the user sees.
    const rectDisplayStats = rectangles.map(() => ({
      trueSamples: 0,
      falseSamples: 0,
    }));
    if (rectangles.length > 0 && mainTrials.length > 0) {
      const eps = 1e-9;
      for (const trial of mainTrials) {
        const idx = rectangles.findIndex((rect) => {
          const [tsMin, tsMax] = rect.bounds_ts;
          const [satMinRect, satMaxRect] = rect.bounds_sat;

          // Half-open cells on upper bounds, except global max edges, to avoid double assignment.
          const inTs =
            trial.triangle_size >= tsMin - eps &&
            (trial.triangle_size < tsMax - eps || Math.abs(tsMax - sizeMax) <= eps);
          const inSat =
            trial.saturation >= satMinRect - eps &&
            (trial.saturation < satMaxRect - eps || Math.abs(satMaxRect - satMax) <= eps);

          return inTs && inSat;
        });

        if (idx >= 0) {
          if (trial.success) {
            rectDisplayStats[idx].trueSamples += 1;
          } else {
            rectDisplayStats[idx].falseSamples += 1;
          }
        }
      }
    }

    // Draw pretest bounds if available
    if (finalBounds && snapshot.phase !== "pretest") {
      const bx1 = toX(finalBounds.size_lower);
      const bx2 = toX(finalBounds.size_upper);
      const by1 = toY(finalBounds.saturation_upper);
      const by2 = toY(finalBounds.saturation_lower);
      ctx.strokeStyle = "rgba(33, 150, 243, 0.6)";
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(bx1, by1, bx2 - bx1, by2 - by1);
      ctx.setLineDash([]);
    }

    // Draw main algorithm rectangles
    if (rectangles.length > 0) {
      for (let i = 0; i < rectangles.length; i += 1) {
        const rect = rectangles[i];
        const x1 = toX(rect.bounds_ts[0]);
        const x2 = toX(rect.bounds_ts[1]);
        const y1 = toY(rect.bounds_sat[1]);
        const y2 = toY(rect.bounds_sat[0]);
        const trueSamples = rectDisplayStats[i]?.trueSamples ?? 0;
        const falseSamples = rectDisplayStats[i]?.falseSamples ?? 0;
        const total = trueSamples + falseSamples;
        const sr = total > 0 ? trueSamples / total : 0.5;

        // Fill with success-rate color
        const p = 0.3 + sr * 0.7; // map to rdYlGn range
        ctx.fillStyle = rdYlGn(p);
        ctx.globalAlpha = 0.6;
        ctx.fillRect(x1, y1, x2 - x1, y2 - y1);
        ctx.globalAlpha = 1;

        // Border
        ctx.strokeStyle = "rgba(0,0,0,0.3)";
        ctx.lineWidth = 1;
        ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);

        // Label: visible successes/total inside this rectangle for the current snapshot.
        if (total > 0 && (x2 - x1) > 34 && (y2 - y1) > 16) {
          ctx.fillStyle = "rgba(0,0,0,0.7)";
          ctx.font = "9px monospace";
          ctx.textAlign = "center";
          ctx.fillText(
            `${trueSamples}/${total}`,
            (x1 + x2) / 2,
            (y1 + y2) / 2 + 3
          );
        }
      }
    }

    // Draw pretest probes
    if (snapshot.completed_probes && snapshot.completed_probes.length > 0) {
      for (const probe of snapshot.completed_probes) {
        let px, py;
        if (probe.axis === "size") {
          px = toX(probe.value);
          py = toY(satMax); // probed at max saturation
        } else {
          // Use size_95 from pretest summary if available
          const sizeAt = snapshot.pretest_summary?.size_upper ?? (sizeMin + sizeMax) / 2;
          px = toX(sizeAt);
          py = toY(probe.value);
        }

        const p = 0.3 + probe.p_hat * 0.7;
        ctx.fillStyle = rdYlGn(p);
        ctx.strokeStyle = "rgba(0,0,0,0.5)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(px, py, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Label
        ctx.fillStyle = "rgba(0,0,0,0.8)";
        ctx.font = "8px monospace";
        ctx.textAlign = "center";
        ctx.fillText(`${(probe.p_hat * 100).toFixed(0)}%`, px, py - 9);
      }
    }

    // Draw trial dots (from current snapshot's trials)
    if (mainTrials.length > 0) {
      // Only draw main phase trials as dots (pretest probes already shown)
      for (const trial of mainTrials) {
        const px = toX(trial.triangle_size);
        const py = toY(trial.saturation);
        ctx.fillStyle = trial.success
          ? "rgba(46, 125, 50, 0.5)"
          : "rgba(198, 40, 40, 0.5)";
        ctx.beginPath();
        ctx.arc(px, py, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Axes border
    ctx.strokeStyle = "#999";
    ctx.lineWidth = 1;
    ctx.strokeRect(margin.left, margin.top, plotW, plotH);

    // X-axis labels
    ctx.fillStyle = "#7c7a72";
    ctx.font = "10px monospace";
    ctx.textAlign = "center";
    const xTicks = 6;
    for (let i = 0; i <= xTicks; i++) {
      const v = sizeMin + (sizeMax - sizeMin) * (i / xTicks);
      const x = toX(v);
      ctx.fillText(Math.round(v).toString(), x, margin.top + plotH + 16);
    }
    ctx.font = "11px sans-serif";
    ctx.fillText("Triangle Size (px)", margin.left + plotW / 2, margin.top + plotH + 38);

    // Y-axis labels
    ctx.font = "10px monospace";
    ctx.textAlign = "right";
    const yTicks = 5;
    for (let i = 0; i <= yTicks; i++) {
      const v = satMin + (satMax - satMin) * (i / yTicks);
      const y = toY(v);
      ctx.fillText(v.toFixed(2), margin.left - 6, y + 3);
    }
    ctx.save();
    ctx.translate(14, margin.top + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = "center";
    ctx.font = "11px sans-serif";
    ctx.fillText("Saturation", 0, 0);
    ctx.restore();
  }, [snapshot, bounds, finalBounds, sizeMin, sizeMax, satMin, satMax,
      plotW, plotH, totalW, totalH, mLeft, mTop, mRight, mBottom]);

  return (
    <div className="algo-canvas-wrapper">
      <canvas ref={canvasRef} className="algo-canvas" />
    </div>
  );
}


/* ══════════════════════════════════════════════════════════
   Stats display
   ══════════════════════════════════════════════════════════ */
function TuningStats({ result, snapshot }) {
  if (!result) return null;

  const rectCount = snapshot?.rectangles?.length ?? 0;
  const probeCount = snapshot?.completed_probes?.length ?? 0;
  const ps = snapshot?.pretest_summary;

  return (
    <div className="tuning-stats">
      <div className="tuning-stat">
        <span className="tuning-stat-label">Total trials</span>
        <span className="tuning-stat-value">{result.total_trials}</span>
      </div>
      <div className="tuning-stat">
        <span className="tuning-stat-label">Pretest trials</span>
        <span className="tuning-stat-value">{result.pretest_trials}</span>
      </div>
      <div className="tuning-stat">
        <span className="tuning-stat-label">Main trials</span>
        <span className="tuning-stat-value">{result.main_trials}</span>
      </div>
      <div className="tuning-stat">
        <span className="tuning-stat-label">Rectangles</span>
        <span className="tuning-stat-value">{rectCount}</span>
      </div>
      <div className="tuning-stat">
        <span className="tuning-stat-label">Probes completed</span>
        <span className="tuning-stat-value">{probeCount}</span>
      </div>
      {result.final_bounds && (
        <>
          <div className="tuning-stat">
            <span className="tuning-stat-label">Size bounds</span>
            <span className="tuning-stat-value">
              [{result.final_bounds.size_lower}, {result.final_bounds.size_upper}]
            </span>
          </div>
          <div className="tuning-stat">
            <span className="tuning-stat-label">Sat bounds</span>
            <span className="tuning-stat-value">
              [{result.final_bounds.saturation_lower}, {result.final_bounds.saturation_upper}]
            </span>
          </div>
        </>
      )}
      {ps && snapshot?.phase === "pretest" && (
        <>
          <div className="tuning-stat">
            <span className="tuning-stat-label">Axis</span>
            <span className="tuning-stat-value">{ps.current_axis}</span>
          </div>
          <div className="tuning-stat">
            <span className="tuning-stat-label">Phase</span>
            <span className="tuning-stat-value">{ps.search_phase}</span>
          </div>
        </>
      )}
    </div>
  );
}

export default TuningPage;
