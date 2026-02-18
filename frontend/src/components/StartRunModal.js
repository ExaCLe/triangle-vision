import { useEffect, useMemo, useState } from "react";
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
  const [entryMode, setEntryMode] = useState("create");
  const [runName, setRunName] = useState("");
  const [method, setMethod] = useState("adaptive_rectangles");
  const [axisSwitchPolicy, setAxisSwitchPolicy] = useState("uncertainty");
  const [adaptiveMode, setAdaptiveMode] = useState("run");
  const [manualBounds, setManualBounds] = useState({
    pretest_size_min: "",
    pretest_size_max: "",
    pretest_saturation_min: "",
    pretest_saturation_max: "",
  });
  const [sourceTests, setSourceTests] = useState([]);
  const [reuseTestId, setReuseTestId] = useState(null);
  const [lastRunBounds, setLastRunBounds] = useState(null);
  const [existingRuns, setExistingRuns] = useState([]);
  const [selectedRunId, setSelectedRunId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

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

  const canContinue = existingRuns.length > 0 && selectedRunId != null;
  const selectedRun = useMemo(
    () => existingRuns.find((run) => run.id === selectedRunId),
    [existingRuns, selectedRunId]
  );

  useEffect(() => {
    if (!isOpen || !test) return;
    setError(null);
    setLoading(false);
    setEntryMode("create");
    setRunName(`${test.title} run`);
    setMethod("adaptive_rectangles");
    setAxisSwitchPolicy("uncertainty");
    setAdaptiveMode("run");
    setReuseTestId(test.id);
    setLastRunBounds(null);
    setExistingRuns([]);
    setSelectedRunId(null);

    Promise.all([
      fetch("http://localhost:8000/api/tests/").then((res) =>
        res.ok ? res.json() : []
      ),
      fetch("http://localhost:8000/api/settings/pretest").then((res) =>
        res.ok ? res.json() : null
      ),
      fetch(`http://localhost:8000/api/runs/test/${test.id}`).then((res) =>
        res.ok ? res.json() : []
      ),
    ])
      .then(([tests, settings, runs]) => {
        const testsList = Array.isArray(tests) ? tests : [];
        const runList = Array.isArray(runs) ? runs : [];
        setSourceTests(testsList);
        setExistingRuns(runList);
        if (runList.length > 0) {
          setSelectedRunId(runList[0].id);
        }

        const limits = settings?.global_limits || {};
        setManualBounds({
          pretest_size_min: test.min_triangle_size ?? limits.min_triangle_size ?? "",
          pretest_size_max: test.max_triangle_size ?? limits.max_triangle_size ?? "",
          pretest_saturation_min:
            test.min_saturation ?? limits.min_saturation ?? "",
          pretest_saturation_max:
            test.max_saturation ?? limits.max_saturation ?? "",
        });
      })
      .catch(() => {
        setSourceTests([]);
        setExistingRuns([]);
        setManualBounds({
          pretest_size_min: test.min_triangle_size ?? "",
          pretest_size_max: test.max_triangle_size ?? "",
          pretest_saturation_min: test.min_saturation ?? "",
          pretest_saturation_max: test.max_saturation ?? "",
        });
      });
  }, [isOpen, test]);

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
        } else {
          setLastRunBounds(null);
        }
      })
      .catch(() => setLastRunBounds(null));
  }, [isOpen, reuseTestId]);

  const startNewRun = async () => {
    if (!test) return;
    const trimmedName = runName.trim();
    if (!trimmedName) {
      setError("Please enter a run name.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const body = {
        test_id: test.id,
        name: trimmedName,
        method,
      };

      if (method === "adaptive_rectangles") {
        body.pretest_mode = adaptiveMode;
        if (adaptiveMode === "manual") {
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
        if (adaptiveMode === "reuse_last") {
          body.reuse_test_id = reuseTestId ?? test.id;
        }
      } else {
        body.axis_switch_policy = axisSwitchPolicy;
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
    } finally {
      setLoading(false);
    }
  };

  const continueRun = () => {
    if (!test || !selectedRunId) return;
    onClose();
    navigate(`/play-test/${test.id}/run/${selectedRunId}`);
  };

  const handlePrimaryAction = async () => {
    if (entryMode === "continue") {
      continueRun();
      return;
    }
    await startNewRun();
  };

  if (!isOpen || !test) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content start-run-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <button className="modal-close" onClick={onClose}>
          &times;
        </button>
        <div className="modal-header">
          <h2 className="modal-title">Run Setup: {test.title}</h2>
          <p className="modal-description">
            Continue an existing run or create a new run with a fixed method.
          </p>
        </div>

        <div className="entry-mode-switch">
          <label className="run-mode-option">
            <input
              type="radio"
              name="entry_mode"
              value="continue"
              checked={entryMode === "continue"}
              onChange={() => setEntryMode("continue")}
            />
            <div className="run-mode-label">
              <strong>Continue Existing Run</strong>
              <span>Select one of this test's runs and continue it.</span>
            </div>
          </label>
          <label className="run-mode-option">
            <input
              type="radio"
              name="entry_mode"
              value="create"
              checked={entryMode === "create"}
              onChange={() => setEntryMode("create")}
            />
            <div className="run-mode-label">
              <strong>Create New Run</strong>
              <span>Define run name and methodology for a new run.</span>
            </div>
          </label>
        </div>

        {entryMode === "continue" && (
          <div className="run-config-section">
            <label className="config-label">Existing Run</label>
            {existingRuns.length > 0 ? (
              <select
                value={selectedRunId ?? ""}
                onChange={(e) => setSelectedRunId(parseInt(e.target.value, 10))}
                className="form-input"
              >
                {existingRuns.map((run) => (
                  <option key={run.id} value={run.id}>
                    #{run.id} {run.name || "(unnamed)"} | {run.method} | {run.status}
                  </option>
                ))}
              </select>
            ) : (
              <div className="empty-run-note">No runs available to continue.</div>
            )}
            {selectedRun && (
              <div className="bounds-preview">
                Method: {selectedRun.method} | Status: {selectedRun.status}
              </div>
            )}
          </div>
        )}

        {entryMode === "create" && (
          <>
            <div className="run-config-section">
              <label className="config-label">Run Name</label>
              <input
                type="text"
                value={runName}
                onChange={(e) => setRunName(e.target.value)}
                className="form-input"
                placeholder="Enter unique run name"
              />
            </div>

            <div className="run-mode-options">
              <label className="run-mode-option">
                <input
                  type="radio"
                  name="run_method"
                  value="adaptive_rectangles"
                  checked={method === "adaptive_rectangles"}
                  onChange={() => setMethod("adaptive_rectangles")}
                />
                <div className="run-mode-label">
                  <strong>Adaptive Rectangles</strong>
                  <span>Current rectangle-based method (with pretest options).</span>
                </div>
              </label>

              <label className="run-mode-option">
                <input
                  type="radio"
                  name="run_method"
                  value="axis_logistic"
                  checked={method === "axis_logistic"}
                  onChange={() => setMethod("axis_logistic")}
                />
                <div className="run-mode-label">
                  <strong>Axis Logistic</strong>
                  <span>1D axis sampling with logistic psychometric fitting.</span>
                </div>
              </label>

              <label className="run-mode-option">
                <input
                  type="radio"
                  name="run_method"
                  value="axis_isotonic"
                  checked={method === "axis_isotonic"}
                  onChange={() => setMethod("axis_isotonic")}
                />
                <div className="run-mode-label">
                  <strong>Axis Isotonic</strong>
                  <span>1D axis sampling with monotone isotonic fitting.</span>
                </div>
              </label>
            </div>

            {method === "adaptive_rectangles" && (
              <>
                <div className="run-config-section">
                  <label className="config-label">Adaptive Setup</label>
                  <div className="run-mode-options">
                    <label className="run-mode-option">
                      <input
                        type="radio"
                        name="adaptive_setup"
                        value="run"
                        checked={adaptiveMode === "run"}
                        onChange={() => setAdaptiveMode("run")}
                      />
                      <div className="run-mode-label">
                        <strong>Run Pretest</strong>
                        <span>Run cutting pretest then continue to main phase.</span>
                      </div>
                    </label>
                    <label className="run-mode-option">
                      <input
                        type="radio"
                        name="adaptive_setup"
                        value="reuse_last"
                        checked={adaptiveMode === "reuse_last"}
                        onChange={() => setAdaptiveMode("reuse_last")}
                      />
                      <div className="run-mode-label">
                        <strong>Reuse Last Pretest</strong>
                        <span>Reuse pretest bounds from another test.</span>
                        <select
                          value={reuseTestId ?? test.id}
                          onChange={(e) =>
                            setReuseTestId(parseInt(e.target.value, 10))
                          }
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
                          <span>
                            No reusable pretest bounds available for this source test.
                          </span>
                        )}
                      </div>
                    </label>
                    <label className="run-mode-option">
                      <input
                        type="radio"
                        name="adaptive_setup"
                        value="manual"
                        checked={adaptiveMode === "manual"}
                        onChange={() => setAdaptiveMode("manual")}
                      />
                      <div className="run-mode-label">
                        <strong>Manual Bounds</strong>
                        <span>Specify search bounds manually.</span>
                      </div>
                    </label>
                  </div>
                </div>

                {adaptiveMode === "manual" && (
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
              </>
            )}

            {method !== "adaptive_rectangles" && (
              <div className="run-config-section">
                <label className="config-label">Axis Switch Policy</label>
                <select
                  value={axisSwitchPolicy}
                  onChange={(e) => setAxisSwitchPolicy(e.target.value)}
                  className="form-input"
                >
                  <option value="uncertainty">Uncertainty-first</option>
                  <option value="alternate">Alternate axes</option>
                </select>
              </div>
            )}
          </>
        )}

        {error && <p className="error-message">{error}</p>}

        <div className="modal-actions">
          <button className="btn btn-outline" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            onClick={handlePrimaryAction}
            disabled={
              loading ||
              (entryMode === "continue" && !canContinue) ||
              (entryMode === "create" &&
                method === "adaptive_rectangles" &&
                adaptiveMode === "reuse_last" &&
                !canReuse)
            }
          >
            {loading
              ? "Working..."
              : entryMode === "continue"
              ? "Continue Run"
              : "Create Run"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default StartRunModal;
