import { useState, useEffect, useRef } from "react";
import "../css/TuningPage.css";
import HeatmapCanvas, { rdYlGn } from "./shared/HeatmapCanvas";
import DeltaHeatmapCanvas from "./shared/DeltaHeatmapCanvas";

const API = "http://localhost:8000/api";
const LEGACY_BRUSH_BASE_RANGE = 250;
const LEGACY_BRUSH_INNER = 9.8;
const LEGACY_BRUSH_OUTER = 96.7;
const INITIAL_BOUNDS = {
  sizeMin: 1,
  sizeMax: 100,
  satMin: 0,
  satMax: 1,
};
const INITIAL_COMPARISON_CONFIG = {
  size_shift_min: -8,
  size_shift_max: 8,
  size_shift_steps: 9,
  sat_shift_min: -0.08,
  sat_shift_max: 0.08,
  sat_shift_steps: 9,
  surface_steps: 80,
  repeats: 4,
};
const CONTOUR_LEVELS = [
  { value: 0.26, label: "26%" },
  { value: 0.75, label: "75%" },
  { value: 0.9, label: "90%" },
  { value: 1.0, label: "100%" },
];

function getLegacyBrushDefaults(sizeMin, sizeMax) {
  const sizeRange = Math.max(sizeMax - sizeMin, 1e-9);
  const scale = sizeRange / LEGACY_BRUSH_BASE_RANGE;
  return {
    inner: (LEGACY_BRUSH_INNER * scale).toFixed(2),
    outer: (LEGACY_BRUSH_OUTER * scale).toFixed(2),
  };
}

function parseNum(raw, fallback) {
  if (raw === "" || raw == null) return fallback;
  const n = Number(raw);
  return isNaN(n) ? fallback : n;
}

