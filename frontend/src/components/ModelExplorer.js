import { useState, useEffect, useCallback } from "react";
import "../css/ModelExplorer.css";

const API = "http://localhost:8000/api/settings";

function ModelExplorer() {
  const [models, setModels] = useState([]);
  const [selectedModel, setSelectedModel] = useState("");
  const [compareModel, setCompareModel] = useState("");
  const [tab, setTab] = useState("formula"); // formula | grid | compare
  const [heatmap, setHeatmap] = useState(null);
  const [compareHeatmap, setCompareHeatmap] = useState(null);
  const [loading, setLoading] = useState(false);
  const [steps, setSteps] = useState(12);

  // Load available models
  useEffect(() => {
    fetch(`${API}/simulation-models`)
      .then((r) => r.json())
      .then((data) => {
        setModels(data);
        if (data.length > 0) setSelectedModel(data[0].name);
        if (data.length > 1) setCompareModel(data[1].name);
      })
      .catch(() => {});
  }, []);

  // Fetch heatmap whenever model or steps changes
  const fetchHeatmap = useCallback(async () => {
    if (!selectedModel) return;
    setLoading(true);
    try {
      const r = await fetch(
        `${API}/simulation-models/${selectedModel}/heatmap?steps=${steps}`
      );
      const data = await r.json();
      setHeatmap(data);
    } catch {
      setHeatmap(null);
    } finally {
      setLoading(false);
    }
  }, [selectedModel, steps]);

  useEffect(() => {
    fetchHeatmap();
  }, [fetchHeatmap]);

  // Fetch comparison heatmap
  const fetchCompareHeatmap = useCallback(async () => {
    if (!compareModel || tab !== "compare") return;
    try {
      const r = await fetch(
        `${API}/simulation-models/${compareModel}/heatmap?steps=${steps}`
      );
      const data = await r.json();
      setCompareHeatmap(data);
    } catch {
      setCompareHeatmap(null);
    }
  }, [compareModel, steps, tab]);

  useEffect(() => {
    fetchCompareHeatmap();
  }, [fetchCompareHeatmap]);

  const currentModelInfo = models.find((m) => m.name === selectedModel);
  const compareModelInfo = models.find((m) => m.name === compareModel);

  return (
    <div className="model-explorer-container">
      <div className="model-explorer-header">
        <h1 className="model-explorer-title">Model Explorer</h1>
        <p className="model-explorer-subtitle">
          Explore and compare simulation ground-truth models
        </p>
      </div>

      {/* Model selector */}
      <div className="model-selector-bar">
        <div className="model-selector-group">
          <label>Model</label>
          <select
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
          >
            {models.map((m) => (
              <option key={m.name} value={m.name}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
        <div className="model-selector-group">
          <label>Grid resolution</label>
          <input
            type="number"
            min={2}
            max={50}
            value={steps}
            onChange={(e) => {
              const v = Math.max(2, Math.min(50, Number(e.target.value) || 2));
              setSteps(v);
            }}
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="explorer-tabs">
        <button
          className={`explorer-tab ${tab === "formula" ? "active" : ""}`}
          onClick={() => setTab("formula")}
        >
          Formula & Info
        </button>
        <button
          className={`explorer-tab ${tab === "grid" ? "active" : ""}`}
          onClick={() => setTab("grid")}
        >
          Probability Grid
        </button>
        <button
          className={`explorer-tab ${tab === "compare" ? "active" : ""}`}
          onClick={() => setTab("compare")}
        >
          Compare Models
        </button>
      </div>

      {/* Tab content */}
      <div className="explorer-content">
        {tab === "formula" && (
          <FormulaTab model={currentModelInfo} heatmap={heatmap} />
        )}
        {tab === "grid" && (
          <GridTab heatmap={heatmap} loading={loading} />
        )}
        {tab === "compare" && (
          <CompareTab
            models={models}
            selectedModel={selectedModel}
            compareModel={compareModel}
            onCompareChange={setCompareModel}
            heatmapA={heatmap}
            heatmapB={compareHeatmap}
            modelAInfo={currentModelInfo}
            modelBInfo={compareModelInfo}
          />
        )}
      </div>
    </div>
  );
}

/* ── Formula & Info Tab ─── */
function FormulaTab({ model, heatmap }) {
  if (!model) return <p>No model selected.</p>;
  return (
    <div className="formula-tab">
      <div className="formula-card">
        <h3>Theoretical Formula</h3>
        <div className="formula-display">
          <span className="formula-label">P(success) =</span>
          <code className="formula-code">{model.description}</code>
        </div>
        <p className="formula-note">
          Where <code>ts</code> is the triangle size and <code>sat</code> is the
          saturation, both scaled to [0, 1] relative to the configured bounds.
        </p>
      </div>

      <div className="formula-card">
        <h3>Quick Reference</h3>
        <p className="formula-note">
          Below are example probabilities at specific points in the parameter space
          (using default bounds 10–400 px, 0–1 saturation).
        </p>
        {heatmap && <SamplePoints heatmap={heatmap} />}
      </div>

      {heatmap && (
        <div className="formula-card">
          <h3>Heatmap Preview</h3>
          <HeatmapCanvas heatmap={heatmap} />
        </div>
      )}
    </div>
  );
}

/* ── Probability Grid Tab ─── */
function GridTab({ heatmap, loading }) {
  if (loading) return <div className="loading-state">Loading grid…</div>;
  if (!heatmap) return <p>No data available.</p>;

  return (
    <div className="grid-tab">
      <p className="grid-description">
        Each cell shows the probability of a correct response. Rows = saturation
        (high → low), columns = triangle size (small → large).
      </p>
      <div className="probability-table-wrapper">
        <table className="probability-table">
          <thead>
            <tr>
              <th className="axis-label">Sat \ Size</th>
              {heatmap.triangle_sizes.map((ts) => (
                <th key={ts}>{Math.round(ts)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[...heatmap.saturations]
              .map((sat, i) => ({ sat, i }))
              .reverse()
              .map(({ sat, i }) => (
                <tr key={sat}>
                  <td className="row-label">{sat.toFixed(2)}</td>
                  {heatmap.grid[i].map((p, j) => (
                    <td
                      key={j}
                      className="prob-cell"
                      style={{ background: probColor(p) }}
                      title={`Size ${Math.round(heatmap.triangle_sizes[j])}, Sat ${sat.toFixed(2)}: ${(p * 100).toFixed(1)}%`}
                    >
                      {(p * 100).toFixed(0)}
                    </td>
                  ))}
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ── Compare Tab ─── */
function CompareTab({
  models,
  selectedModel,
  compareModel,
  onCompareChange,
  heatmapA,
  heatmapB,
  modelAInfo,
  modelBInfo,
}) {
  return (
    <div className="compare-tab">
      <div className="compare-selector">
        <div className="compare-model-label">
          <strong>Model A:</strong> {modelAInfo?.label ?? selectedModel}
        </div>
        <span className="compare-vs">vs</span>
        <div className="compare-model-picker">
          <strong>Model B:</strong>
          <select
            value={compareModel}
            onChange={(e) => onCompareChange(e.target.value)}
          >
            {models.map((m) => (
              <option key={m.name} value={m.name}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Side-by-side formulas */}
      <div className="compare-formulas">
        <div className="compare-formula-card">
          <h4>{modelAInfo?.label}</h4>
          <code>{modelAInfo?.description}</code>
        </div>
        <div className="compare-formula-card">
          <h4>{modelBInfo?.label}</h4>
          <code>{modelBInfo?.description}</code>
        </div>
      </div>

      {/* Difference grid */}
      {heatmapA && heatmapB && (
        <div className="compare-grid-section">
          <h3>Probability Difference (A − B)</h3>
          <p className="grid-description">
            Green = Model A is higher, Red = Model B is higher
          </p>
          <div className="probability-table-wrapper">
            <table className="probability-table diff-table">
              <thead>
                <tr>
                  <th className="axis-label">Sat \ Size</th>
                  {heatmapA.triangle_sizes.map((ts) => (
                    <th key={ts}>{Math.round(ts)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...heatmapA.saturations]
                  .map((sat, i) => ({ sat, i }))
                  .reverse()
                  .map(({ sat, i }) => (
                    <tr key={sat}>
                      <td className="row-label">{sat.toFixed(2)}</td>
                      {heatmapA.grid[i].map((pA, j) => {
                        const pB = heatmapB.grid[i]?.[j] ?? 0;
                        const diff = pA - pB;
                        return (
                          <td
                            key={j}
                            className="prob-cell"
                            style={{ background: diffColor(diff) }}
                            title={`A: ${(pA * 100).toFixed(1)}% B: ${(pB * 100).toFixed(1)}% Diff: ${(diff * 100).toFixed(1)}%`}
                          >
                            {diff >= 0 ? "+" : ""}
                            {(diff * 100).toFixed(0)}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Canvas-based mini heatmap ─── */
function HeatmapCanvas({ heatmap }) {
  const cellSize = 28;
  const w = heatmap.triangle_sizes.length * cellSize;
  const h = heatmap.saturations.length * cellSize;
  const margin = { left: 55, bottom: 40, top: 10, right: 10 };

  return (
    <div className="heatmap-visual">
      <svg
        width={w + margin.left + margin.right}
        height={h + margin.top + margin.bottom}
        className="heatmap-svg"
      >
        <g transform={`translate(${margin.left},${margin.top})`}>
          {[...heatmap.saturations]
            .map((sat, si) => ({ sat, si }))
            .reverse()
            .map(({ sat, si }, ri) =>
              heatmap.grid[si].map((p, ci) => (
                <rect
                  key={`${si}-${ci}`}
                  x={ci * cellSize}
                  y={ri * cellSize}
                  width={cellSize}
                  height={cellSize}
                  fill={probColor(p)}
                  stroke="var(--border-subtle)"
                  strokeWidth={0.5}
                >
                  <title>
                    Size {Math.round(heatmap.triangle_sizes[ci])}, Sat{" "}
                    {sat.toFixed(2)}: {(p * 100).toFixed(1)}%
                  </title>
                </rect>
              ))
            )}
          {/* X-axis labels */}
          {heatmap.triangle_sizes
            .filter((_, i) => i % Math.ceil(heatmap.triangle_sizes.length / 6) === 0)
            .map((ts, i, arr) => {
              const idx = heatmap.triangle_sizes.indexOf(ts);
              return (
                <text
                  key={ts}
                  x={idx * cellSize + cellSize / 2}
                  y={h + 16}
                  textAnchor="middle"
                  className="heatmap-label"
                >
                  {Math.round(ts)}
                </text>
              );
            })}
          <text
            x={w / 2}
            y={h + 34}
            textAnchor="middle"
            className="heatmap-axis-label"
          >
            Triangle Size (px)
          </text>
          {/* Y-axis labels */}
          {heatmap.saturations
            .filter((_, i) => i % Math.ceil(heatmap.saturations.length / 6) === 0)
            .map((sat) => {
              const idx = heatmap.saturations.indexOf(sat);
              const ri = heatmap.saturations.length - 1 - idx;
              return (
                <text
                  key={sat}
                  x={-6}
                  y={ri * cellSize + cellSize / 2 + 4}
                  textAnchor="end"
                  className="heatmap-label"
                >
                  {sat.toFixed(2)}
                </text>
              );
            })}
          <text
            x={-40}
            y={h / 2}
            textAnchor="middle"
            transform={`rotate(-90, -40, ${h / 2})`}
            className="heatmap-axis-label"
          >
            Saturation
          </text>
        </g>
      </svg>
    </div>
  );
}

/* ── Sample points table ─── */
function SamplePoints({ heatmap }) {
  const ts = heatmap.triangle_sizes;
  const sat = heatmap.saturations;
  const grid = heatmap.grid;

  // Pick corners and center
  const lastTs = ts.length - 1;
  const lastSat = sat.length - 1;
  const midTs = Math.floor(lastTs / 2);
  const midSat = Math.floor(lastSat / 2);

  const points = [
    { label: "Min size, Min sat", tsIdx: 0, satIdx: 0 },
    { label: "Min size, Max sat", tsIdx: 0, satIdx: lastSat },
    { label: "Mid size, Mid sat", tsIdx: midTs, satIdx: midSat },
    { label: "Max size, Min sat", tsIdx: lastTs, satIdx: 0 },
    { label: "Max size, Max sat", tsIdx: lastTs, satIdx: lastSat },
  ];

  return (
    <table className="sample-points-table">
      <thead>
        <tr>
          <th>Condition</th>
          <th>Triangle Size</th>
          <th>Saturation</th>
          <th>Probability</th>
        </tr>
      </thead>
      <tbody>
        {points.map((pt) => (
          <tr key={pt.label}>
            <td>{pt.label}</td>
            <td className="mono">{Math.round(ts[pt.tsIdx])}</td>
            <td className="mono">{sat[pt.satIdx].toFixed(2)}</td>
            <td className="mono">
              {(grid[pt.satIdx][pt.tsIdx] * 100).toFixed(1)}%
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/* ── Color helpers ─── */
function probColor(p) {
  // Interpolate from red (low) through yellow to green (high)
  const clamped = Math.max(0, Math.min(1, p));
  if (clamped < 0.5) {
    const t = clamped / 0.5;
    const r = 220;
    const g = Math.round(60 + 160 * t);
    const b = 60;
    return `rgba(${r},${g},${b},0.45)`;
  }
  const t = (clamped - 0.5) / 0.5;
  const r = Math.round(220 - 160 * t);
  const g = 220;
  const b = 60;
  return `rgba(${r},${g},${b},0.45)`;
}

function diffColor(d) {
  const abs = Math.min(Math.abs(d), 0.3) / 0.3;
  if (d >= 0) {
    return `rgba(45,138,78,${0.1 + abs * 0.5})`;
  }
  return `rgba(198,40,40,${0.1 + abs * 0.5})`;
}

export default ModelExplorer;
