"use client";

import React, { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import "../css/TestVisualization.css";

function TestVisualization() {
  const { testId } = useParams();
  const [plotUrl, setPlotUrl] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showRectangles, setShowRectangles] = useState(false);
  const [showPlot, setShowPlot] = useState(false);

  const fetchPlot = async (showRects) => {
    try {
      setLoading(true);
      const response = await fetch(
        `http://localhost:8000/api/tests/${testId}/plot?show_rectangles=${showRects}`
      );
      if (!response.ok) {
        throw new Error("Failed to fetch plot");
      }
      const blob = await response.blob();
      setPlotUrl(URL.createObjectURL(blob));
      setShowPlot(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPlot(showRectangles);
  }, [testId, showRectangles]);

  const handleDownloadPlot = () => {
    if (!plotUrl) return;
    const link = document.createElement("a");
    link.href = plotUrl;
    link.download = `test-${testId}-visualization.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDownloadCSV = async () => {
    try {
      const response = await fetch(
        `http://localhost:8000/api/test-combinations/${testId}/export-csv`
      );
      if (!response.ok) throw new Error("Failed to download CSV");
      const blob = await response.blob();
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

  if (error) return <div className="error-message">Error: {error}</div>;

  return (
    <div className="visualization-container">
      <div className="visualization-header">
        <div>
          <h4 className="visualization-title">Test Results</h4>
        </div>
        <div className="controls">
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
          <button
            className="visualization-btn"
            onClick={() => fetchPlot(showRectangles)}
            disabled={loading}
          >
            {loading ? "Loading..." : "Refresh"}
          </button>
          <button className="visualization-btn" onClick={handleDownloadCSV}>
            Download CSV
          </button>
          {showPlot && (
            <button className="visualization-btn" onClick={handleDownloadPlot}>
              Download Chart
            </button>
          )}
        </div>
      </div>

      <div className="visualization-content">
        {loading ? (
          <div className="loading-placeholder" />
        ) : (
          showPlot &&
          plotUrl && (
            <div className="visualization-image">
              <img src={plotUrl} alt="Test visualization" />
            </div>
          )
        )}
      </div>
    </div>
  );
}

export default TestVisualization;