function parseOptionalNum(raw) {
  if (raw === "" || raw == null) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
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

function buildSmoothTrials(trials) {
  return trials.map((t) => ({
    triangle_size: t.triangle_size,
    saturation: t.saturation,
    success: Boolean(t.success),
  }));
}

function formatSigned(value, digits = 2) {
  if (!Number.isFinite(value)) return "n/a";
  const fixed = Number(value).toFixed(digits);
  return value > 0 ? `+${fixed}` : fixed;
}

function makeFocusKey(sizeShift, satShift) {
  return `${Number(sizeShift).toFixed(6)}|${Number(satShift).toFixed(6)}`;
}

function parseFocusKey(key) {
  if (!key || typeof key !== "string") return null;
  const [sizeRaw, satRaw] = key.split("|");
  const sizeShift = Number(sizeRaw);
  const satShift = Number(satRaw);
  if (!Number.isFinite(sizeShift) || !Number.isFinite(satShift)) return null;
  return { sizeShift, satShift };
}

function dedupeClose(values, eps = 1e-6) {
  if (!Array.isArray(values) || values.length === 0) return [];
  const sorted = [...values].sort((a, b) => a - b);
  const out = [sorted[0]];
  for (let i = 1; i < sorted.length; i += 1) {
    if (Math.abs(sorted[i] - out[out.length - 1]) > eps) {
      out.push(sorted[i]);
    }
  }
  return out;
}

function findEdgeCrossings(axisValues, samples, threshold) {
  if (!Array.isArray(axisValues) || !Array.isArray(samples)) return [];
  if (axisValues.length < 2 || samples.length < 2 || axisValues.length !== samples.length) {
    return [];
  }

  const crossings = [];
  for (let i = 0; i < samples.length - 1; i += 1) {
    const v1 = Number(samples[i]);
    const v2 = Number(samples[i + 1]);
    const a1 = Number(axisValues[i]);
    const a2 = Number(axisValues[i + 1]);
    if (!Number.isFinite(v1) || !Number.isFinite(v2) || !Number.isFinite(a1) || !Number.isFinite(a2)) {
      continue;
    }

    const d1 = v1 - threshold;
    const d2 = v2 - threshold;
    if (d1 === 0 && d2 === 0) {
      crossings.push(a1, a2);
      continue;
    }
    if (d1 === 0) {
      crossings.push(a1);
      continue;
    }
    if (d2 === 0) {
      crossings.push(a2);
      continue;
    }
    if (d1 * d2 > 0) continue;

    const denom = v2 - v1;
    const t = Math.abs(denom) < 1e-9 ? 0.5 : (threshold - v1) / denom;
    crossings.push(a1 + (a2 - a1) * t);
  }
  return dedupeClose(crossings);
}

function computeContourCrossings(heatmap) {
  if (!heatmap?.grid || !heatmap?.triangle_sizes || !heatmap?.saturations) return [];
  const xs = heatmap.triangle_sizes;
  const ys = heatmap.saturations;
  const grid = heatmap.grid;
  if (!Array.isArray(grid) || grid.length !== ys.length || ys.length < 2 || xs.length < 2) return [];

  const top = grid[ys.length - 1];
  const bottom = grid[0];
  const left = grid.map((row) => row[0]);
  const right = grid.map((row) => row[row.length - 1]);

  return CONTOUR_LEVELS.map((level) => ({
    level: level.label,
    top: findEdgeCrossings(xs, top, level.value),
    bottom: findEdgeCrossings(xs, bottom, level.value),
    left: findEdgeCrossings(ys, left, level.value),
    right: findEdgeCrossings(ys, right, level.value),
  }));
}

function formatCrossingList(values, digits = 1) {
  if (!Array.isArray(values) || values.length === 0) return "none";
  return values.map((v) => Number(v).toFixed(digits)).join(", ");
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
  const [manualBounds, setManualBounds] = useState({
    ...INITIAL_BOUNDS,
  });
  const [inspectBounds, setInspectBounds] = useState({
    ...INITIAL_BOUNDS,
  });
  const [brushConfig, setBrushConfig] = useState(() =>
    getLegacyBrushDefaults(INITIAL_BOUNDS.sizeMin, INITIAL_BOUNDS.sizeMax)
  );
  const [brushUsesLegacyDefault, setBrushUsesLegacyDefault] = useState(true);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [snapshotIdx, setSnapshotIdx] = useState(0);
  const [algorithmView, setAlgorithmView] = useState("rectangles");
  const [algoHeatmap, setAlgoHeatmap] = useState(null);
  const [algoHeatmapScore, setAlgoHeatmapScore] = useState(null);
  const [algoHeatmapLoading, setAlgoHeatmapLoading] = useState(false);
  const [algoHeatmapError, setAlgoHeatmapError] = useState(null);
  const [scoreTimeline, setScoreTimeline] = useState([]);
  const [scoreTimelineLoading, setScoreTimelineLoading] = useState(false);
  const [scoreTimelineError, setScoreTimelineError] = useState(null);
  const [resultsTab, setResultsTab] = useState("progress");
  const [comparisonConfig, setComparisonConfig] = useState({
    ...INITIAL_COMPARISON_CONFIG,
  });
  const [comparisonLoading, setComparisonLoading] = useState(false);
  const [comparisonError, setComparisonError] = useState(null);
  const [comparisonResult, setComparisonResult] = useState(null);
  const [comparisonFocusKey, setComparisonFocusKey] = useState("");
  const [comparisonRunSeed, setComparisonRunSeed] = useState(null);

  useEffect(() => {
    fetch(`${API}/settings/simulation-models`)
      .then((r) => r.json())
      .then((data) => setModels(data))
      .catch(() => {});
  }, []);

  const setField = (key, raw, fallback) => {
    setConfig((c) => ({ ...c, [key]: parseNum(raw, fallback) }));
  };
  const setManualField = (key, raw, fallback) => {
    setManualBounds((b) => ({ ...b, [key]: parseNum(raw, fallback) }));
  };
  const setInspectField = (key, raw, fallback) => {
    setInspectBounds((b) => ({ ...b, [key]: parseNum(raw, fallback) }));
  };
  const setBrushField = (key, raw) => {
    setBrushUsesLegacyDefault(false);
    setBrushConfig((b) => ({ ...b, [key]: raw }));
  };
  const setComparisonField = (key, raw, fallback) => {
    setComparisonConfig((c) => ({ ...c, [key]: parseNum(raw, fallback) }));
  };

  const setPretestMode = (mode) => {
    setConfig((c) => ({ ...c, pretest_mode: mode }));
  };

  const buildSimulationPayload = () => {
    const body = { ...config };
    if (config.pretest_mode === "manual") {
      body.manual_size_min = manualBounds.sizeMin;
      body.manual_size_max = manualBounds.sizeMax;
      body.manual_sat_min = manualBounds.satMin;
      body.manual_sat_max = manualBounds.satMax;
    }
    if (body.seed === "" || body.seed == null) {
      delete body.seed;
    } else {
      body.seed = Number(body.seed);
    }
    return body;
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
      if (manualBounds.sizeMin >= manualBounds.sizeMax) {
        alert("Manual run size min must be smaller than max.");
        return;
      }
      if (manualBounds.satMin >= manualBounds.satMax) {
        alert("Manual run saturation min must be smaller than max.");
        return;
      }
    }

    setLoading(true);
    setResult(null);
    setSnapshotIdx(0);
    setResultsTab("progress");
    setComparisonError(null);
    setComparisonResult(null);
    setComparisonFocusKey("");
    setComparisonRunSeed(null);
    try {
      const body = buildSimulationPayload();
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
  const legacyBrushDefaults = getLegacyBrushDefaults(
    algorithmBounds.sizeMin,
    algorithmBounds.sizeMax
  );
  const innerRadius = parseOptionalNum(brushConfig.inner);
  const outerRadius = parseOptionalNum(brushConfig.outer);
  const brushPairValid =
    innerRadius == null || outerRadius == null || outerRadius > innerRadius;
  const buildSmoothPayload = (trials, includeHeatmap = true) => ({
    model_name: config.model_name,
    trials: buildSmoothTrials(trials),
    size_min: algorithmBounds.sizeMin,
    size_max: algorithmBounds.sizeMax,
    sat_min: algorithmBounds.satMin,
    sat_max: algorithmBounds.satMax,
    steps: config.algorithm_heatmap_steps,
    include_heatmap: includeHeatmap,
    ...(innerRadius != null ? { inner_radius: innerRadius } : {}),
    ...(outerRadius != null ? { outer_radius: outerRadius } : {}),
  });
  const buildComparisonPayload = (focusOverride = null) => {
    const simulationPayload = buildSimulationPayload();
    let resolvedSeed = simulationPayload.seed;
    if (resolvedSeed == null) {
      resolvedSeed = comparisonRunSeed ?? Math.floor(Math.random() * 1_000_000_000);
      simulationPayload.seed = resolvedSeed;
      if (comparisonRunSeed == null) {
        setComparisonRunSeed(resolvedSeed);
      }
    } else {
      setComparisonRunSeed(resolvedSeed);
    }

    const resolvedFocus = focusOverride || parseFocusKey(comparisonFocusKey);
    return {
    simulation: simulationPayload,
    inspect_size_min: algorithmBounds.sizeMin,
    inspect_size_max: algorithmBounds.sizeMax,
    inspect_sat_min: algorithmBounds.satMin,
    inspect_sat_max: algorithmBounds.satMax,
    size_shift_min: comparisonConfig.size_shift_min,
    size_shift_max: comparisonConfig.size_shift_max,
    size_shift_steps: Math.max(1, Math.round(comparisonConfig.size_shift_steps)),
    sat_shift_min: comparisonConfig.sat_shift_min,
    sat_shift_max: comparisonConfig.sat_shift_max,
    sat_shift_steps: Math.max(1, Math.round(comparisonConfig.sat_shift_steps)),
    repeats: Math.max(2, Math.round(comparisonConfig.repeats)),
    estimate_steps: Math.max(20, Math.round(comparisonConfig.surface_steps)),
    ...(innerRadius != null ? { inner_radius: innerRadius } : {}),
    ...(outerRadius != null ? { outer_radius: outerRadius } : {}),
    ...(resolvedFocus
      ? {
          focus_size_shift: resolvedFocus.sizeShift,
          focus_sat_shift: resolvedFocus.satShift,
        }
      : {}),
    };
  };

  const runModelComparison = async ({ focusOverride = null } = {}) => {
    if (!result) {
      return;
    }
    if (!inspectValid) {
      alert("Inspection bounds must be valid before comparing models.");
      return;
    }
    if (!brushPairValid) {
      alert("Outer brush radius must be greater than inner radius.");
      return;
    }
    if (comparisonConfig.size_shift_min > comparisonConfig.size_shift_max) {
      alert("Size shift min must be smaller than or equal to size shift max.");
      return;
    }
    if (comparisonConfig.sat_shift_min > comparisonConfig.sat_shift_max) {
      alert("Saturation shift min must be smaller than or equal to saturation shift max.");
      return;
    }

    setComparisonLoading(true);
    setComparisonError(null);
    try {
      const comparisonResponse = await fetch(`${API}/tuning/discrimination-experiment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildComparisonPayload(focusOverride)),
      });
      if (!comparisonResponse.ok) {
        const payload = await comparisonResponse.json().catch(() => ({}));
        throw new Error(
          payload?.detail || `Comparison request failed (${comparisonResponse.status})`
        );
      }
      const comparisonPayload = await comparisonResponse.json();
      setComparisonResult(comparisonPayload);
      const focus = comparisonPayload?.focus_candidate;
      if (focus) {
        setComparisonFocusKey(makeFocusKey(focus.size_shift, focus.sat_shift));
      }
    } catch (err) {
      setComparisonResult(null);
      setComparisonError(err.message || "Failed to compare shifted models.");
    } finally {
      setComparisonLoading(false);
    }
  };

  const applySelectedFocusModel = async () => {
    const parsed = parseFocusKey(comparisonFocusKey);
    if (!parsed) return;
    await runModelComparison({ focusOverride: parsed });
  };

  useEffect(() => {
    if (!result || !snapshot || !inspectValid) {
      setAlgoHeatmap(null);
      setAlgoHeatmapScore(null);
      setAlgoHeatmapError(null);
      setAlgoHeatmapLoading(false);
      return;
    }
    if (!brushPairValid) {
      setAlgoHeatmap(null);
      setAlgoHeatmapScore(null);
      setAlgoHeatmapLoading(false);
      setAlgoHeatmapError("Outer brush radius must be greater than inner radius.");
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
          body: JSON.stringify(buildSmoothPayload(trials)),
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
    brushPairValid,
    config.model_name,
    config.algorithm_heatmap_steps,
    brushConfig.inner,
    brushConfig.outer,
    algorithmBounds.sizeMin,
    algorithmBounds.sizeMax,
    algorithmBounds.satMin,
    algorithmBounds.satMax,
  ]);

  useEffect(() => {
    if (!result || !inspectValid) {
      setScoreTimeline([]);
      setScoreTimelineError(null);
      setScoreTimelineLoading(false);
      return;
    }
    if (!brushPairValid) {
      setScoreTimeline([]);
      setScoreTimelineLoading(false);
      setScoreTimelineError("Outer brush radius must be greater than inner radius.");
      return;
    }

    const snapshots = Array.isArray(result.snapshots) ? result.snapshots : [];
    const controller = new AbortController();
    let active = true;

    setScoreTimeline([]);
    setScoreTimelineError(null);
    setScoreTimelineLoading(true);

    const loadTimeline = async () => {
      const nextTimeline = [];
      for (let i = 0; i < snapshots.length; i += 1) {
        const current = snapshots[i];
        const trials = Array.isArray(current?.trials) ? current.trials : [];
        if (trials.length === 0) {
          continue;
        }

        try {
          const response = await fetch(`${API}/tuning/smooth-heatmap`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            signal: controller.signal,
            body: JSON.stringify(buildSmoothPayload(trials, false)),
          });

          if (!response.ok) {
            const payload = await response.json().catch(() => ({}));
            throw new Error(payload?.detail || `Timeline score request failed (${response.status})`);
          }

          const payload = await response.json();
          nextTimeline.push({
            snapshotIdx: i,
            trialCount: Number(current?.trial_count ?? trials.length),
            score: typeof payload.error_score === "number" ? payload.error_score : null,
          });
        } catch (err) {
          if (!active || err.name === "AbortError") return;
          nextTimeline.push({
            snapshotIdx: i,
            trialCount: Number(current?.trial_count ?? trials.length),
            score: null,
          });
          setScoreTimelineError(err.message || "Failed to compute timeline score.");
          break;
        }

        if (active) {
          setScoreTimeline([...nextTimeline]);
        }
      }

      if (active) {
        setScoreTimelineLoading(false);
      }
    };

    loadTimeline();

    return () => {
      active = false;
      controller.abort();
    };
  }, [
    result,
    inspectValid,
    brushPairValid,
    config.model_name,
    config.algorithm_heatmap_steps,
    brushConfig.inner,
    brushConfig.outer,
    algorithmBounds.sizeMin,
    algorithmBounds.sizeMax,
    algorithmBounds.satMin,
    algorithmBounds.satMax,
  ]);

  const selectedTimelinePoint = scoreTimeline.find((point) => point.snapshotIdx === snapshotIdx);
  const displayedErrorScore =
    selectedTimelinePoint?.score != null ? selectedTimelinePoint.score : algoHeatmapScore;

  useEffect(() => {
    setComparisonResult(null);
    setComparisonError(null);
    setComparisonFocusKey("");
    setComparisonRunSeed(null);
  }, [
    result,
    config.model_name,
    algorithmBounds.sizeMin,
    algorithmBounds.sizeMax,
    algorithmBounds.satMin,
    algorithmBounds.satMax,
  ]);

  useEffect(() => {
    if (!brushUsesLegacyDefault) return;
    setBrushConfig((current) => {
      if (
        current.inner === legacyBrushDefaults.inner &&
        current.outer === legacyBrushDefaults.outer
      ) {
        return current;
      }
      return legacyBrushDefaults;
    });
  }, [brushUsesLegacyDefault, legacyBrushDefaults.inner, legacyBrushDefaults.outer]);

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

            {config.pretest_mode === "manual" && (
              <>
                <div className="tuning-params">
                  <div className="tuning-param">
                    <label>Manual size min</label>
                    <input
                      type="number"
                      value={manualBounds.sizeMin}
                      onChange={(e) => setManualField("sizeMin", e.target.value, manualBounds.sizeMin)}
                    />
                  </div>
                  <div className="tuning-param">
                    <label>Manual size max</label>
                    <input
                      type="number"
                      value={manualBounds.sizeMax}
                      onChange={(e) => setManualField("sizeMax", e.target.value, manualBounds.sizeMax)}
                    />
                  </div>
                  <div className="tuning-param">
                    <label>Manual sat min</label>
                    <input
                      type="number"
                      step="0.01"
                      value={manualBounds.satMin}
                      onChange={(e) => setManualField("satMin", e.target.value, manualBounds.satMin)}
                    />
                  </div>
                  <div className="tuning-param">
                    <label>Manual sat max</label>
                    <input
                      type="number"
                      step="0.01"
                      value={manualBounds.satMax}
                      onChange={(e) => setManualField("satMax", e.target.value, manualBounds.satMax)}
                    />
                  </div>
                </div>
                <div className="tuning-inline-actions">
                  <button
                    className="tuning-small-btn"
                    onClick={() =>
                      setManualBounds({
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
                  Skip pretest mode uses these bounds for the run.
                </p>
              </>
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

          <div className="tuning-post-config">
            <div className="tuning-config-section">
              <h3>Post-run Controls</h3>
              <div className="tuning-params">
                <div className="tuning-param">
                  <label>Inspect size min</label>
                  <input
                    type="number"
                    value={inspectBounds.sizeMin}
                    onChange={(e) => setInspectField("sizeMin", e.target.value, inspectBounds.sizeMin)}
                  />
                </div>
                <div className="tuning-param">
                  <label>Inspect size max</label>
                  <input
                    type="number"
                    value={inspectBounds.sizeMax}
                    onChange={(e) => setInspectField("sizeMax", e.target.value, inspectBounds.sizeMax)}
                  />
                </div>
                <div className="tuning-param">
                  <label>Inspect sat min</label>
                  <input
                    type="number"
                    step="0.01"
                    value={inspectBounds.satMin}
                    onChange={(e) => setInspectField("satMin", e.target.value, inspectBounds.satMin)}
                  />
                </div>
                <div className="tuning-param">
                  <label>Inspect sat max</label>
                  <input
                    type="number"
                    step="0.01"
                    value={inspectBounds.satMax}
                    onChange={(e) => setInspectField("satMax", e.target.value, inspectBounds.satMax)}
                  />
                </div>
                <div className="tuning-param">
                  <label>Brush inner</label>
                  <input
                    type="number"
                    min="0.01"
                    step="0.1"
                    placeholder="auto default"
                    value={brushConfig.inner}
                    onChange={(e) => setBrushField("inner", e.target.value)}
                  />
                </div>
                <div className="tuning-param">
                  <label>Brush outer</label>
                  <input
                    type="number"
                    min="0.01"
                    step="0.1"
                    placeholder="auto default"
                    value={brushConfig.outer}
                    onChange={(e) => setBrushField("outer", e.target.value)}
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
                <button
                  className="tuning-small-btn"
                  onClick={() => {
                    setBrushUsesLegacyDefault(true);
                    setBrushConfig(legacyBrushDefaults);
                  }}
                >
                  Use legacy brush defaults
                </button>
              </div>
              <p className="tuning-inspect-hint">
                Legacy default brush for current size range: inner {legacyBrushDefaults.inner}, outer {legacyBrushDefaults.outer}. These controls update progress heatmaps immediately and are also used when you run model comparison.
              </p>
            </div>
          </div>

          <div className="tuning-result-tabs" role="tablist" aria-label="Tuning result views">
            <button
              type="button"
              role="tab"
              aria-selected={resultsTab === "progress"}
              className={`tuning-tab-btn ${resultsTab === "progress" ? "active" : ""}`}
              onClick={() => setResultsTab("progress")}
            >
              Progress vs Ground Truth
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={resultsTab === "discrimination"}
              className={`tuning-tab-btn ${resultsTab === "discrimination" ? "active" : ""}`}
              onClick={() => setResultsTab("discrimination")}
            >
              Model Discrimination
            </button>
          </div>

          {resultsTab === "progress" && (
          <>
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
              {algorithmView === "heatmap" && displayedErrorScore != null && (
                <p className="tuning-canvas-score">
                  Error score (MSE x 100, inspection window): {displayedErrorScore.toFixed(4)}
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

          <ErrorScoreTimeline
            series={scoreTimeline}
            loading={scoreTimelineLoading}
            error={scoreTimelineError}
            selectedSnapshotIdx={snapshotIdx}
            onSelectSnapshot={setSnapshotIdx}
          />
          </>
          )}

          {resultsTab === "discrimination" && (
            <ModelDiscriminationPanel
              comparisonConfig={comparisonConfig}
              setComparisonField={setComparisonField}
              runModelComparison={runModelComparison}
              comparisonLoading={comparisonLoading}
              comparisonError={comparisonError}
              comparisonResult={comparisonResult}
              canRun={Boolean(result)}
              focusKey={comparisonFocusKey}
              setFocusKey={setComparisonFocusKey}
              applySelectedFocusModel={applySelectedFocusModel}
            />
          )}
        </div>
      )}
    </div>
  );
}


function ErrorScoreTimeline({
  series,
  loading,
  error,
  selectedSnapshotIdx,
  onSelectSnapshot,
}) {
  const points = (Array.isArray(series) ? series : []).filter(
    (point) => typeof point?.score === "number" && Number.isFinite(point.score)
  );
  const selectedPoint = points.find((point) => point.snapshotIdx === selectedSnapshotIdx);

  if (points.length === 0) {
    return (
      <div className="tuning-score-panel">
        <div className="tuning-score-header">
          <h4>Error score over time</h4>
          <p>MSE x 100 against ground truth by snapshot trial count</p>
        </div>
        <div className="tuning-score-empty">
          {loading ? "Calculating score timeline..." : "No score timeline available yet."}
        </div>
        {error && <p className="tuning-score-error">{error}</p>}
      </div>
    );
  }

  const width = 760;
  const height = 210;
  const margin = { left: 58, right: 16, top: 12, bottom: 36 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;

  const xValues = points.map((point) => point.trialCount);
  const yValues = points.map((point) => point.score);
  const xMin = Math.min(...xValues);
  const xMax = Math.max(...xValues);
  const yMinRaw = Math.min(...yValues);
  const yMaxRaw = Math.max(...yValues);
  const yPadding = Math.max((yMaxRaw - yMinRaw) * 0.12, 0.04);
  const yMin = Math.max(0, yMinRaw - yPadding);
  const yMax = yMaxRaw + yPadding;

  const xDenom = Math.max(xMax - xMin, 1);
  const yDenom = Math.max(yMax - yMin, 1e-9);
  const toX = (x) => margin.left + ((x - xMin) / xDenom) * plotWidth;
  const toY = (y) => margin.top + (1 - (y - yMin) / yDenom) * plotHeight;

  const path = points
    .map((point, idx) => `${idx === 0 ? "M" : "L"} ${toX(point.trialCount)} ${toY(point.score)}`)
    .join(" ");

  const yTicks = Array.from({ length: 5 }, (_, idx) => yMin + (yMax - yMin) * (idx / 4));
  const xTicks =
    xMax === xMin
      ? [xMin]
      : Array.from({ length: 5 }, (_, idx) => xMin + (xMax - xMin) * (idx / 4));

  return (
    <div className="tuning-score-panel">
      <div className="tuning-score-header">
        <h4>Error score over time</h4>
        <p>
          {selectedPoint
            ? `Snapshot ${selectedPoint.snapshotIdx + 1}: ${selectedPoint.score.toFixed(4)} at ${selectedPoint.trialCount} trials`
            : "Click a point to jump to that snapshot."}
          {loading ? " Updating..." : ""}
        </p>
      </div>
      <svg
        className="tuning-score-chart"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Error score over trial count"
      >
        <rect
          x={margin.left}
          y={margin.top}
          width={plotWidth}
          height={plotHeight}
          className="tuning-score-plot-bg"
        />

        {yTicks.map((tick) => (
          <g key={`y-${tick.toFixed(6)}`}>
            <line
              x1={margin.left}
              x2={margin.left + plotWidth}
              y1={toY(tick)}
              y2={toY(tick)}
              className="tuning-score-grid-line"
            />
            <text x={margin.left - 8} y={toY(tick) + 3} className="tuning-score-axis-label" textAnchor="end">
              {tick.toFixed(2)}
            </text>
          </g>
        ))}

        {xTicks.map((tick) => (
          <g key={`x-${tick.toFixed(6)}`}>
            <line
              x1={toX(tick)}
              x2={toX(tick)}
              y1={margin.top + plotHeight}
              y2={margin.top + plotHeight + 5}
              className="tuning-score-axis-tick"
            />
            <text
              x={toX(tick)}
              y={margin.top + plotHeight + 18}
              className="tuning-score-axis-label"
              textAnchor="middle"
            >
              {Math.round(tick)}
            </text>
          </g>
        ))}

        <path d={path} className="tuning-score-line" />

        {points.map((point) => (
          <circle
            key={point.snapshotIdx}
            className={`tuning-score-point ${
              selectedSnapshotIdx === point.snapshotIdx ? "active" : ""
            }`}
            cx={toX(point.trialCount)}
            cy={toY(point.score)}
            r={selectedSnapshotIdx === point.snapshotIdx ? 5.5 : 4}
            onClick={() => onSelectSnapshot(point.snapshotIdx)}
          />
        ))}

        <text
          x={margin.left + plotWidth / 2}
          y={height - 6}
          className="tuning-score-axis-title"
          textAnchor="middle"
        >
          Trials
        </text>
        <text
          x={16}
          y={margin.top + plotHeight / 2}
          className="tuning-score-axis-title"
          textAnchor="middle"
          transform={`rotate(-90 16 ${margin.top + plotHeight / 2})`}
        >
          Error (MSE x 100)
        </text>
      </svg>
      {error && <p className="tuning-score-error">{error}</p>}
    </div>
  );
}


function ModelDiscriminationPanel({
  comparisonConfig,
  setComparisonField,
  runModelComparison,
  comparisonLoading,
  comparisonError,
  comparisonResult,
  canRun,
  focusKey,
  setFocusKey,
  applySelectedFocusModel,
}) {
  const sizeShifts = comparisonResult?.size_shifts || [];
  const satShifts = comparisonResult?.sat_shifts || [];
  const reliabilityGrid = comparisonResult?.reliability_grid || [];
  const candidates = comparisonResult?.candidates || [];
  const baselineCandidate = comparisonResult?.baseline_candidate || null;
  const focusCandidate = comparisonResult?.focus_candidate || null;
  const bestCandidate = comparisonResult?.best_candidate || null;
  const summary = comparisonResult?.summary || null;
  const baselineMeanHeatmap = comparisonResult?.baseline_mean_heatmap || null;
  const focusMeanHeatmap = comparisonResult?.focus_mean_heatmap || null;
  const focusDeltaHeatmap = comparisonResult?.focus_delta_heatmap || null;
  const focusSignalHeatmap = comparisonResult?.focus_signal_heatmap || null;
  const focusSignalAbsMax = comparisonResult?.focus_signal_abs_max ?? null;
  const baselineGroundTruthHeatmap =
    comparisonResult?.baseline_ground_truth_heatmap || null;
  const focusGroundTruthHeatmap =
    comparisonResult?.focus_ground_truth_heatmap || null;
  const groundTruthDeltaHeatmap =
    comparisonResult?.ground_truth_delta_heatmap || null;
  const groundTruthDeltaAbsMax =
    comparisonResult?.ground_truth_delta_abs_max ?? null;
  const topCandidates = candidates.slice(0, 12);
  const baselineEstimatedCrossings = computeContourCrossings(baselineMeanHeatmap);
  const focusEstimatedCrossings = computeContourCrossings(focusMeanHeatmap);
  const baselineGroundTruthCrossings = computeContourCrossings(baselineGroundTruthHeatmap);
  const focusGroundTruthCrossings = computeContourCrossings(focusGroundTruthHeatmap);

  const reliabilityCellColor = (accuracy) => {
    if (!Number.isFinite(accuracy)) return "color-mix(in srgb, var(--background) 90%, var(--card-border) 10%)";
    const t = Math.max(0, Math.min(1, (accuracy - 0.5) / 0.5));
    const alpha = 0.14 + t * 0.56;
    return `rgba(46, 125, 50, ${alpha})`;
  };
  const sameShift = (a, b) => Math.abs(Number(a) - Number(b)) <= 1e-6;

  return (
    <div className="tuning-discrimination">
      <div className="tuning-post-config">
        <div className="tuning-config-section">
          <h3>Shift Sweep Configuration</h3>
          <div className="tuning-params">
            <div className="tuning-param">
              <label>Size shift min (px)</label>
              <input
                type="number"
                value={comparisonConfig.size_shift_min}
                onChange={(e) =>
                  setComparisonField(
                    "size_shift_min",
                    e.target.value,
                    comparisonConfig.size_shift_min
                  )
                }
              />
            </div>
            <div className="tuning-param">
              <label>Size shift max (px)</label>
              <input
                type="number"
                value={comparisonConfig.size_shift_max}
                onChange={(e) =>
                  setComparisonField(
                    "size_shift_max",
                    e.target.value,
                    comparisonConfig.size_shift_max
                  )
                }
              />
            </div>
            <div className="tuning-param">
              <label>Size shift steps</label>
              <input
                type="number"
                min="1"
                max="25"
                value={comparisonConfig.size_shift_steps}
                onChange={(e) =>
                  setComparisonField(
                    "size_shift_steps",
                    e.target.value,
                    comparisonConfig.size_shift_steps
                  )
                }
              />
            </div>
            <div className="tuning-param">
              <label>Sat shift min</label>
              <input
                type="number"
                step="0.01"
                value={comparisonConfig.sat_shift_min}
                onChange={(e) =>
                  setComparisonField(
                    "sat_shift_min",
                    e.target.value,
                    comparisonConfig.sat_shift_min
                  )
                }
              />
            </div>
            <div className="tuning-param">
              <label>Sat shift max</label>
              <input
                type="number"
                step="0.01"
                value={comparisonConfig.sat_shift_max}
                onChange={(e) =>
                  setComparisonField(
                    "sat_shift_max",
                    e.target.value,
                    comparisonConfig.sat_shift_max
                  )
                }
              />
            </div>
            <div className="tuning-param">
              <label>Sat shift steps</label>
              <input
                type="number"
                min="1"
                max="25"
                value={comparisonConfig.sat_shift_steps}
                onChange={(e) =>
                  setComparisonField(
                    "sat_shift_steps",
                    e.target.value,
                    comparisonConfig.sat_shift_steps
                  )
                }
              />
            </div>
            <div className="tuning-param">
              <label>Surface steps</label>
              <input
                type="number"
                min="20"
                max="160"
                value={comparisonConfig.surface_steps}
                onChange={(e) =>
                  setComparisonField(
                    "surface_steps",
                    e.target.value,
                    comparisonConfig.surface_steps
                  )
                }
              />
            </div>
            <div className="tuning-param">
              <label>Repeats / model</label>
              <input
                type="number"
                min="2"
                max="16"
                value={comparisonConfig.repeats}
                onChange={(e) =>
                  setComparisonField(
                    "repeats",
                    e.target.value,
                    comparisonConfig.repeats
                  )
                }
              />
            </div>
          </div>
          <div className="tuning-inline-actions">
            <button
              className="tuning-run-btn tuning-run-btn-inline"
              onClick={runModelComparison}
              disabled={comparisonLoading || !canRun}
            >
              {comparisonLoading ? "Running experiment..." : "Run Discrimination Experiment"}
            </button>
            {comparisonResult && (
              <>
                <div className="tuning-param">
                  <label>Visual focus model</label>
                  <select
                    value={focusKey}
                    onChange={(e) => setFocusKey(e.target.value)}
                  >
                    {candidates.map((candidate) => {
                      const key = makeFocusKey(candidate.size_shift, candidate.sat_shift);
                      return (
                        <option key={key} value={key}>
                          {`${formatSigned(candidate.size_shift, 2)}px / ${formatSigned(
                            candidate.sat_shift,
                            3
                          )} | ${(candidate.loo_accuracy * 100).toFixed(1)}%`}
                        </option>
                      );
                    })}
                  </select>
                </div>
                <button
                  className="tuning-small-btn"
                  onClick={applySelectedFocusModel}
                  disabled={comparisonLoading || !focusKey}
                >
                  Show selected model visuals
                </button>
              </>
            )}
          </div>
          <p className="tuning-inspect-hint">
            This reruns the full algorithm for baseline and every shifted comparison model
            with identical settings. Reliability indicates how often runs can be classified
            to the correct model family. Use the visual focus selector to choose which
            shifted model is shown in the top heatmap comparisons.
          </p>
        </div>
      </div>

      {comparisonLoading && (
        <div className="tuning-canvas-empty">
          Running repeated baseline and shifted model simulations...
        </div>
      )}

      {!comparisonLoading && comparisonError && (
        <p className="tuning-score-error">{comparisonError}</p>
      )}

      {!comparisonLoading && !comparisonError && !comparisonResult && (
        <div className="tuning-discrimination-empty">
          Run discrimination experiment to compare baseline vs shifted-model runs.
        </div>
      )}

      {!comparisonLoading && !comparisonError && comparisonResult && (
        <>
          <div className="tuning-discrimination-pairs">
            <div className="tuning-discrimination-pair-card">
              <h4>Baseline Surface</h4>
              <div className="tuning-discrimination-pair-stack">
                <div className="tuning-canvas-panel">
                  <h4>Estimated</h4>
                  {baselineMeanHeatmap ? (
                    <HeatmapCanvas
                      heatmap={baselineMeanHeatmap}
                      showLegend={false}
                      plotWidth={360}
                      plotHeight={280}
                    />
                  ) : (
                    <div className="tuning-canvas-empty">Estimated baseline unavailable.</div>
                  )}
                </div>
                <div className="tuning-canvas-panel">
                  <h4>Ground Truth</h4>
                  {baselineGroundTruthHeatmap ? (
                    <HeatmapCanvas
                      heatmap={baselineGroundTruthHeatmap}
                      showLegend={false}
                      plotWidth={360}
                      plotHeight={280}
                    />
                  ) : (
                    <div className="tuning-canvas-empty">Ground-truth baseline unavailable.</div>
                  )}
                </div>
              </div>
            </div>

            <div className="tuning-discrimination-pair-card">
              <h4>Focus Shift Surface</h4>
              <div className="tuning-discrimination-pair-stack">
                <div className="tuning-canvas-panel">
                  <h4>Estimated</h4>
                  {focusMeanHeatmap ? (
                    <HeatmapCanvas
                      heatmap={focusMeanHeatmap}
                      showLegend={false}
                      plotWidth={360}
                      plotHeight={280}
                    />
                  ) : (
                    <div className="tuning-canvas-empty">Estimated focus unavailable.</div>
                  )}
                </div>
                <div className="tuning-canvas-panel">
                  <h4>Ground Truth</h4>
                  {focusGroundTruthHeatmap ? (
                    <HeatmapCanvas
                      heatmap={focusGroundTruthHeatmap}
                      showLegend={false}
                      plotWidth={360}
                      plotHeight={280}
                    />
                  ) : (
                    <div className="tuning-canvas-empty">Ground-truth focus unavailable.</div>
                  )}
                </div>
              </div>
            </div>

            <div className="tuning-discrimination-pair-card">
              <h4>Focus - Baseline Delta</h4>
              <div className="tuning-discrimination-pair-stack">
                <div className="tuning-canvas-panel">
                  <h4>Estimated Delta</h4>
                  {focusDeltaHeatmap ? (
                    <DeltaHeatmapCanvas
                      heatmap={focusDeltaHeatmap}
                      showLegend
                      plotWidth={360}
                      plotHeight={280}
                    />
                  ) : (
                    <div className="tuning-canvas-empty">Estimated delta unavailable.</div>
                  )}
                </div>
                <div className="tuning-canvas-panel">
                  <h4>Ground Truth Delta</h4>
                  {groundTruthDeltaHeatmap ? (
                    <DeltaHeatmapCanvas
                      heatmap={groundTruthDeltaHeatmap}
                      maxAbs={groundTruthDeltaAbsMax}
                      showLegend
                      plotWidth={360}
                      plotHeight={280}
                    />
                  ) : (
                    <div className="tuning-canvas-empty">Ground-truth delta unavailable.</div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="tuning-discrimination-signal">
            <div className="tuning-canvas-panel">
              <h4>Signal Map (Estimated Delta / pooled std)</h4>
              {focusSignalHeatmap ? (
                <DeltaHeatmapCanvas
                  heatmap={focusSignalHeatmap}
                  maxAbs={focusSignalAbsMax}
                  showLegend
                  plotWidth={420}
                  plotHeight={310}
                />
              ) : (
                <div className="tuning-canvas-empty">Signal map unavailable.</div>
              )}
            </div>
          </div>
          <p className="tuning-canvas-note">
            Estimated and ground-truth maps are paired by metric. Delta maps are directly stacked
            so you can compare estimated vs true gap one-to-one.
          </p>

          <div className="tuning-discrimination-crossings-grid">
            <ContourCrossingsPanel
              title="Baseline Estimated Contour Edge Crossings"
              rows={baselineEstimatedCrossings}
            />
            <ContourCrossingsPanel
              title="Baseline Ground Truth Contour Edge Crossings"
              rows={baselineGroundTruthCrossings}
            />
            <ContourCrossingsPanel
              title="Focus Estimated Contour Edge Crossings"
              rows={focusEstimatedCrossings}
            />
            <ContourCrossingsPanel
              title="Focus Ground Truth Contour Edge Crossings"
              rows={focusGroundTruthCrossings}
            />
          </div>
          {summary?.best_shift_is_baseline && (
            <p className="tuning-inspect-hint">
              No shifted model separated from baseline reliably in this sweep. Increase repeats
              or test larger shifts.
            </p>
          )}

          <div className="tuning-discrimination-stats">
            <div className="tuning-discrimination-stat">
              <span className="tuning-stat-label">Repeats</span>
              <span className="tuning-stat-value">{comparisonResult.repeats}</span>
            </div>
            <div className="tuning-discrimination-stat">
              <span className="tuning-stat-label">Trials per run</span>
              <span className="tuning-stat-value">
                {comparisonResult.trial_count_per_run}
              </span>
            </div>
            <div className="tuning-discrimination-stat">
              <span className="tuning-stat-label">Focus shift (size, sat)</span>
              <span className="tuning-stat-value">
                {formatSigned(focusCandidate?.size_shift, 2)} px,{" "}
                {formatSigned(focusCandidate?.sat_shift, 3)}
              </span>
            </div>
            <div className="tuning-discrimination-stat">
              <span className="tuning-stat-label">Focus reliability</span>
              <span className="tuning-stat-value">
                {((summary?.baseline_vs_focus_accuracy ?? 0) * 100).toFixed(1)}%
              </span>
            </div>
            <div className="tuning-discrimination-stat">
              <span className="tuning-stat-label">Focus observable score</span>
              <span className="tuning-stat-value">
                {(summary?.focus_observable_score ?? 0).toFixed(3)}
              </span>
            </div>
            <div className="tuning-discrimination-stat">
              <span className="tuning-stat-label">Best shift (size, sat)</span>
              <span className="tuning-stat-value">
                {formatSigned(bestCandidate?.size_shift, 2)} px,{" "}
                {formatSigned(bestCandidate?.sat_shift, 3)}
              </span>
            </div>
          </div>

          <div className="tuning-discrimination-grid-wrap">
            <h4>Reliability Matrix (leave-one-out accuracy)</h4>
            <div className="tuning-discrimination-table-scroll">
              <table className="tuning-discrimination-grid">
                <thead>
                  <tr>
                    <th>Sat \\ Size</th>
                    {sizeShifts.map((sizeShift) => (
                      <th key={`size-${sizeShift}`}>{formatSigned(sizeShift, 2)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {satShifts.map((satShift, rowIdx) => (
                    <tr key={`sat-${satShift}`}>
                      <th>{formatSigned(satShift, 3)}</th>
                      {sizeShifts.map((sizeShift, colIdx) => {
                        const reliability = reliabilityGrid?.[rowIdx]?.[colIdx];
                        const isBaseline =
                          baselineCandidate &&
                          sameShift(sizeShift, baselineCandidate.size_shift) &&
                          sameShift(satShift, baselineCandidate.sat_shift);
                        const isFocus =
                          focusCandidate &&
                          sameShift(sizeShift, focusCandidate.size_shift) &&
                          sameShift(satShift, focusCandidate.sat_shift);

                        return (
                          <td
                            key={`reliability-${satShift}-${sizeShift}`}
                            className={`tuning-discrimination-cell ${
                              isBaseline ? "baseline" : ""
                            } ${isFocus ? "best" : ""}`}
                            style={{ backgroundColor: reliabilityCellColor(reliability) }}
                            title={`reliability ${reliability?.toFixed?.(4) ?? "n/a"}`}
                          >
                            {Number.isFinite(reliability)
                              ? `${(reliability * 100).toFixed(1)}%`
                              : "n/a"}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="tuning-discrimination-grid-wrap">
            <h4>Candidate Ranking</h4>
            <div className="tuning-discrimination-table-scroll">
              <table className="tuning-discrimination-ranking">
                <thead>
                  <tr>
                    <th>Rank</th>
                    <th>Shift (size, sat)</th>
                    <th>Reliability</th>
                    <th>Separation RMSE</th>
                    <th>Observable score</th>
                    <th>Mean trials</th>
                  </tr>
                </thead>
                <tbody>
                  {topCandidates.map((candidate, idx) => {
                    const isBaseline =
                      baselineCandidate &&
                      sameShift(candidate.size_shift, baselineCandidate.size_shift) &&
                      sameShift(candidate.sat_shift, baselineCandidate.sat_shift);
                    const isBest =
                      bestCandidate &&
                      sameShift(candidate.size_shift, bestCandidate.size_shift) &&
                      sameShift(candidate.sat_shift, bestCandidate.sat_shift);
                    return (
                      <tr
                        key={`candidate-${candidate.size_shift}-${candidate.sat_shift}`}
                        className={`${isBaseline ? "baseline" : ""} ${
                          isBest ? "best" : ""
                        }`}
                      >
                        <td>{idx + 1}</td>
                        <td>
                          {formatSigned(candidate.size_shift, 2)} px,{" "}
                          {formatSigned(candidate.sat_shift, 3)}
                        </td>
                        <td>{(candidate.loo_accuracy * 100).toFixed(1)}%</td>
                        <td>{candidate.separation_rmse.toFixed(3)}</td>
                        <td>{candidate.observable_score.toFixed(3)}</td>
                        <td>{candidate.mean_trials.toFixed(1)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}


function ContourCrossingsPanel({
  title,
  rows,
  sizeUnit = "px",
  satDigits = 3,
}) {
  if (!rows || rows.length === 0) {
    return (
      <div className="tuning-discrimination-crossing">
        <h5>{title}</h5>
        <p className="tuning-canvas-note">No contour crossing data available.</p>
      </div>
    );
  }

  return (
    <div className="tuning-discrimination-crossing">
      <h5>{title}</h5>
      <div className="tuning-discrimination-table-scroll">
        <table className="tuning-discrimination-ranking">
          <thead>
            <tr>
              <th>Level</th>
              <th>Top edge (size @ sat max)</th>
              <th>Bottom edge (size @ sat min)</th>
              <th>Left edge (sat @ size min)</th>
              <th>Right edge (sat @ size max)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={`${title}-${row.level}`}>
                <td>{row.level}</td>
                <td>
                  {row.top.length > 0
                    ? `${formatCrossingList(row.top, 1)} ${sizeUnit}`
                    : "none"}
                </td>
                <td>
                  {row.bottom.length > 0
                    ? `${formatCrossingList(row.bottom, 1)} ${sizeUnit}`
                    : "none"}
                </td>
                <td>{formatCrossingList(row.left, satDigits)}</td>
                <td>{formatCrossingList(row.right, satDigits)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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
