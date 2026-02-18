import { useEffect, useMemo, useState } from "react";
import { useLocation, useParams } from "react-router-dom";
import "../css/TestVisualization.css";

const API = "http://localhost:8000/api";

function AxisCurveChart({ title, axisKey, curve }) {
  if (!curve?.x?.length || !curve?.probability?.length) {
    return (
      <div className="visualization-section">
        <h4>{title}</h4>
        <p>No curve data available.</p>
      </div>
    );
  }

  const width = 560;
  const height = 220;
  const padLeft = 44;
  const padRight = 12;
  const padTop = 14;
  const padBottom = 28;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const xMin = curve.x[0];
  const xMax = curve.x[curve.x.length - 1];
  const xDen = Math.max(xMax - xMin, 1e-9);

  const toX = (value) => padLeft + ((value - xMin) / xDen) * plotW;
  const toY = (probability) => padTop + (1 - probability) * plotH;

  const linePath = curve.x
    .map((value, index) => `${index === 0 ? "M" : "L"} ${toX(value)} ${toY(curve.probability[index])}`)
    .join(" ");
  const upperPath = curve.x
    .map((value, index) => `${index === 0 ? "M" : "L"} ${toX(value)} ${toY(curve.upper[index])}`)
    .join(" ");
  const lowerPath = [...curve.x]
    .reverse()
    .map((value, reverseIndex) => {
      const index = curve.x.length - 1 - reverseIndex;
      return `${reverseIndex === 0 ? "L" : "L"} ${toX(value)} ${toY(curve.lower[index])}`;
    })
    .join(" ");

  return (
    <div className="visualization-section">
      <h4>{title}</h4>
      <div className="curve-meta">
        {axisKey === "size"
          ? `Fixed saturation: ${curve.fixed_counterpart?.saturation?.toFixed(3)}`
          : `Fixed size: ${curve.fixed_counterpart?.triangle_size?.toFixed(1)}`}
      </div>
      <svg width={width} height={height} className="run-curve-svg" role="img">
        <rect
          x={padLeft}
          y={padTop}
          width={plotW}
          height={plotH}
          fill="transparent"
          stroke="var(--border)"
        />
        <path
          d={`${upperPath} ${lowerPath} Z`}
          fill="rgba(80, 150, 255, 0.16)"
          stroke="none"
        />
        <path d={linePath} stroke="rgb(36, 117, 255)" fill="none" strokeWidth="2" />
        <text x={width / 2} y={height - 6} textAnchor="middle" className="curve-axis-label">
          {axisKey === "size" ? "Triangle size" : "Saturation"}
        </text>
        <text
          x="14"
          y={height / 2}
          textAnchor="middle"
          className="curve-axis-label"
          transform={`rotate(-90 14 ${height / 2})`}
        >
          P(correct)
        </text>
      </svg>
    </div>
  );
}

