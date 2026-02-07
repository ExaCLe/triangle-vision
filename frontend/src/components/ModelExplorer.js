import { useState, useEffect, useCallback, useRef } from "react";
import "../css/ModelExplorer.css";

const API = "http://localhost:8000/api/settings";

function ModelExplorer() {
  const [models, setModels] = useState([]);
  const [selectedModel, setSelectedModel] = useState("");
  const [compareModel, setCompareModel] = useState("");
  const [tab, setTab] = useState("formula"); // formula | grid | compare | custom
  const [heatmap, setHeatmap] = useState(null);
  const [compareHeatmap, setCompareHeatmap] = useState(null);
  const [loading, setLoading] = useState(false);
  const [steps, setSteps] = useState(20);

  // Bounds controls
  const [bounds, setBounds] = useState({
    min_triangle_size: 10,
    max_triangle_size: 400,
    min_saturation: 0,
    max_saturation: 1,
  });

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

  const boundsQuery = `&min_triangle_size=${bounds.min_triangle_size}&max_triangle_size=${bounds.max_triangle_size}&min_saturation=${bounds.min_saturation}&max_saturation=${bounds.max_saturation}`;

  // Fetch heatmap whenever model, steps, or bounds changes
  const fetchHeatmap = useCallback(async () => {
    if (!selectedModel) return;
    setLoading(true);
    try {
      const r = await fetch(
        `${API}/simulation-models/${selectedModel}/heatmap?steps=${steps}${boundsQuery}`
      );
      const data = await r.json();
      setHeatmap(data);
    } catch {
      setHeatmap(null);
    } finally {
      setLoading(false);
    }
  }, [selectedModel, steps, boundsQuery]);

  useEffect(() => {
    fetchHeatmap();
  }, [fetchHeatmap]);

  // Fetch comparison heatmap
  const fetchCompareHeatmap = useCallback(async () => {
    if (!compareModel || tab !== "compare") return;
    try {
      const r = await fetch(
        `${API}/simulation-models/${compareModel}/heatmap?steps=${steps}${boundsQuery}`
      );
      const data = await r.json();
      setCompareHeatmap(data);
    } catch {
      setCompareHeatmap(null);
    }
  }, [compareModel, steps, tab, boundsQuery]);

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
            max={50}
            value={steps}
            onChange={(e) => {
              const v = Math.max(2, Math.min(50, Number(e.target.value) || 2));
              setSteps(v);
            }}
          />
        </div>
        <div className="model-selector-group">
          <label>Min size (px)</label>
          <input
            type="number"
            min={1}
            value={bounds.min_triangle_size}
            onChange={(e) =>
              setBounds((b) => ({
                ...b,
                min_triangle_size: Number(e.target.value) || 0,
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
                max_triangle_size: Number(e.target.value) || 400,
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
            max={1}
            value={bounds.min_saturation}
            onChange={(e) =>
              setBounds((b) => ({
                ...b,
                min_saturation: Number(e.target.value) || 0,
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
            max={1}
            value={bounds.max_saturation}
            onChange={(e) =>
              setBounds((b) => ({
                ...b,
                max_saturation: Number(e.target.value) || 1,
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
          <CustomModelTab bounds={bounds} steps={steps} />
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
        <p className="formula-note">
          Where <code>ts</code> is the triangle size and <code>sat</code> is the
          saturation, both scaled to [0, 1] relative to the configured bounds.
        </p>
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
          RdYlGn colormap (red=low, yellow=mid, green=high). White contour = 75%,
          black contour = 90%.
        </p>
        {loading ? (
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
        Each cell renders an actual triangle at the given size. The background
        circle color represents the saturation level. The percentage shows the
        model's predicted success probability.
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
                const circleDia = Math.max(20, (ts / maxTs) * circleMax);
                // Circle saturation: sat 0 = gray, sat 1 = full red (#c85028)
                const hue = 14;
                const satPercent = Math.round(sat * 100);
                const lightness = Math.round(90 - sat * 45);
                const circleColor = `hsl(${hue}, ${satPercent}%, ${lightness}%)`;
                // Triangle color = darker version
                const triLightness = Math.round(50 - sat * 25);
                const triColor = `hsl(${hue}, ${satPercent}%, ${triLightness}%)`;

                return (
                  <div
                    key={`${si}-${ti}`}
                    className="tg-cell"
                    title={`Size ${Math.round(ts)}px, Sat ${sat.toFixed(2)}: ${(p * 100).toFixed(1)}%`}
                  >
                    <div
                      className="tg-circle"
                      style={{
                        width: circleDia,
                        height: circleDia,
                        backgroundColor: circleColor,
                        borderRadius: "50%",
                      }}
                    >
                      <CssTriangle size={renderSize} color={triColor} />
                    </div>
                    <span
                      className="tg-prob"
                      style={{ color: probTextColor(p) }}
                    >
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
function CustomModelTab({ bounds, steps }) {
  const [base, setBase] = useState(0.6);
  const [coefficient, setCoefficient] = useState(0.39);
  const [exponent, setExponent] = useState(0.5);
  const [customHeatmap, setCustomHeatmap] = useState(null);
  const [customLoading, setCustomLoading] = useState(false);

  const fetchCustom = useCallback(async () => {
    setCustomLoading(true);
    try {
      const r = await fetch(`${API}/simulation-models/custom/heatmap`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          base,
          coefficient,
          exponent,
          steps,
          ...bounds,
        }),
      });
      const data = await r.json();
      setCustomHeatmap(data);
    } catch {
      setCustomHeatmap(null);
    } finally {
      setCustomLoading(false);
    }
  }, [base, coefficient, exponent, steps, bounds]);

  useEffect(() => {
    fetchCustom();
  }, [fetchCustom]);

  const desc = `${base} + ${coefficient} × ((ts² + sat²) / 2)^${exponent}`;

  return (
    <div className="custom-model-tab">
      <div className="formula-card">
        <h3>Define Custom Model</h3>
        <p className="formula-note" style={{ marginBottom: "0.75rem" }}>
          Formula: <code>P = base + coefficient × ((ts² + sat²) / 2)<sup>exponent</sup></code>
        </p>
        <div className="custom-params">
          <div className="custom-param">
            <label>Base</label>
            <input
              type="number"
              step="0.01"
              value={base}
              onChange={(e) => setBase(Number(e.target.value) || 0)}
            />
          </div>
          <div className="custom-param">
            <label>Coefficient</label>
            <input
              type="number"
              step="0.01"
              value={coefficient}
              onChange={(e) => setCoefficient(Number(e.target.value) || 0)}
            />
          </div>
          <div className="custom-param">
            <label>Exponent</label>
            <input
              type="number"
              step="0.1"
              value={exponent}
              onChange={(e) => setExponent(Number(e.target.value) || 0.5)}
            />
          </div>
        </div>
        <div className="formula-display" style={{ marginTop: "0.75rem" }}>
          <span className="formula-label">P(success) =</span>
          <code className="formula-code">{desc}</code>
        </div>
      </div>

      {customLoading ? (
        <div className="loading-state">Computing…</div>
      ) : customHeatmap ? (
        <>
          <div className="formula-card">
            <h3>Heatmap</h3>
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

/* ══════════════════════════════════════════════════════════
   Canvas-based heatmap – RdYlGn with contour lines
   ══════════════════════════════════════════════════════════ */
function HeatmapCanvas({ heatmap }) {
  const canvasRef = useRef(null);
  const cols = heatmap.triangle_sizes.length;
  const rows = heatmap.saturations.length;
  const mLeft = 60, mBottom = 50, mTop = 14, mRight = 60;
  const plotW = Math.min(560, cols * 28);
  const plotH = Math.min(440, rows * 28);
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

    // Clear
    ctx.clearRect(0, 0, totalW, totalH);

    const cellW = plotW / cols;
    const cellH = plotH / rows;

    // Draw filled cells (bottom row = sat index 0 → y top is rows-1)
    for (let si = 0; si < rows; si++) {
      const ry = rows - 1 - si; // visual row (0 = top = high sat)
      for (let ci = 0; ci < cols; ci++) {
        const p = heatmap.grid[si][ci];
        ctx.fillStyle = rdYlGn(p);
        ctx.fillRect(
          margin.left + ci * cellW,
          margin.top + ry * cellH,
          cellW + 0.5,
          cellH + 0.5
        );
      }
    }

    // Draw contour lines using marching squares
    drawContour(ctx, heatmap.grid, 0.75, "rgba(255,255,255,0.9)", 2.5, margin, plotW, plotH, cols, rows);
    drawContour(ctx, heatmap.grid, 0.90, "rgba(0,0,0,0.8)", 2.5, margin, plotW, plotH, cols, rows);

    // Axes
    ctx.strokeStyle = "var(--border, #ccc)";
    ctx.lineWidth = 1;
    ctx.strokeRect(margin.left, margin.top, plotW, plotH);

    // X-axis labels
    ctx.fillStyle = getComputedStyle(document.documentElement)
      .getPropertyValue("--text-secondary")
      .trim() || "#7c7a72";
    ctx.font = "10px monospace";
    ctx.textAlign = "center";
    const xLabelStep = Math.max(1, Math.ceil(cols / 8));
    for (let ci = 0; ci < cols; ci += xLabelStep) {
      const x = margin.left + ci * cellW + cellW / 2;
      ctx.fillText(Math.round(heatmap.triangle_sizes[ci]).toString(), x, margin.top + plotH + 16);
    }
    ctx.font = "11px sans-serif";
    ctx.fillText("Triangle Size (px)", margin.left + plotW / 2, margin.top + plotH + 38);

    // Y-axis labels
    ctx.font = "10px monospace";
    ctx.textAlign = "right";
    const yLabelStep = Math.max(1, Math.ceil(rows / 8));
    for (let si = 0; si < rows; si += yLabelStep) {
      const ry = rows - 1 - si;
      const y = margin.top + ry * cellH + cellH / 2 + 3;
      ctx.fillText(heatmap.saturations[si].toFixed(2), margin.left - 6, y);
    }
    ctx.save();
    ctx.translate(14, margin.top + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = "center";
    ctx.font = "11px sans-serif";
    ctx.fillText("Saturation", 0, 0);
    ctx.restore();

    // Color bar
    const barX = margin.left + plotW + 14;
    const barW = 14;
    const barH = plotH;
    for (let i = 0; i < barH; i++) {
      const p = 1 - i / barH; // top = 1, bottom = 0
      const mapped = 0.3 + p * 0.7; // map [0,1] → [0.3,1.0]
      ctx.fillStyle = rdYlGn(mapped);
      ctx.fillRect(barX, margin.top + i, barW, 1.5);
    }
    ctx.strokeStyle = "#999";
    ctx.lineWidth = 0.5;
    ctx.strokeRect(barX, margin.top, barW, barH);

    // Color bar labels
    ctx.fillStyle = getComputedStyle(document.documentElement)
      .getPropertyValue("--text-secondary")
      .trim() || "#7c7a72";
    ctx.font = "9px monospace";
    ctx.textAlign = "left";
    const barLabels = [1.0, 0.9, 0.75, 0.6, 0.3];
    barLabels.forEach((v) => {
      const frac = (v - 0.3) / 0.7;
      const y = margin.top + (1 - frac) * barH + 3;
      ctx.fillText(v.toFixed(2), barX + barW + 4, y);
    });
  }, [heatmap, cols, rows, plotW, plotH, totalW, totalH, mLeft, mTop, mRight, mBottom]);

  return (
    <div className="heatmap-visual">
      <canvas ref={canvasRef} className="heatmap-canvas" />
    </div>
  );
}

/* ── Marching-squares contour line drawing ─── */
function drawContour(ctx, grid, threshold, color, lineWidth, margin, plotW, plotH, cols, rows) {
  const cellW = plotW / cols;
  const cellH = plotH / rows;

  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = "round";
  ctx.beginPath();

  for (let si = 0; si < rows - 1; si++) {
    for (let ci = 0; ci < cols - 1; ci++) {
      // Visual y: grid row si maps to visual row (rows-1-si)
      const ry = rows - 1 - si;
      const v00 = grid[si][ci];     // bottom-left
      const v10 = grid[si][ci + 1]; // bottom-right
      const v01 = grid[si + 1][ci]; // top-left
      const v11 = grid[si + 1][ci + 1]; // top-right

      const b00 = v00 >= threshold ? 1 : 0;
      const b10 = v10 >= threshold ? 1 : 0;
      const b01 = v01 >= threshold ? 1 : 0;
      const b11 = v11 >= threshold ? 1 : 0;
      const idx = b00 | (b10 << 1) | (b11 << 2) | (b01 << 3);
      if (idx === 0 || idx === 15) continue;

      // Interpolation helpers
      const lerp = (a, b, ta, tb) => {
        if (Math.abs(tb - ta) < 1e-9) return 0.5;
        return (threshold - ta) / (tb - ta);
      };

      // Edge midpoints (in cell-local 0-1 coords, then mapped)
      const ox = margin.left + ci * cellW;
      const oy = margin.top + (ry - 1) * cellH; // ry-1 because ry row is above

      const bottom = (t) => [ox + t * cellW, oy + cellH]; // bottom edge
      const top_ = (t) => [ox + t * cellW, oy];            // top edge
      const left = (t) => [ox, oy + (1 - t) * cellH];       // left edge
      const right = (t) => [ox + cellW, oy + (1 - t) * cellH]; // right edge

      const tBottom = lerp(0, 1, v00, v10);
      const tTop = lerp(0, 1, v01, v11);
      const tLeft = lerp(0, 1, v00, v01);
      const tRight = lerp(0, 1, v10, v11);

      const segments = marchingSegments(idx, bottom(tBottom), top_(tTop), left(tLeft), right(tRight));
      segments.forEach(([from, to]) => {
        ctx.moveTo(from[0], from[1]);
        ctx.lineTo(to[0], to[1]);
      });
    }
  }

  ctx.stroke();
  ctx.restore();
}

function marchingSegments(idx, bot, top, lft, rgt) {
  // Returns an array of [from, to] line segments for a marching squares case
  const cases = {
    1: [[bot, lft]],
    2: [[bot, rgt]],
    3: [[lft, rgt]],
    4: [[top, rgt]],
    5: [[bot, rgt], [top, lft]],
    6: [[bot, top]],
    7: [[top, lft]],
    8: [[top, lft]],
    9: [[bot, top]],
    10: [[bot, lft], [top, rgt]],
    11: [[top, rgt]],
    12: [[lft, rgt]],
    13: [[bot, rgt]],
    14: [[bot, lft]],
  };
  return cases[idx] || [];
}

/* ── Sample points table ─── */
function SamplePoints({ heatmap }) {
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

/** RdYlGn colormap matching matplotlib's RdYlGn,
 *  mapped to the 0.3–1.0 range used in the backend. */
function rdYlGn(p) {
  // Clamp to display range
  const t = Math.max(0, Math.min(1, (p - 0.3) / 0.7));
  // Key stops for RdYlGn: red → orange → yellow → yellow-green → green
  const stops = [
    [215, 48, 39],    // 0.0 – red
    [244, 109, 67],   // 0.15
    [253, 174, 97],   // 0.3
    [254, 224, 139],  // 0.45
    [255, 255, 191],  // 0.5
    [217, 239, 139],  // 0.6
    [166, 217, 106],  // 0.7
    [102, 189, 99],   // 0.8
    [26, 152, 80],    // 0.95
    [0, 104, 55],     // 1.0
  ];

  const n = stops.length - 1;
  const idx = t * n;
  const lo = Math.floor(idx);
  const hi = Math.min(lo + 1, n);
  const frac = idx - lo;

  const r = Math.round(stops[lo][0] + (stops[hi][0] - stops[lo][0]) * frac);
  const g = Math.round(stops[lo][1] + (stops[hi][1] - stops[lo][1]) * frac);
  const b = Math.round(stops[lo][2] + (stops[hi][2] - stops[lo][2]) * frac);
  return `rgb(${r},${g},${b})`;
}

function diffColor(d) {
  const abs = Math.min(Math.abs(d), 0.3) / 0.3;
  if (d >= 0) {
    return `rgba(45,138,78,${0.1 + abs * 0.5})`;
  }
  return `rgba(198,40,40,${0.1 + abs * 0.5})`;
}

function probTextColor(p) {
  if (p >= 0.85) return "var(--success, #2d8a4e)";
  if (p >= 0.7) return "var(--text-primary, #1a1917)";
  return "var(--error, #c62828)";
}

export default ModelExplorer;
