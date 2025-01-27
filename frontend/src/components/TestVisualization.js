import React, { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import "../css/TestVisualization.css";

function TestVisualization() {
  const { testId } = useParams();
  const [plotUrl, setPlotUrl] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showRectangles, setShowRectangles] = useState(false); // Add state for toggle
  const [showPlot, setShowPlot] = useState(false);

  const fetchPlot = async (showRects) => {
    try {
      setLoading(true);
      const response = await fetch(
        `http://localhost:8000/tests/${testId}/plot?show_rectangles=${showRects}`
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
  }, [testId, showRectangles]); // Re-fetch when showRectangles changes

  const handleToggleRectangles = () => {
    setShowRectangles(!showRectangles);
  };

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
        `http://localhost:8000/test-combinations/${testId}/export-csv`
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

  if (loading) return <div>Loading visualization...</div>;
  if (error) return <div>Error: {error}</div>;

  return (
    <div className="visualization-container">
      <h2>Test Results</h2>

      <div className="controls">
        <div className="visualization-options">
          <label>
            <input
              type="checkbox"
              checked={showRectangles}
              onChange={(e) => setShowRectangles(e.target.checked)}
            />
            Include rectangles in visualization
          </label>
        </div>

        <div className="download-options">
          <button onClick={handleDownloadCSV}>Download Results (CSV)</button>

          {!showPlot ? (
            <button onClick={() => fetchPlot(showRectangles)}>
              Show Visualization
            </button>
          ) : (
            <button onClick={handleDownloadPlot}>Download Visualization</button>
          )}
        </div>
      </div>

      {loading && <div>Loading visualization...</div>}

      {showPlot && plotUrl && (
        <div className="plot-container">
          <img src={plotUrl} alt="Test visualization" />
        </div>
      )}
    </div>
  );
}

export default TestVisualization;