function TestVisualization() {
  const { testId } = useParams();
  const location = useLocation();
  const [runs, setRuns] = useState([]);
  const [selectedRunId, setSelectedRunId] = useState(null);
  const [runSummary, setRunSummary] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(true);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [error, setError] = useState(null);
  const [percentStep, setPercentStep] = useState("5");

  const selectedRun = useMemo(
    () => runs.find((run) => run.id === selectedRunId),
    [runs, selectedRunId]
  );

  useEffect(() => {
    const query = new URLSearchParams(location.search);
    const runIdFromQuery = Number(query.get("runId"));

    setLoading(true);
    setError(null);
    fetch(`${API}/runs/test/${testId}`)
      .then((response) => {
        if (!response.ok) {
          throw new Error("Failed to load runs");
        }
        return response.json();
      })
      .then((data) => {
        const runList = Array.isArray(data) ? data : [];
        setRuns(runList);
        if (runList.length === 0) {
          setSelectedRunId(null);
          return;
        }
        const hasQueryRun = runList.some((run) => run.id === runIdFromQuery);
        if (hasQueryRun) {
          setSelectedRunId(runIdFromQuery);
        } else {
          setSelectedRunId(runList[0].id);
        }
      })
      .catch((err) => {
        setError(err.message);
        setRuns([]);
        setSelectedRunId(null);
      })
      .finally(() => setLoading(false));
  }, [location.search, testId]);

  useEffect(() => {
    if (!selectedRunId) {
      setRunSummary(null);
      setAnalysis(null);
      return;
    }

    setAnalysisLoading(true);
    setError(null);
    const parsedStep = Number(percentStep);
    const safeStep = Number.isFinite(parsedStep) && parsedStep >= 1 ? parsedStep : 5;

    Promise.all([
      fetch(`${API}/runs/${selectedRunId}/summary`),
      fetch(`${API}/runs/${selectedRunId}/analysis?percent_step=${safeStep}`),
    ])
      .then(async ([summaryRes, analysisRes]) => {
        if (!summaryRes.ok) {
          throw new Error("Failed to load run summary");
        }
        if (!analysisRes.ok) {
          throw new Error("Failed to load run analysis");
        }
        const summaryData = await summaryRes.json();
        const analysisData = await analysisRes.json();
        setRunSummary(summaryData);
        setAnalysis(analysisData);
      })
      .catch((err) => {
        setError(err.message);
        setRunSummary(null);
        setAnalysis(null);
      })
      .finally(() => setAnalysisLoading(false));
  }, [selectedRunId, percentStep]);

  const adaptivePlot = analysis?.plot || null;
  const axisCurves = analysis?.curves || null;
  const thresholdTable = analysis?.threshold_table || null;
  const warnings = analysis?.warnings || [];
  const analysisType = analysis?.analysis_type || null;

  return (
    <div className="visualization-container">
      <div className="visualization-header">
        <div className="header-top">
          <h4 className="visualization-title">Run Analysis</h4>
        </div>
      </div>

      <div className="visualization-content">
        {loading ? (
          <div className="loading-placeholder" />
        ) : error ? (
          <div className="error-message">Error: {error}</div>
        ) : runs.length === 0 ? (
          <p>No runs found for this test yet.</p>
        ) : (
          <>
            <div className="visualization-controls run-analysis-controls">
              <div className="control-group">
                <label>Run</label>
                <select
                  value={selectedRunId ?? ""}
                  onChange={(e) => setSelectedRunId(parseInt(e.target.value, 10))}
                >
                  {runs.map((run) => (
                    <option key={run.id} value={run.id}>
                      #{run.id} {run.name || "(unnamed)"} | {run.method} | {run.status}
                    </option>
                  ))}
                </select>
              </div>
              {(selectedRun?.method === "axis_logistic" ||
                selectedRun?.method === "axis_isotonic") && (
                <div className="control-group">
                  <label>Percent Step</label>
                  <input
                    type="number"
                    min="1"
                    max="50"
                    value={percentStep}
                    onChange={(e) => setPercentStep(e.target.value)}
                  />
                </div>
              )}
            </div>

            {runSummary && (
              <div className="run-summary">
                <h4>
                  Run #{runSummary.id} {runSummary.name ? `- ${runSummary.name}` : ""}
                </h4>
                <div className="summary-details">
                  <div>
                    <strong>Method:</strong> {runSummary.method}
                  </div>
                  <div>
                    <strong>Status:</strong> {runSummary.status}
                  </div>
                  <div>
                    <strong>Total trials:</strong> {runSummary.total_trials_count}
                  </div>
                  <div>
                    <strong>Pretest:</strong> {runSummary.pretest_trial_count}
                  </div>
                  <div>
                    <strong>Main:</strong> {runSummary.main_trials_count}
                  </div>
                  <div>
                    <strong>Axis:</strong> {runSummary.axis_trials_count ?? 0}
                  </div>
                </div>
              </div>
            )}

            {analysisLoading ? (
              <div className="loading-placeholder" />
            ) : (
              <>
                {(selectedRun?.method === "axis_logistic" ||
                  selectedRun?.method === "axis_isotonic") &&
                  axisCurves && (
                    <>
                      <AxisCurveChart title="Size Axis Curve" axisKey="size" curve={axisCurves.size} />
                      <AxisCurveChart
                        title="Saturation Axis Curve"
                        axisKey="saturation"
                        curve={axisCurves.saturation}
                      />

                      {thresholdTable && (
                        <div className="results-table-container">
                          <h4>Threshold Table ({thresholdTable.percent_step}% step)</h4>
                          <table className="results-table">
                            <thead>
                              <tr>
                                <th>Percent</th>
                                <th>Size Threshold</th>
                                <th>Saturation Threshold</th>
                              </tr>
                            </thead>
                            <tbody>
                              {thresholdTable.size.map((entry, index) => (
                                <tr key={entry.percent}>
                                  <td>{entry.percent}%</td>
                                  <td>
                                    {entry.value == null ? "N/A" : entry.value.toFixed(2)}
                                  </td>
                                  <td>
                                    {thresholdTable.saturation[index]?.value == null
                                      ? "N/A"
                                      : thresholdTable.saturation[index].value.toFixed(4)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </>
                  )}

                {analysisType === "adaptive_surface" && (
                  <div className="visualization-section">
                    <h4>Adaptive Surface</h4>
                    {adaptivePlot?.image ? (
                      <div className="visualization-image">
                        <img
                          src={`data:image/png;base64,${adaptivePlot.image}`}
                          alt="Run adaptive analysis"
                        />
                      </div>
                    ) : (
                      <p>No adaptive plot available for this run yet.</p>
                    )}
                    {adaptivePlot?.plot_data?.length > 0 && (
                      <div className="results-table-container">
                        <table className="results-table">
                          <thead>
                            <tr>
                              <th>Triangle Size</th>
                              <th>Saturation</th>
                            </tr>
                          </thead>
                          <tbody>
                            {adaptivePlot.plot_data.map((item) => (
                              <tr key={`${item.triangle_size}-${item.saturation}`}>
                                <td>{item.triangle_size}</td>
                                <td>{item.saturation.toFixed(5)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}

                {warnings.length > 0 && (
                  <div className="pretest-warnings">
                    <strong>Warnings:</strong>
                    <ul>
                      {warnings.map((warning, index) => (
                        <li key={index}>{warning}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default TestVisualization;
