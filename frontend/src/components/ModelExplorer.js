import { useState, useEffect, useCallback } from "react";
import "../css/ModelExplorer.css";
import HeatmapCanvas from "./shared/HeatmapCanvas";

const API = "http://localhost:8000/api/settings";

/** Parse a number input value, returning `fallback` only when the field is
 *  empty or not a valid number.  Crucially, 0 is preserved (unlike `|| fb`). */
function parseNum(raw, fallback) {
  if (raw === "" || raw == null) return fallback;
  const n = Number(raw);
  return isNaN(n) ? fallback : n;
}

function ModelExplorer() {
  const [models, setModels] = useState([]);
  const [selectedModel, setSelectedModel] = useState("");
  const [compareModel, setCompareModel] = useState("");
  const [tab, setTab] = useState("formula"); // formula | grid | compare | custom
  const [heatmap, setHeatmap] = useState(null);
  const [compareHeatmap, setCompareHeatmap] = useState(null);
  const [loading, setLoading] = useState(false);
  const [steps, setSteps] = useState(80);

  // Bounds controls
  const [bounds, setBounds] = useState({
    min_triangle_size: 10,
    max_triangle_size: 400,
    min_saturation: 0,
    max_saturation: 1,
  });

  // Load available models (built-in + saved custom)
  const refreshModels = useCallback(() => {
    fetch(`${API}/simulation-models`)
      .then((r) => r.json())
      .then((data) => {
        setModels(data);
        setSelectedModel((prev) => {
          if (prev && data.some((m) => m.name === prev)) return prev;
          return data.length > 0 ? data[0].name : "";
        });
        setCompareModel((prev) => {
          if (prev && data.some((m) => m.name === prev)) return prev;
          return data.length > 1 ? data[1].name : "";
        });
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    refreshModels();
  }, [refreshModels]);

  const boundsQuery = `&min_triangle_size=${bounds.min_triangle_size}&max_triangle_size=${bounds.max_triangle_size}&min_saturation=${bounds.min_saturation}&max_saturation=${bounds.max_saturation}`;

  // Fetch heatmap whenever model, steps, or bounds changes
  const fetchHeatmap = useCallback(async () => {
    if (!selectedModel) return;
    setLoading(true);
    try {
      const r = await fetch(
        `${API}/simulation-models/${encodeURIComponent(selectedModel)}/heatmap?steps=${steps}${boundsQuery}`
      );
      if (!r.ok) { setHeatmap(null); return; }
      const data = await r.json();
      setHeatmap(data);
    } catch {
      setHeatmap(null);
    } finally {
      setLoading(false);
    }
  }, [selectedModel, steps, boundsQuery]);

  useEffect(() => {
    const timer = setTimeout(() => fetchHeatmap(), 300);
    return () => clearTimeout(timer);
  }, [fetchHeatmap]);

  // Fetch comparison heatmap
  const fetchCompareHeatmap = useCallback(async () => {
    if (!compareModel || tab !== "compare") return;
    try {
      const r = await fetch(
        `${API}/simulation-models/${encodeURIComponent(compareModel)}/heatmap?steps=${steps}${boundsQuery}`
      );
      if (!r.ok) { setCompareHeatmap(null); return; }
      const data = await r.json();
      setCompareHeatmap(data);
    } catch {
      setCompareHeatmap(null);
    }
  }, [compareModel, steps, tab, boundsQuery]);

  useEffect(() => {
    const timer = setTimeout(() => fetchCompareHeatmap(), 300);
    return () => clearTimeout(timer);
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

      {/* Model selector + bounds controls */}
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
            max={200}
            value={steps}
            onChange={(e) => {
              const v = Math.max(2, Math.min(200, parseNum(e.target.value, 2)));
              setSteps(v);
            }}
          />
        </div>
        <div className="model-selector-group">
          <label>Min size (px)</label>
          <input
            type="number"
            min={0}
            value={bounds.min_triangle_size}
            onChange={(e) =>
              setBounds((b) => ({
                ...b,
                min_triangle_size: parseNum(e.target.value, b.min_triangle_size),
              }))
            }
          />
        </div>
        <div className="model-selector-group">
          <label>Max size (px)</label>
          <input
            type="number"
            min={1}
            value={bounds.max_triangle_size}
            onChange={(e) =>
              setBounds((b) => ({
                ...b,
                max_triangle_size: parseNum(e.target.value, b.max_triangle_size),
              }))
            }
          />
        </div>
        <div className="model-selector-group">
          <label>Min sat</label>
          <input
            type="number"
            step="0.01"
            min={0}
            value={bounds.min_saturation}
            onChange={(e) =>
              setBounds((b) => ({
                ...b,
                min_saturation: parseNum(e.target.value, b.min_saturation),
              }))
            }
          />
        </div>
        <div className="model-selector-group">
          <label>Max sat</label>
          <input
            type="number"
            step="0.01"
            min={0}
            value={bounds.max_saturation}
            onChange={(e) =>
              setBounds((b) => ({
                ...b,
                max_saturation: parseNum(e.target.value, b.max_saturation),
              }))
            }
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="explorer-tabs">
        <button
          className={`explorer-tab ${tab === "formula" ? "active" : ""}`}
          onClick={() => setTab("formula")}
        >
          Formula & Heatmap
        </button>
        <button
          className={`explorer-tab ${tab === "grid" ? "active" : ""}`}
          onClick={() => setTab("grid")}
        >
          Triangle Preview
        </button>
        <button
          className={`explorer-tab ${tab === "compare" ? "active" : ""}`}
          onClick={() => setTab("compare")}
        >
          Compare Models
        </button>
        <button
          className={`explorer-tab ${tab === "custom" ? "active" : ""}`}
          onClick={() => setTab("custom")}
        >
          Custom Model
        </button>
      </div>

      {/* Tab content */}
      <div className="explorer-content">
        {tab === "formula" && (
          <FormulaTab model={currentModelInfo} heatmap={heatmap} loading={loading} />
        )}
        {tab === "grid" && (
          <TrianglePreviewTab heatmap={heatmap} loading={loading} />
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
        {tab === "custom" && (
          <CustomModelTab bounds={bounds} steps={steps} onModelsChanged={refreshModels} />
        )}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   Formula & Heatmap Tab
   ══════════════════════════════════════════════════════════ */
function FormulaTab({ model, heatmap, loading }) {
  if (!model) return <p>No model selected.</p>;
  return (
    <div className="formula-tab">
      <div className="formula-card">
        <h3>Theoretical Formula</h3>
        <div className="formula-display">
          <span className="formula-label">P(success) =</span>
          <code className="formula-code">{model.description}</code>
        </div>
        {model.model_type === "bandpass" ? (
          <p className="formula-note">
            Bandpass (sigmoid-window) model. <code>W_x = sig((x - low) / w_low) * sig((high - x) / w_high)</code>.
            The window parameters define where probability transitions from floor (25%) to ceiling (100%).
          </p>
        ) : model.model_type === "threshold" ? (
          <p className="formula-note">
            Contrast-threshold model. <code>C_t(ts)</code> defines the saturation
            threshold curve — below it you're at chance (25%). Performance rises
            exponentially above threshold with rate <code>k</code>.
          </p>
        ) : (
          <p className="formula-note">
            Where <code>ts</code> is the triangle size in pixels and{" "}
            <code>sat</code> is the saturation (absolute values).
            The model uses per-axis scaling ({" "}
            <code>size_scale={model.size_scale ?? "?"}</code>,{" "}
            <code>sat_scale={model.sat_scale ?? "?"}</code>) so
            probabilities stay the same regardless of viewing bounds.
          </p>
        )}
      </div>

      <div className="formula-card">
        <h3>Quick Reference</h3>
        <p className="formula-note">
          Example probabilities at specific points in the parameter space.
        </p>
        {heatmap && <SamplePoints heatmap={heatmap} />}
      </div>

      <div className="formula-card">
        <h3>Heatmap Visualization</h3>
        <p className="formula-note" style={{ marginBottom: "0.75rem" }}>
          RdYlGn colormap (red=low, yellow=mid, green=high). Contours: cyan ≈ 25%,
          white = 75%, black = 90%, blue ≈ 100%.
        </p>
        {loading && !heatmap ? (
          <div className="loading-state">Loading heatmap…</div>
        ) : heatmap ? (
          <HeatmapCanvas heatmap={heatmap} />
        ) : (
          <p>No data.</p>
        )}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   Triangle Preview Tab – renders actual triangles in a grid
   ══════════════════════════════════════════════════════════ */
function TrianglePreviewTab({ heatmap, loading }) {
  if (loading) return <div className="loading-state">Loading…</div>;
  if (!heatmap) return <p>No data available.</p>;

  // Pick a subset of sizes and saturations for reasonable display
  const maxCols = 8;
  const maxRows = 6;
  const tsAll = heatmap.triangle_sizes;
  const satAll = heatmap.saturations;
  const tsStep = Math.max(1, Math.floor(tsAll.length / maxCols));
  const satStep = Math.max(1, Math.floor(satAll.length / maxRows));

  const sizes = tsAll.filter((_, i) => i % tsStep === 0).slice(0, maxCols);
  const sats = [...satAll]
    .filter((_, i) => i % satStep === 0)
    .slice(0, maxRows)
    .reverse();

  // Get the actual index in the original arrays
  const tsIndices = sizes.map((v) => tsAll.indexOf(v));
  const satIndices = sats.map((v) => satAll.indexOf(v));

  // Scale triangles: largest rendered at ~80px, smallest proportional
  const maxTs = Math.max(...sizes);
  const maxRender = 80;
  const circleMax = maxRender * 1.4;

  return (
    <div className="grid-tab">
      <p className="grid-description">
        Each cell renders an actual triangle at the given size on a white background.
        The percentage shows the model's predicted success probability.
      </p>
      <div className="triangle-grid-wrapper">
        {/* Column headers – triangle sizes */}
        <div
          className="triangle-grid"
          style={{
            gridTemplateColumns: `80px repeat(${sizes.length}, 1fr)`,
          }}
        >
          <div className="tg-corner">Sat \ Size</div>
          {sizes.map((ts) => (
            <div key={ts} className="tg-col-header">
              {Math.round(ts)} px
            </div>
          ))}

          {/* Rows */}
          {satIndices.map((si, ri) => (
            <>
              <div key={`rh-${si}`} className="tg-row-header">
                {satAll[si].toFixed(2)}
              </div>
              {tsIndices.map((ti) => {
                const p = heatmap.grid[si]?.[ti] ?? 0;
                const ts = tsAll[ti];
                const sat = satAll[si];
                const renderSize = Math.max(6, (ts / maxTs) * maxRender);
                const boxSize = Math.max(24, (ts / maxTs) * circleMax);

                return (
                  <div
                    key={`${si}-${ti}`}
                    className="tg-cell"
                    title={`Size ${Math.round(ts)}px, Sat ${sat.toFixed(2)}: ${(p * 100).toFixed(1)}%`}
                  >
                    <div
                      className="tg-box"
                      style={{
                        width: boxSize,
                        height: boxSize,
                        backgroundColor: "white",
                        border: "1px solid #ccc",
                      }}
                    >
                      <CssTriangle size={renderSize} color="black" />
                    </div>
                    <span className="tg-prob" style={{ color: "black" }}>
                      {(p * 100).toFixed(0)}%
                    </span>
                  </div>
                );
              })}
            </>
          ))}
        </div>
      </div>
    </div>
  );
}

/* A simple CSS-border triangle pointing north, centered in its parent */
function CssTriangle({ size, color }) {
  const h = 0.866 * size;
  const half = size / 2;
  return (
    <div
      style={{
        width: 0,
        height: 0,
        borderLeft: `${half}px solid transparent`,
        borderRight: `${half}px solid transparent`,
        borderBottom: `${h}px solid ${color}`,
      }}
    />
  );
}

/* ══════════════════════════════════════════════════════════
   Compare Tab
   ══════════════════════════════════════════════════════════ */
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

/* ══════════════════════════════════════════════════════════
   Custom Model Tab – define your own formula
   ══════════════════════════════════════════════════════════ */
function CustomModelTab({ bounds, steps, onModelsChanged }) {
  const [modelType, setModelType] = useState("polynomial");
  // Polynomial params
  const [base, setBase] = useState(0.6);
  const [coefficient, setCoefficient] = useState(0.39);
  const [exponent, setExponent] = useState(0.5);
  const [sizeScale, setSizeScale] = useState(400);
  const [satScale, setSatScale] = useState(1);
  // Bandpass params
  const [tsLow, setTsLow] = useState(50);
  const [tsWLow, setTsWLow] = useState(15);
  const [tsHigh, setTsHigh] = useState(300);
  const [tsWHigh, setTsWHigh] = useState(15);
  const [satLow, setSatLow] = useState(0.2);
  const [satWLow, setSatWLow] = useState(0.05);
  const [satHigh, setSatHigh] = useState(0.8);
  const [satWHigh, setSatWHigh] = useState(0.05);
  const [bpGamma, setBpGamma] = useState(1);
  const [epsClip, setEpsClip] = useState(0.01);
  // Threshold params
  const [cInf, setCInf] = useState(0.12);
  const [c0, setC0] = useState(0.95);
  const [ts50, setTs50] = useState(60);
  const [thBeta, setThBeta] = useState(2);
  const [thK, setThK] = useState(3);
  // Common
  const [customHeatmap, setCustomHeatmap] = useState(null);
  const [customLoading, setCustomLoading] = useState(false);
  const [modelName, setModelName] = useState("");
  const [saveStatus, setSaveStatus] = useState("");
  const [savedModels, setSavedModels] = useState([]);

  const fetchCustom = useCallback(async () => {
    setCustomLoading(true);
    try {
      const body = {
        model_type: modelType,
        steps,
        ...bounds,
      };
      if (modelType === "bandpass") {
        Object.assign(body, {
          ts_low: tsLow, ts_w_low: tsWLow,
          ts_high: tsHigh, ts_w_high: tsWHigh,
          sat_low: satLow, sat_w_low: satWLow,
          sat_high: satHigh, sat_w_high: satWHigh,
          gamma: bpGamma, eps_clip: epsClip,
        });
      } else if (modelType === "threshold") {
        Object.assign(body, {
          c_inf: cInf, c_0: c0, ts_50: ts50, beta: thBeta, k: thK,
        });
      } else {
        Object.assign(body, {
          base, coefficient, exponent,
          size_scale: sizeScale, sat_scale: satScale,
        });
      }
      const r = await fetch(`${API}/simulation-models/custom/heatmap`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await r.json();
      setCustomHeatmap(data);
    } catch {
      setCustomHeatmap(null);
    } finally {
      setCustomLoading(false);
    }
  }, [modelType, base, coefficient, exponent, sizeScale, satScale,
      tsLow, tsWLow, tsHigh, tsWHigh, satLow, satWLow, satHigh, satWHigh,
      bpGamma, epsClip, cInf, c0, ts50, thBeta, thK, steps, bounds]);

  useEffect(() => {
    const timer = setTimeout(() => fetchCustom(), 300);
    return () => clearTimeout(timer);
  }, [fetchCustom]);

  // Load saved models
  useEffect(() => {
    fetch(`${API}/custom-models`)
      .then((r) => r.json())
      .then((data) => setSavedModels(data))
      .catch(() => {});
  }, []);

  const handleSave = async () => {
    if (!modelName.trim()) {
      setSaveStatus("Please enter a model name");
      return;
    }
    try {
      const body = { name: modelName.trim(), model_type: modelType };
      if (modelType === "bandpass") {
        Object.assign(body, {
          ts_low: tsLow, ts_w_low: tsWLow,
          ts_high: tsHigh, ts_w_high: tsWHigh,
          sat_low: satLow, sat_w_low: satWLow,
          sat_high: satHigh, sat_w_high: satWHigh,
          gamma: bpGamma, eps_clip: epsClip,
        });
      } else if (modelType === "threshold") {
        Object.assign(body, {
          c_inf: cInf, c_0: c0, ts_50: ts50, beta: thBeta, k: thK,
        });
      } else {
        Object.assign(body, {
          base, coefficient, exponent,
          size_scale: sizeScale, sat_scale: satScale,
        });
      }
      const r = await fetch(`${API}/custom-models`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (r.ok) {
        setSaveStatus("Model saved successfully!");
        setModelName("");
        const models = await fetch(`${API}/custom-models`).then((r) => r.json());
        setSavedModels(models);
        onModelsChanged?.();
        setTimeout(() => setSaveStatus(""), 3000);
      } else {
        const err = await r.json();
        setSaveStatus(`Error: ${err.detail || "Failed to save"}`);
      }
    } catch {
      setSaveStatus("Error: Failed to save model");
    }
  };

  const handleLoad = (model) => {
    const type = model.model_type || "polynomial";
    setModelType(type);
    if (type === "bandpass") {
      setTsLow(model.ts_low ?? 50);
      setTsWLow(model.ts_w_low ?? 15);
      setTsHigh(model.ts_high ?? 300);
      setTsWHigh(model.ts_w_high ?? 15);
      setSatLow(model.sat_low ?? 0.2);
      setSatWLow(model.sat_w_low ?? 0.05);
      setSatHigh(model.sat_high ?? 0.8);
      setSatWHigh(model.sat_w_high ?? 0.05);
      setBpGamma(model.gamma ?? 1);
      setEpsClip(model.eps_clip ?? 0.01);
    } else if (type === "threshold") {
      setCInf(model.c_inf ?? 0.12);
      setC0(model.c_0 ?? 0.95);
      setTs50(model.ts_50 ?? 60);
      setThBeta(model.beta ?? 2);
      setThK(model.k ?? 3);
    } else {
      setBase(model.base);
      setCoefficient(model.coefficient);
      setExponent(model.exponent);
      setSizeScale(model.size_scale ?? 400);
      setSatScale(model.sat_scale ?? 1);
    }
    setSaveStatus(`Loaded "${model.name}"`);
    setTimeout(() => setSaveStatus(""), 3000);
  };

  const handleDelete = async (name) => {
    try {
      const r = await fetch(`${API}/custom-models/${encodeURIComponent(name)}`, {
        method: "DELETE",
      });
      if (r.ok) {
        setSavedModels((prev) => prev.filter((m) => m.name !== name));
        onModelsChanged?.();
        setSaveStatus(`Deleted "${name}"`);
        setTimeout(() => setSaveStatus(""), 3000);
      }
    } catch {}
  };

  const desc = modelType === "bandpass"
    ? `0.25 + 0.75 × W, W_ts = σ((ts-${tsLow})/${tsWLow})·σ((${tsHigh}-ts)/${tsWHigh}), W_sat = σ((sat-${satLow})/${satWLow})·σ((${satHigh}-sat)/${satWHigh})`
    : modelType === "threshold"
    ? `0.25 + 0.75 × (1 - exp(-${thK} × max(0, ln(sat / C_t(ts))))), C_t = ${cInf} + (${c0} - ${cInf}) / (1 + (ts/${ts50})^${thBeta})`
    : `${base} + ${coefficient} × (((ts/${sizeScale})² + (sat/${satScale})²) / 2)^${exponent}`;

  return (
    <div className="custom-model-tab">
      <div className="formula-card">
        <h3>Define Custom Model</h3>

        {/* Model Type selector */}
        <div className="custom-params" style={{ marginBottom: "0.75rem" }}>
          <div className="custom-param" style={{ minWidth: "200px" }}>
            <label>Model Type</label>
            <select
              value={modelType}
              onChange={(e) => setModelType(e.target.value)}
              style={{ width: "100%", padding: "0.4rem" }}
            >
              <option value="polynomial">Polynomial</option>
              <option value="bandpass">Bandpass (Sigmoid Window)</option>
              <option value="threshold">Contrast Threshold</option>
            </select>
          </div>
        </div>

        {modelType === "polynomial" && (
          <>
            <p className="formula-note" style={{ marginBottom: "0.75rem" }}>
              Formula: <code>P = base + coefficient × (((ts/size_scale)² + (sat/sat_scale)²) / 2)<sup>exponent</sup></code>
            </p>
            <div className="custom-params">
              <div className="custom-param">
                <label>Base</label>
                <input type="number" step="0.01" value={base}
                  onChange={(e) => setBase(parseNum(e.target.value, base))} />
              </div>
              <div className="custom-param">
                <label>Coefficient</label>
                <input type="number" step="0.01" value={coefficient}
                  onChange={(e) => setCoefficient(parseNum(e.target.value, coefficient))} />
              </div>
              <div className="custom-param">
                <label>Exponent</label>
                <input type="number" step="0.1" value={exponent}
                  onChange={(e) => setExponent(parseNum(e.target.value, exponent))} />
              </div>
              <div className="custom-param">
                <label>Size scale (px)</label>
                <input type="number" step="10" min="1" value={sizeScale}
                  onChange={(e) => setSizeScale(parseNum(e.target.value, sizeScale))} />
              </div>
              <div className="custom-param">
                <label>Sat scale</label>
                <input type="number" step="0.1" min="0.01" value={satScale}
                  onChange={(e) => setSatScale(parseNum(e.target.value, satScale))} />
              </div>
            </div>
          </>
        )}
        {modelType === "bandpass" && (
          <>
            <p className="formula-note" style={{ marginBottom: "0.75rem" }}>
              Formula: <code>P = 0.25 + 0.75 × W</code>, where <code>W = clip(((W_ts·W_sat)^γ − ε) / (1 − ε), 0, 1)</code>
            </p>
            <p className="formula-note" style={{ marginBottom: "0.75rem", fontSize: "0.72rem" }}>
              <code>W_x = σ((x − low) / w_low) · σ((high − x) / w_high)</code>.
              Defines a sigmoid-gated window on each axis.
            </p>
            <div className="custom-params">
              <div className="custom-param">
                <label>Size low</label>
                <input type="number" step="5" value={tsLow}
                  onChange={(e) => setTsLow(parseNum(e.target.value, tsLow))} />
              </div>
              <div className="custom-param">
                <label>Size w_low</label>
                <input type="number" step="1" min="0.1" value={tsWLow}
                  onChange={(e) => setTsWLow(parseNum(e.target.value, tsWLow))} />
              </div>
              <div className="custom-param">
                <label>Size high</label>
                <input type="number" step="5" value={tsHigh}
                  onChange={(e) => setTsHigh(parseNum(e.target.value, tsHigh))} />
              </div>
              <div className="custom-param">
                <label>Size w_high</label>
                <input type="number" step="1" min="0.1" value={tsWHigh}
                  onChange={(e) => setTsWHigh(parseNum(e.target.value, tsWHigh))} />
              </div>
              <div className="custom-param">
                <label>Sat low</label>
                <input type="number" step="0.05" value={satLow}
                  onChange={(e) => setSatLow(parseNum(e.target.value, satLow))} />
              </div>
              <div className="custom-param">
                <label>Sat w_low</label>
                <input type="number" step="0.01" min="0.001" value={satWLow}
                  onChange={(e) => setSatWLow(parseNum(e.target.value, satWLow))} />
              </div>
              <div className="custom-param">
                <label>Sat high</label>
                <input type="number" step="0.05" value={satHigh}
                  onChange={(e) => setSatHigh(parseNum(e.target.value, satHigh))} />
              </div>
              <div className="custom-param">
                <label>Sat w_high</label>
                <input type="number" step="0.01" min="0.001" value={satWHigh}
                  onChange={(e) => setSatWHigh(parseNum(e.target.value, satWHigh))} />
              </div>
              <div className="custom-param">
                <label>Gamma (γ)</label>
                <input type="number" step="0.1" min="0.1" value={bpGamma}
                  onChange={(e) => setBpGamma(parseNum(e.target.value, bpGamma))} />
              </div>
              <div className="custom-param">
                <label>Eps clip (ε)</label>
                <input type="number" step="0.01" min="0" max="0.99" value={epsClip}
                  onChange={(e) => setEpsClip(parseNum(e.target.value, epsClip))} />
              </div>
            </div>
          </>
        )}
        {modelType === "threshold" && (
          <>
            <p className="formula-note" style={{ marginBottom: "0.75rem" }}>
              Formula: <code>P = 0.25 + 0.75 × (1 − e<sup>−k·max(0, ln(sat/C_t(ts)))</sup>)</code>
            </p>
            <p className="formula-note" style={{ marginBottom: "0.75rem", fontSize: "0.72rem" }}>
              <code>C_t(ts) = C_∞ + (C_0 − C_∞) / (1 + (ts/ts_50)^β)</code>.
              Size sets the required saturation threshold; performance rises only above it.
            </p>
            <div className="custom-params">
              <div className="custom-param">
                <label>C_∞ (asymptote)</label>
                <input type="number" step="0.01" min="0" max="1" value={cInf}
                  onChange={(e) => setCInf(parseNum(e.target.value, cInf))} />
              </div>
              <div className="custom-param">
                <label>C_0 (at size 0)</label>
                <input type="number" step="0.01" min="0" value={c0}
                  onChange={(e) => setC0(parseNum(e.target.value, c0))} />
              </div>
              <div className="custom-param">
                <label>ts_50 (midpoint px)</label>
                <input type="number" step="5" min="1" value={ts50}
                  onChange={(e) => setTs50(parseNum(e.target.value, ts50))} />
              </div>
              <div className="custom-param">
                <label>β (steepness)</label>
                <input type="number" step="0.1" min="0.1" value={thBeta}
                  onChange={(e) => setThBeta(parseNum(e.target.value, thBeta))} />
              </div>
              <div className="custom-param">
                <label>k (rise rate)</label>
                <input type="number" step="0.5" min="0.1" value={thK}
                  onChange={(e) => setThK(parseNum(e.target.value, thK))} />
              </div>
            </div>
          </>
        )}

        <div className="formula-display" style={{ marginTop: "0.75rem" }}>
          <span className="formula-label">P(success) =</span>
          <code className="formula-code">{desc}</code>
        </div>

        {/* Save section */}
        <div style={{ marginTop: "1rem", paddingTop: "1rem", borderTop: "1px solid var(--border-subtle)" }}>
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "flex-end" }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: "0.75rem", fontWeight: 500, color: "var(--text-secondary)", display: "block", marginBottom: "0.25rem" }}>
                Model Name
              </label>
              <input
                type="text"
                placeholder="e.g., My Custom Model"
                value={modelName}
                onChange={(e) => setModelName(e.target.value)}
                style={{
                  width: "100%",
                  padding: "0.5rem",
                  border: "1px solid var(--card-border)",
                  borderRadius: "var(--radius-sm)",
                  fontSize: "0.85rem",
                }}
              />
            </div>
            <button
              onClick={handleSave}
              style={{
                padding: "0.5rem 1rem",
                backgroundColor: "var(--accent)",
                color: "white",
                border: "none",
                borderRadius: "var(--radius-sm)",
                fontSize: "0.85rem",
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              Save Model
            </button>
          </div>
          {saveStatus && (
            <p style={{ marginTop: "0.5rem", fontSize: "0.8rem", color: saveStatus.includes("Error") ? "var(--error)" : "var(--success)" }}>
              {saveStatus}
            </p>
          )}
        </div>
      </div>

      {savedModels.length > 0 && (
        <div className="formula-card">
          <h3>Saved Models</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {savedModels.map((model) => (
              <div
                key={model.name}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "0.5rem",
                  backgroundColor: "var(--background)",
                  border: "1px solid var(--border-subtle)",
                  borderRadius: "var(--radius-sm)",
                }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 500, fontSize: "0.85rem" }}>
                    {model.name}
                    <span style={{
                      marginLeft: "0.5rem",
                      fontSize: "0.65rem",
                      padding: "0.1rem 0.35rem",
                      borderRadius: "3px",
                      backgroundColor: { bandpass: "#e3f2fd", threshold: "#fff3e0", polynomial: "#f3e5f5" }[(model.model_type || "polynomial")] || "#f3e5f5",
                      color: { bandpass: "#1565c0", threshold: "#e65100", polynomial: "#7b1fa2" }[(model.model_type || "polynomial")] || "#7b1fa2",
                    }}>
                      {(model.model_type || "polynomial")}
                    </span>
                  </div>
                  <div style={{ fontSize: "0.72rem", color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}>
                    {(model.model_type || "polynomial") === "bandpass"
                      ? `bandpass: ts=[${model.ts_low},${model.ts_high}], sat=[${model.sat_low},${model.sat_high}], γ=${model.gamma}`
                      : (model.model_type || "polynomial") === "threshold"
                      ? `threshold: C_∞=${model.c_inf}, C_0=${model.c_0}, ts_50=${model.ts_50}, β=${model.beta}, k=${model.k}`
                      : `${model.base} + ${model.coefficient} × (((ts/${model.size_scale ?? 400})² + (sat/${model.sat_scale ?? 1})²) / 2)^${model.exponent}`
                    }
                  </div>
                </div>
                <div style={{ display: "flex", gap: "0.25rem" }}>
                  <button
                    onClick={() => handleLoad(model)}
                    style={{
                      padding: "0.25rem 0.5rem",
                      fontSize: "0.75rem",
                      border: "1px solid var(--border)",
                      borderRadius: "var(--radius-sm)",
                      backgroundColor: "var(--background)",
                      cursor: "pointer",
                    }}
                  >
                    Load
                  </button>
                  <button
                    onClick={() => handleDelete(model.name)}
                    style={{
                      padding: "0.25rem 0.5rem",
                      fontSize: "0.75rem",
                      border: "1px solid var(--error)",
                      borderRadius: "var(--radius-sm)",
                      backgroundColor: "var(--background)",
                      color: "var(--error)",
                      cursor: "pointer",
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {customLoading && !customHeatmap ? (
        <div className="loading-state">Computing…</div>
      ) : customHeatmap ? (
        <>
          <div className="formula-card" style={{ position: "relative" }}>
            <h3>Heatmap{customLoading ? <span style={{ fontSize: "0.7rem", fontWeight: 400, marginLeft: "0.5rem", color: "var(--text-secondary)" }}>updating…</span> : null}</h3>
            <HeatmapCanvas heatmap={customHeatmap} />
          </div>
          <div className="formula-card">
            <h3>Quick Reference</h3>
            <SamplePoints heatmap={customHeatmap} />
          </div>
        </>
      ) : null}
    </div>
  );
}

/* ── Sample points table ─── */
function SamplePoints({ heatmap }) {
  if (!heatmap?.triangle_sizes || !heatmap?.saturations || !heatmap?.grid) return null;
  const ts = heatmap.triangle_sizes;
  const sat = heatmap.saturations;
  const grid = heatmap.grid;

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

/* ══════════════════════════════════════════════════════════
   Color helpers
   ══════════════════════════════════════════════════════════ */

function diffColor(d) {
  const abs = Math.min(Math.abs(d), 0.3) / 0.3;
  if (d >= 0) {
    return `rgba(45,138,78,${0.1 + abs * 0.5})`;
  }
  return `rgba(198,40,40,${0.1 + abs * 0.5})`;
}

export default ModelExplorer;
