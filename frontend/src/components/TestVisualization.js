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
  const [stepValue, setStepValue] = useState("10"); // new state for step size
  const [thresholdValue, setThresholdValue] = useState("0.75"); // new state for threshold line

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

  useEffect(() => {
    fetchPlotData(showRectangles);
  }, [testId, showRectangles, stepValue, thresholdValue]);

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
          {/* New control for step size */}
          <div className="control-group">
            <label>Step Size:</label>
            <input
              type="number"
              value={stepValue}
              onChange={(e) => setStepValue(e.target.value)}
              style={{ width: "60px", marginLeft: "5px" }}
            />
          </div>
          {/* New control for threshold line */}
          <div className="control-group">
            <label>Threshold Line:</label>
            <input
              type="number"
              step="0.01"
              value={thresholdValue}
              onChange={(e) => setThresholdValue(e.target.value)}
              style={{ width: "60px", marginLeft: "5px" }}
            />
          </div>
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

      <div className="visualization-content">
        {loading ? (
          <div className="loading-placeholder" />
        ) : error ? (
          <div className="error-message">Error: {error}</div>
        ) : (
          <>
            {plotImage && (
              <div className="visualization-image">
                <img src={plotImage} alt="Test visualization" />
              </div>
            )}
            <div className="plot-data">
              {plotData.length > 0 ? (
                <ul>
                  {plotData.map((item, index) => (
                    <li key={index}>
                      Triangle Size: {item.triangle_size}, Saturation:{" "}
                      {item.saturation}
                    </li>
                  ))}
                </ul>
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
