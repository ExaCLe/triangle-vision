import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import '../css/TestVisualization.css';

function TestVisualization() {
  const { testId } = useParams();
  const [plotUrl, setPlotUrl] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchPlot = async () => {
      try {
        const response = await fetch(`http://localhost:8000/tests/${testId}/plot`);
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

    fetchPlot();
  }, [testId]);

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
      <div className="plot-container">
        <img src={plotUrl} alt="Test visualization" />
      </div>
      <button className="download-button" onClick={handleDownload}>
        Download Plot
      </button>
    </div>
  );
}

export default TestVisualization;
