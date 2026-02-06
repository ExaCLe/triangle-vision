import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import "../css/StartRunModal.css";

function StartRunModal({ isOpen, onClose, test }) {
  const navigate = useNavigate();
  const [mode, setMode] = useState("run");
  const [manualBounds, setManualBounds] = useState({
    pretest_size_min: "",
    pretest_size_max: "",
    pretest_saturation_min: "",
    pretest_saturation_max: "",
  });
  const [lastRunBounds, setLastRunBounds] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (isOpen && test) {
      // Fetch last run bounds for "reuse_last" option
      fetch(`http://localhost:8000/api/runs/test/${test.id}`)
        .then((res) => res.json())
        .then((runs) => {
          const completedRun = runs.find(
            (r) =>
              (r.status === "main" || r.status === "completed") &&
              r.pretest_size_min !== null
          );
          if (completedRun) {
            setLastRunBounds({
              size_min: completedRun.pretest_size_min,
              size_max: completedRun.pretest_size_max,
              saturation_min: completedRun.pretest_saturation_min,
              saturation_max: completedRun.pretest_saturation_max,
            });
          } else {
            setLastRunBounds(null);
          }
        })
        .catch(() => setLastRunBounds(null));

      // Pre-fill manual bounds from test bounds
      setManualBounds({
        pretest_size_min: test.min_triangle_size,
        pretest_size_max: test.max_triangle_size,
        pretest_saturation_min: test.min_saturation,
        pretest_saturation_max: test.max_saturation,
      });
    }
  }, [isOpen, test]);

  const handleStart = async () => {
    if (!test) return;
    setLoading(true);
    setError(null);

    try {
      const body = {
        test_id: test.id,
        pretest_mode: mode,
      };

      if (mode === "manual") {
        body.pretest_size_min = parseFloat(manualBounds.pretest_size_min);
        body.pretest_size_max = parseFloat(manualBounds.pretest_size_max);
        body.pretest_saturation_min = parseFloat(
          manualBounds.pretest_saturation_min
        );
        body.pretest_saturation_max = parseFloat(
          manualBounds.pretest_saturation_max
        );
      }

      const response = await fetch("http://localhost:8000/api/runs/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.detail || "Failed to create run");
      }

      const run = await response.json();
      onClose();
      navigate(`/play-test/${test.id}/run/${run.id}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen || !test) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content start-run-modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>
          &times;
        </button>
        <div className="modal-header">
          <h2 className="modal-title">Start Run: {test.title}</h2>
          <p className="modal-description">
            Choose how to set up the search window for this run.
          </p>
        </div>

        <div className="run-mode-options">
          <label className="run-mode-option">
            <input
              type="radio"
              name="pretest_mode"
              value="run"
              checked={mode === "run"}
              onChange={() => setMode("run")}
            />
            <div className="run-mode-label">
              <strong>Run Pretest</strong>
              <span>
                Automatically find the performance transition zone through a
                cutting search.
              </span>
            </div>
          </label>

          <label
            className={`run-mode-option ${!lastRunBounds ? "disabled" : ""}`}
          >
            <input
              type="radio"
              name="pretest_mode"
              value="reuse_last"
              checked={mode === "reuse_last"}
              onChange={() => setMode("reuse_last")}
              disabled={!lastRunBounds}
            />
            <div className="run-mode-label">
              <strong>Reuse Last Pretest</strong>
              {lastRunBounds ? (
                <span className="bounds-preview">
                  Size: {lastRunBounds.size_min?.toFixed(1)} -{" "}
                  {lastRunBounds.size_max?.toFixed(1)}, Sat:{" "}
                  {lastRunBounds.saturation_min?.toFixed(3)} -{" "}
                  {lastRunBounds.saturation_max?.toFixed(3)}
                </span>
              ) : (
                <span>No previous pretest bounds available.</span>
              )}
            </div>
          </label>

          <label className="run-mode-option">
            <input
              type="radio"
              name="pretest_mode"
              value="manual"
              checked={mode === "manual"}
              onChange={() => setMode("manual")}
            />
            <div className="run-mode-label">
              <strong>Manual Bounds</strong>
              <span>Specify the search window manually.</span>
            </div>
          </label>
        </div>

        {mode === "manual" && (
          <div className="manual-bounds-form">
            <div className="bounds-row">
              <div className="bounds-field">
                <label>Size Min</label>
                <input
                  type="number"
                  value={manualBounds.pretest_size_min}
                  onChange={(e) =>
                    setManualBounds({
                      ...manualBounds,
                      pretest_size_min: e.target.value,
                    })
                  }
                />
              </div>
              <div className="bounds-field">
                <label>Size Max</label>
                <input
                  type="number"
                  value={manualBounds.pretest_size_max}
                  onChange={(e) =>
                    setManualBounds({
                      ...manualBounds,
                      pretest_size_max: e.target.value,
                    })
                  }
                />
              </div>
            </div>
            <div className="bounds-row">
              <div className="bounds-field">
                <label>Saturation Min</label>
                <input
                  type="number"
                  step="0.01"
                  value={manualBounds.pretest_saturation_min}
                  onChange={(e) =>
                    setManualBounds({
                      ...manualBounds,
                      pretest_saturation_min: e.target.value,
                    })
                  }
                />
              </div>
              <div className="bounds-field">
                <label>Saturation Max</label>
                <input
                  type="number"
                  step="0.01"
                  value={manualBounds.pretest_saturation_max}
                  onChange={(e) =>
                    setManualBounds({
                      ...manualBounds,
                      pretest_saturation_max: e.target.value,
                    })
                  }
                />
              </div>
            </div>
          </div>
        )}

        {error && <p className="error-message">{error}</p>}

        <div className="modal-actions">
          <button className="btn btn-outline" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            onClick={handleStart}
            disabled={loading}
          >
            {loading ? "Starting..." : "Start Run"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default StartRunModal;
