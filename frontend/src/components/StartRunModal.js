import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import "../css/StartRunModal.css";

const hasBounds = (candidate) =>
  Boolean(
    candidate &&
      candidate.min_triangle_size !== null &&
      candidate.min_triangle_size !== undefined &&
      candidate.max_triangle_size !== null &&
      candidate.max_triangle_size !== undefined &&
      candidate.min_saturation !== null &&
      candidate.min_saturation !== undefined &&
      candidate.max_saturation !== null &&
      candidate.max_saturation !== undefined
  );

function StartRunModal({ isOpen, onClose, test, onRunCreated }) {
  const navigate = useNavigate();
  const [mode, setMode] = useState("run");
  const [manualBounds, setManualBounds] = useState({
    pretest_size_min: "",
    pretest_size_max: "",
    pretest_saturation_min: "",
    pretest_saturation_max: "",
  });
  const [lastRunBounds, setLastRunBounds] = useState(null);
  const [sourceTests, setSourceTests] = useState([]);
  const [reuseTestId, setReuseTestId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const autoStartAttemptedRef = useRef(false);
  const reuseCandidates =
    sourceTests.length > 0 ? sourceTests : test ? [test] : [];
  const selectedSourceTest = reuseCandidates.find(
    (candidate) => candidate.id === (reuseTestId ?? test?.id)
  );
  const storedSourceBounds = hasBounds(selectedSourceTest)
    ? {
        size_min: selectedSourceTest.min_triangle_size,
        size_max: selectedSourceTest.max_triangle_size,
        saturation_min: selectedSourceTest.min_saturation,
        saturation_max: selectedSourceTest.max_saturation,
      }
    : null;
  const reusableBounds = lastRunBounds || storedSourceBounds;
  const canReuse = Boolean(reusableBounds);

  const startRun = async (selectedMode, selectedReuseTestId) => {
    if (!test) return;
    setLoading(true);
    setError(null);

    try {
      const body = {
        test_id: test.id,
        pretest_mode: selectedMode,
      };

      if (selectedMode === "manual") {
        const parsedBounds = {
          pretest_size_min: parseFloat(manualBounds.pretest_size_min),
          pretest_size_max: parseFloat(manualBounds.pretest_size_max),
          pretest_saturation_min: parseFloat(manualBounds.pretest_saturation_min),
          pretest_saturation_max: parseFloat(manualBounds.pretest_saturation_max),
        };
        const hasNaN = Object.values(parsedBounds).some((v) => Number.isNaN(v));
        if (hasNaN) {
          throw new Error("Please enter all four manual bounds.");
        }
        if (parsedBounds.pretest_size_min > parsedBounds.pretest_size_max) {
          throw new Error("Size Min must be less than or equal to Size Max.");
        }
        if (
          parsedBounds.pretest_saturation_min >
          parsedBounds.pretest_saturation_max
        ) {
          throw new Error(
            "Saturation Min must be less than or equal to Saturation Max."
          );
        }
        Object.assign(body, parsedBounds);
      }

      if (selectedMode === "reuse_last") {
        body.reuse_test_id = selectedReuseTestId ?? test.id;
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
      if (onRunCreated) {
        onRunCreated(run);
      }
      onClose();
      navigate(`/play-test/${test.id}/run/${run.id}`);
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && test) {
      setMode("run");
      setError(null);
      setReuseTestId(test.id);
      setLastRunBounds(null);

      Promise.all([
        fetch("http://localhost:8000/api/tests/").then((res) =>
          res.ok ? res.json() : []
        ),
        fetch("http://localhost:8000/api/settings/pretest").then((res) =>
          res.ok ? res.json() : null
        ),
      ])
        .then(([tests, settings]) => {
          const testsList = Array.isArray(tests) ? tests : [];
          setSourceTests(testsList);
          const limits = settings?.global_limits || {};
          setManualBounds({
            pretest_size_min:
              test.min_triangle_size ?? limits.min_triangle_size ?? "",
            pretest_size_max:
              test.max_triangle_size ?? limits.max_triangle_size ?? "",
            pretest_saturation_min:
              test.min_saturation ?? limits.min_saturation ?? "",
            pretest_saturation_max:
              test.max_saturation ?? limits.max_saturation ?? "",
          });
          if (hasBounds(test)) {
            setMode("reuse_last");
          }
        })
        .catch(() => {
          setSourceTests([]);
          setManualBounds({
            pretest_size_min: test.min_triangle_size ?? "",
            pretest_size_max: test.max_triangle_size ?? "",
            pretest_saturation_min: test.min_saturation ?? "",
            pretest_saturation_max: test.max_saturation ?? "",
          });
          if (hasBounds(test)) {
            setMode("reuse_last");
          }
        });
    }
  }, [isOpen, test]);

  useEffect(() => {
    autoStartAttemptedRef.current = false;
  }, [isOpen, test?.id]);

  useEffect(() => {
    if (!isOpen || reuseTestId === null || reuseTestId === undefined) return;
    setLastRunBounds(null);

    fetch(`http://localhost:8000/api/runs/test/${reuseTestId}`)
      .then((res) => (res.ok ? res.json() : []))
      .then((runs) => {
        const completedRun = runs.find(
          (r) =>
            (r.status === "main" || r.status === "completed") &&
            r.pretest_size_min !== null &&
            r.pretest_size_max !== null &&
            r.pretest_saturation_min !== null &&
            r.pretest_saturation_max !== null
        );
        if (completedRun) {
          setLastRunBounds({
            size_min: completedRun.pretest_size_min,
            size_max: completedRun.pretest_size_max,
            saturation_min: completedRun.pretest_saturation_min,
            saturation_max: completedRun.pretest_saturation_max,
          });
          if (reuseTestId === test?.id) {
            setMode((previousMode) =>
              previousMode === "run" ? "reuse_last" : previousMode
            );
          }
        } else {
          setLastRunBounds(null);
        }
      })
      .catch(() => setLastRunBounds(null));
  }, [isOpen, reuseTestId, test?.id]);

  useEffect(() => {
    if (!isOpen || !test || autoStartAttemptedRef.current) return;
    const hasOwnSavedBounds = hasBounds(test);
    const hasOwnLastRunBounds =
      Boolean(lastRunBounds) && (reuseTestId ?? test.id) === test.id;
    if (!hasOwnSavedBounds && !hasOwnLastRunBounds) return;

    autoStartAttemptedRef.current = true;
    startRun("reuse_last", test.id).catch(() => {
      autoStartAttemptedRef.current = false;
    });
  }, [isOpen, test, lastRunBounds, reuseTestId]);

  const handleStart = async () => {
    await startRun(mode, reuseTestId ?? test?.id);
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

          <label className="run-mode-option">
            <input
              type="radio"
              name="pretest_mode"
              value="reuse_last"
              checked={mode === "reuse_last"}
              onChange={() => setMode("reuse_last")}
            />
            <div className="run-mode-label">
              <strong>Reuse Last Pretest</strong>
              <span>
                Reuse the latest completed pretest bounds from another test.
              </span>
              <select
                value={reuseTestId ?? test.id}
                onChange={(e) => setReuseTestId(parseInt(e.target.value, 10))}
                className="form-input"
              >
                {reuseCandidates.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.title}
                  </option>
                ))}
              </select>
              {reusableBounds ? (
                <span className="bounds-preview">
                  Size: {reusableBounds.size_min?.toFixed(1)} -{" "}
                  {reusableBounds.size_max?.toFixed(1)}, Sat:{" "}
                  {reusableBounds.saturation_min?.toFixed(3)} -{" "}
                  {reusableBounds.saturation_max?.toFixed(3)}
                </span>
              ) : (
                <span>No reusable pretest bounds available for this source test.</span>
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
            disabled={loading || (mode === "reuse_last" && !canReuse)}
          >
            {loading ? "Starting..." : "Start Run"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default StartRunModal;
