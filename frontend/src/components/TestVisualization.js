"use client";

import React, { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import "../css/TestVisualization.css";

function TestVisualization() {
  const { testId } = useParams();
  const [plotData, setPlotData] = useState([]);
  const [plotImage, setPlotImage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showRectangles, setShowRectangles] = useState(false);
  const [stepValue, setStepValue] = useState("10");
  const [thresholdValue, setThresholdValue] = useState("0.75");
  const [runs, setRuns] = useState([]);
  const [selectedRunId, setSelectedRunId] = useState(null);
  const [runSummary, setRunSummary] = useState(null);

  const fetchPlotData = async (showRects) => {
    try {
      setLoading(true);
      let url = `http://localhost:8000/api/tests/${testId}/plot?show_rectangles=${showRects}`;
      if (stepValue && !isNaN(stepValue)) {
        url += `&step=${stepValue}`;
      }
      if (thresholdValue && !isNaN(thresholdValue)) {
        url += `&threshold=${thresholdValue}`;
      }
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error("Failed to fetch plot data");
      }
      const data = await response.json();
      setPlotData(data.plot_data);
      setPlotImage(`data:image/png;base64,${data.image}`);
      setError(null);
    } catch (err) {
      setError(err.message);
      setPlotData([]);
      setPlotImage(null);
    } finally {
      setLoading(false);
    }
  };

  const fetchRuns = async () => {
    try {
      const response = await fetch(
        `http://localhost:8000/api/runs/test/${testId}`
      );
      if (response.ok) {
        const data = await response.json();
        setRuns(data);
      }
    } catch {
      // Runs endpoint may not exist yet; ignore
    }
  };

  const fetchRunSummary = async (runId) => {
    try {
      const response = await fetch(
        `http://localhost:8000/api/runs/${runId}/summary`
      );
      if (response.ok) {
        const data = await response.json();
        setRunSummary(data);
      }
    } catch {
      setRunSummary(null);
    }
  };

  useEffect(() => {
    fetchPlotData(showRectangles);
    fetchRuns();
  }, [testId, showRectangles, stepValue, thresholdValue]);

  useEffect(() => {
    if (selectedRunId) {
      fetchRunSummary(selectedRunId);
    } else {
      setRunSummary(null);
    }
  }, [selectedRunId]);

  const handleDownloadPlot = () => {
    if (!plotImage) return;
    const byteString = atob(plotImage.split(",")[1]);
    const mimeString = plotImage.split(",")[0].split(":")[1].split(";")[0];
    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);
    for (let i = 0; i < byteString.length; i++) {
      ia[i] = byteString.charCodeAt(i);
    }
    const blob = new Blob([ab], { type: mimeString });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `test-${testId}-visualization.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleDownloadCSV = async () => {
    try {
      const response = await fetch(
        `http://localhost:8000/api/test-combinations/${testId}/export-csv`
      );
      if (!response.ok) throw new Error("Failed to download CSV");
      const text = await response.text();
      const modifiedText = text.replace(/,/g, ";");
      const blob = new Blob([modifiedText], {
        type: "text/csv;charset=utf-8;",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `test-${testId}-results.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDownloadCombinationsCSV = () => {
    if (!plotData.length) return;

    const csvContent = [
      "Triangle Size;Saturation",
      ...plotData.map(
        (item) => `${item.triangle_size};${item.saturation.toFixed(5)}`
      ),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `test-${testId}-combinations.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="visualization-container">
      <div className="visualization-header">
        <div className="header-top">
          <h4 className="visualization-title">Test Results</h4>
          <div className="controls-container">
            <div className="visualization-controls">
              <div className="control-group">
                <label className="switch">
                  <input
                    type="checkbox"
                    checked={showRectangles}
                    onChange={(e) => setShowRectangles(e.target.checked)}
                  />
                  <span className="slider"></span>
                </label>
                <label>Show Rectangles</label>
              </div>
              <div className="control-group">
                <label>Step Size</label>
                <input
                  type="number"
                  value={stepValue}
                  onChange={(e) => setStepValue(e.target.value)}
                  min="1"
                  max="100"
                />
              </div>
              <div className="control-group">
                <label>Threshold Line</label>
                <input
                  type="number"
                  step="0.01"
                  value={thresholdValue}
                  onChange={(e) => setThresholdValue(e.target.value)}
                  min="0"
                  max="1"
                />
              </div>
            </div>

            <div className="action-buttons">
              <button
                className="visualization-btn"
                onClick={() => fetchPlotData(showRectangles)}
                disabled={loading}
              >
                {loading ? "Loading..." : "Refresh"}
              </button>
              <button
                className="visualization-btn"
                onClick={handleDownloadCSV}
                disabled={!plotData.length}
              >
                Download CSV
              </button>
              {plotImage && (
                <button
                  className="visualization-btn"
                  onClick={handleDownloadPlot}
                  disabled={!plotImage}
                >
                  Download Chart
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="visualization-content">
        {loading ? (
          <div className="loading-placeholder" />
        ) : error ? (
          <div className="error-message">Error: {error}</div>
        ) : (
          <>
            <div className="visualization-section">
              {plotImage && (
                <div className="visualization-image">
                  <img src={plotImage} alt="Test visualization" />
                </div>
              )}
            </div>

            {runs.length > 0 && (
              <div className="runs-section">
                <h3 className="table-title">Runs</h3>
                <div className="runs-list">
                  {runs.map((run) => (
                    <div
                      key={run.id}
                      className={`run-item ${selectedRunId === run.id ? "selected" : ""}`}
                      onClick={() =>
                        setSelectedRunId(
                          selectedRunId === run.id ? null : run.id
                        )
                      }
                    >
                      <span className="run-id">Run #{run.id}</span>
                      <span className={`run-status status-${run.status}`}>
                        {run.status}
                      </span>
                      <span className="run-mode">{run.pretest_mode}</span>
                    </div>
                  ))}
                </div>
                {runSummary && (
                  <div className="run-summary">
                    <h4>Run #{runSummary.id} Summary</h4>
                    <div className="summary-details">
                      <div>
                        <strong>Pretest trials:</strong>{" "}
                        {runSummary.pretest_trial_count}
                      </div>
                      <div>
                        <strong>Main trials:</strong>{" "}
                        {runSummary.main_trials_count}
                      </div>
                      <div>
                        <strong>Total trials:</strong>{" "}
                        {runSummary.total_trials_count}
                      </div>
                      {runSummary.pretest_bounds && (
                        <div className="pretest-bounds-info">
                          <strong>Pretest bounds:</strong>
                          <div>
                            Size: {runSummary.pretest_bounds.size_min?.toFixed(1)}{" "}
                            - {runSummary.pretest_bounds.size_max?.toFixed(1)}
                          </div>
                          <div>
                            Saturation:{" "}
                            {runSummary.pretest_bounds.saturation_min?.toFixed(3)}{" "}
                            -{" "}
                            {runSummary.pretest_bounds.saturation_max?.toFixed(3)}
                          </div>
                        </div>
                      )}
                      {runSummary.pretest_warnings &&
                        runSummary.pretest_warnings.length > 0 && (
                          <div className="pretest-warnings">
                            <strong>Warnings:</strong>
                            <ul>
                              {runSummary.pretest_warnings.map((w, i) => (
                                <li key={i}>{w}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="combinations-section">
              {plotData.length > 0 ? (
                <>
                  <div className="table-header">
                    <h3 className="table-title">
                      Triangle Size Saturation Combinations
                    </h3>
                    <button
                      className="visualization-btn"
                      onClick={handleDownloadCombinationsCSV}
                    >
                      Download CSV
                    </button>
                  </div>
                  <div className="results-table-container">
                    <table className="results-table">
                      <thead>
                        <tr>
                          <th className="w-[150px]">Triangle Size</th>
                          <th>Saturation</th>
                        </tr>
                      </thead>
                      <tbody>
                        {plotData.map((item) => (
                          <tr key={item.triangle_size}>
                            <td>{item.triangle_size}</td>
                            <td className="mono">
                              {item.saturation.toFixed(5)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : (
                <p>No matching data found.</p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default TestVisualization;
