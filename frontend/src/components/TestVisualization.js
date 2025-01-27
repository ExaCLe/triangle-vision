import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import '../css/TestVisualization.css';

function TestVisualization() {
  const { testId } = useParams();
  const [plotUrl, setPlotUrl] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showRectangles, setShowRectangles] = useState(false);  // Add state for toggle

  const fetchPlot = async (showRects) => {
    try {
      setLoading(true);
      const response = await fetch(
        `http://localhost:8000/tests/${testId}/plot?show_rectangles=${showRects}`
      );
      if (!response.ok) {
        throw new Error('Failed to fetch plot');
      }
      const blob = await response.blob();
      setPlotUrl(URL.createObjectURL(blob));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPlot(showRectangles);
  }, [testId, showRectangles]);  // Re-fetch when showRectangles changes

  const handleToggleRectangles = () => {
    setShowRectangles(!showRectangles);
  };

  const handleDownload = () => {
    const link = document.createElement('a');
    link.href = plotUrl;
    link.download = `test-${testId}-visualization.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (loading) return <div>Loading visualization...</div>;
  if (error) return <div>Error: {error}</div>;

  return (
    <div className="visualization-container">
      <h2>Test Visualization</h2>
      <div className="controls">
        <button 
          className="toggle-button" 
          onClick={handleToggleRectangles}
        >
          {showRectangles ? 'Hide Rectangles' : 'Show Rectangles'}
        </button>
        <button className="download-button" onClick={handleDownload}>
          Download Plot
        </button>
      </div>
      <div className="plot-container">
        <img src={plotUrl} alt="Test visualization" />
      </div>
    </div>
  );
}

export default TestVisualization;
