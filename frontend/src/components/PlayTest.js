import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { useTheme } from "../context/ThemeContext";
import Content from "./Content";
import { applyOrientationFlip, orientationFromArrowKey } from "../helpers";
import { normalizePretestSettings } from "../pretestSettings";
import "../css/PlayTest.css";

function PlayTest() {
  const { testId, runId } = useParams();
  const [currentTest, setCurrentTest] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [startTime, setStartTime] = useState(null);
  const { theme } = useTheme();
  const [totalSamples, setTotalSamples] = useState(0);
  const [currentPhase, setCurrentPhase] = useState("main");
  const [debugEnabled, setDebugEnabled] = useState(true);
  const [debugVisible, setDebugVisible] = useState(true);
  const [debugData, setDebugData] = useState(null);
  const [debugError, setDebugError] = useState(null);
  const [debugLoading, setDebugLoading] = useState(false);
  const [debugDetail, setDebugDetail] = useState("detailed");
  const [displaySettings, setDisplaySettings] = useState(
    normalizePretestSettings().display
  );
  const [stimulusPhase, setStimulusPhase] = useState("stimulus");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [didInitialFetch, setDidInitialFetch] = useState(false);
  const waitTimeoutRef = useRef(null);

  // Simulation mode state
  const [simulationEnabled, setSimulationEnabled] = useState(false);
  const [simulationModels, setSimulationModels] = useState([]);
  const [selectedModel, setSelectedModel] = useState("default");
  const [isSimulating, setIsSimulating] = useState(false);
  const [simulationLog, setSimulationLog] = useState(null);
  const [simHeatmap, setSimHeatmap] = useState(null);
  const [simTrialMarkers, setSimTrialMarkers] = useState([]);
  const [simGlobalBounds, setSimGlobalBounds] = useState(null);

  const waitFor = useCallback((durationMs) =>
    new Promise((resolve) => {
      const ms = Math.max(0, Number(durationMs) || 0);
      if (ms === 0) {
        resolve();
        return;
      }
      if (waitTimeoutRef.current) {
        window.clearTimeout(waitTimeoutRef.current);
      }
      waitTimeoutRef.current = window.setTimeout(() => {
        waitTimeoutRef.current = null;
        resolve();
      }, ms);
    }), []);

  const hslToRgb = (h, s, l) => {
    s /= 100;
    l /= 100;

    if (s === 0) {
      const v = Math.round(l * 255);
      return `rgb(${v}, ${v}, ${v})`;
    }

    const k = (n) => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = (n) =>
      l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));

    const r = Math.round(255 * f(0));
    const g = Math.round(255 * f(8));
    const b = Math.round(255 * f(4));

    return `rgb(${r}, ${g}, ${b})`;
  };

  const formatNumber = (value, maxFractionDigits = 2) => {
    if (value === null || value === undefined || Number.isNaN(value)) {
      return "N/A";
    }
    return new Intl.NumberFormat("en-US", {
      maximumFractionDigits: maxFractionDigits,
    }).format(value);
  };

  const formatPercent = (value) => {
    if (value === null || value === undefined || Number.isNaN(value)) {
      return "N/A";
    }
    return `${(value * 100).toFixed(1)}%`;
  };

  const formatBounds = (bounds, sizeDigits = 1, satDigits = 3) => {
    if (!bounds) return "N/A";
    return `${formatNumber(bounds.size_min, sizeDigits)} - ${formatNumber(
      bounds.size_max,
      sizeDigits
    )} | sat ${formatNumber(bounds.saturation_min, satDigits)} - ${formatNumber(
      bounds.saturation_max,
      satDigits
    )}`;
  };

  const formatTimestamp = (value) => {
    if (!value) return "N/A";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "N/A";
    return date.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  const fetchNextCombination = useCallback(async (applyResult = true) => {
    try {
      let url;
      if (runId) {
        url = `http://localhost:8000/api/runs/${runId}/next`;
      } else {
        url = `http://localhost:8000/api/test-combinations/next/${testId}`;
      }
      const response = await fetch(url);
      if (!response.ok) {
        if (applyResult) {
          setCurrentTest(null);
          setStartTime(null);
          setDidInitialFetch(true);
        }
        return null;
      }
      const data = await response.json();
      if (!data || !data.orientation) {
        if (applyResult) {
          setCurrentTest(null);
          setStartTime(null);
          setDidInitialFetch(true);
        }
        return null;
      }
      if (applyResult) {
        setCurrentTest(data);
        setStartTime(Date.now());
        setTotalSamples(data.total_samples ?? 0);
        if (data.phase) {
          setCurrentPhase(data.phase);
        }
        setDidInitialFetch(true);
      }
      return data;
    } catch (error) {
      console.error("Error fetching next combination:", error);
      if (applyResult) {
        setDidInitialFetch(true);
      }
      return null;
    }
  }, [runId, testId]);

  const fetchDebugInfo = useCallback(async () => {
    if (!debugEnabled || !debugVisible) return;
    setDebugLoading(true);
    setDebugError(null);
    try {
      const url = runId
        ? `http://localhost:8000/api/runs/${runId}/debug`
        : `http://localhost:8000/api/tests/${testId}/debug`;
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error("Failed to fetch debug info");
      }
      const data = await response.json();
      setDebugData(data);
    } catch (error) {
      console.error("Error fetching debug info:", error);
      setDebugError("Debug info unavailable");
    } finally {
      setDebugLoading(false);
    }
  }, [debugEnabled, debugVisible, runId, testId]);

  const submitResult = useCallback(async (success) => {
    if (!currentTest || isSubmitting || stimulusPhase !== "stimulus") return;
    const answerTime = startTime ? Date.now() - startTime : 0;
    const maskDuration = displaySettings?.masking?.duration_ms ?? 0;
    const einkEnabled = Boolean(displaySettings?.eink?.enabled);
    const einkFlashDuration = displaySettings?.eink?.flash_duration_ms ?? 0;

    try {
      setIsSubmitting(true);
      setFeedback({
        correct: success,
        time: answerTime,
      });
      setStimulusPhase("mask");

      if (runId) {
        const response = await fetch(`http://localhost:8000/api/runs/${runId}/result`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            triangle_size: currentTest.triangle_size,
            saturation: currentTest.saturation,
            orientation: currentTest.orientation,
            success: success ? 1 : 0,
          }),
        });
        if (!response.ok) {
          throw new Error("Failed to submit run result");
        }
      } else {
        const response = await fetch("http://localhost:8000/api/test-combinations/result", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...currentTest,
            success: success ? 1 : 0,
          }),
        });
        if (!response.ok) {
          throw new Error("Failed to submit test combination result");
        }
      }

      const nextTrialPromise = fetchNextCombination(false);

      await waitFor(maskDuration);

      if (einkEnabled) {
        setStimulusPhase("eink");
        await waitFor(einkFlashDuration);
      }

      const nextTrial = await nextTrialPromise;
      if (nextTrial) {
        setCurrentTest(nextTrial);
        setStartTime(Date.now());
        setTotalSamples(nextTrial.total_samples ?? 0);
        if (nextTrial.phase) {
          setCurrentPhase(nextTrial.phase);
        }
      } else {
        setCurrentTest(null);
        setStartTime(null);
      }
      setDidInitialFetch(true);
      setStimulusPhase("stimulus");
      if (debugVisible) {
        await fetchDebugInfo();
      }

      setTimeout(() => {
        setFeedback(null);
      }, 500);
    } catch (error) {
      console.error("Error submitting result:", error);
      setStimulusPhase("stimulus");
    } finally {
      setIsSubmitting(false);
    }
  }, [
    currentTest,
    debugVisible,
    displaySettings,
    fetchDebugInfo,
    fetchNextCombination,
    isSubmitting,
    runId,
    startTime,
    stimulusPhase,
    waitFor,
  ]);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const response = await fetch(
          "http://localhost:8000/api/settings/pretest"
        );
        if (!response.ok) return;
        const data = await response.json();
        const normalized = normalizePretestSettings(data);
        const enabled = normalized.debug.enabled;
        setDebugEnabled(enabled);
        setDisplaySettings(normalized.display);
        setSimulationEnabled(normalized.simulation?.enabled ?? false);
        setSimGlobalBounds({
          min_triangle_size: data.global_limits?.min_triangle_size ?? 10,
          max_triangle_size: data.global_limits?.max_triangle_size ?? 400,
          min_saturation: data.global_limits?.min_saturation ?? 0,
          max_saturation: data.global_limits?.max_saturation ?? 1,
        });
        if (!enabled) {
          setDebugVisible(false);
        }
      } catch (error) {
        console.error("Error fetching settings:", error);
      }
    };

    const fetchModels = async () => {
      try {
        const response = await fetch(
          "http://localhost:8000/api/settings/simulation-models"
        );
        if (!response.ok) return;
        const data = await response.json();
        setSimulationModels(data);
        if (data.length > 0) {
          setSelectedModel((prev) =>
            data.find((m) => m.name === prev) ? prev : data[0].name
          );
        }
      } catch (error) {
        console.error("Error fetching simulation models:", error);
      }
    };

    fetchSettings();
    fetchModels();
  }, []);

  // Fetch simulation heatmap when model or global bounds change
  useEffect(() => {
    if (!simulationEnabled || !selectedModel || !simGlobalBounds) return;
    const b = simGlobalBounds;
    const steps = 60;
    const url =
      `http://localhost:8000/api/settings/simulation-models/${encodeURIComponent(selectedModel)}/heatmap` +
      `?steps=${steps}&min_triangle_size=${b.min_triangle_size}&max_triangle_size=${b.max_triangle_size}` +
      `&min_saturation=${b.min_saturation}&max_saturation=${b.max_saturation}`;
    fetch(url)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setSimHeatmap(data))
      .catch(() => setSimHeatmap(null));
    setSimTrialMarkers([]);
  }, [simulationEnabled, selectedModel, simGlobalBounds]);

  useEffect(() => {
    setDidInitialFetch(false);
    setStimulusPhase("stimulus");
    fetchNextCombination();
  }, [fetchNextCombination]);

  useEffect(() => {
    if (debugVisible) {
      fetchDebugInfo();
    }
  }, [debugVisible, fetchDebugInfo]);

  const handleKeyPress = useCallback((event) => {
    const keyOrientation = orientationFromArrowKey(event.key);
    if (keyOrientation) {
      event.preventDefault();
    }

    if (!keyOrientation) return;
    if (!currentTest || stimulusPhase !== "stimulus" || isSubmitting) return;

    const expectedOrientation = applyOrientationFlip(
      currentTest.orientation,
      displaySettings?.flip
    );
    const success = keyOrientation === expectedOrientation;

    submitResult(success);
  }, [currentTest, displaySettings, isSubmitting, stimulusPhase, submitResult]);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyPress);
    return () => window.removeEventListener("keydown", handleKeyPress);
  }, [handleKeyPress]);

  useEffect(() => {
    return () => {
      if (waitTimeoutRef.current) {
        window.clearTimeout(waitTimeoutRef.current);
      }
    };
  }, []);

  // ---- Simulation helpers ------------------------------------------------
  const runSimulation = useCallback(async (count) => {
    if (!runId || isSimulating) return;
    setIsSimulating(true);
    setSimulationLog(null);
    try {
      const response = await fetch(
        `http://localhost:8000/api/runs/${runId}/simulate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model_name: selectedModel, count }),
        }
      );
      if (!response.ok) {
        const err = await response.text();
        console.error("Simulation failed:", err);
        setSimulationLog(`Error: ${err}`);
        return;
      }
      const data = await response.json();
      const correct = data.trials.filter((t) => t.success === 1).length;
      const avgProb =
        data.trials.length > 0
          ? data.trials.reduce((s, t) => s + (t.probability ?? 0), 0) / data.trials.length
          : 0;
      setSimulationLog(
        `Simulated ${data.total_simulated}: ${correct}/${data.total_simulated} correct | avg P = ${(avgProb * 100).toFixed(1)}%`
      );
      // Accumulate trial markers (keep last 500)
      setSimTrialMarkers((prev) => {
        const newMarkers = data.trials.map((t) => ({
          ts: t.triangle_size,
          sat: t.saturation,
          success: t.success,
          probability: t.probability,
        }));
        return [...prev, ...newMarkers].slice(-500);
      });
      setTotalSamples(data.total_samples ?? 0);
      // Refresh display
      const nextData = await fetchNextCombination(true);
      if (!nextData) {
        setCurrentTest(null);
      }
      if (debugVisible) {
        await fetchDebugInfo();
      }
    } catch (error) {
      console.error("Simulation error:", error);
      setSimulationLog("Simulation request failed");
    } finally {
      setIsSimulating(false);
    }
  }, [runId, isSimulating, selectedModel, fetchNextCombination, debugVisible, fetchDebugInfo]);

  useEffect(() => {
    if (!simulationEnabled || !runId) return;
    const handleSimKey = (event) => {
      if (isSimulating) return;
      let count = 0;
      if (event.key === "1") count = 1;
      else if (event.key === "5") count = 5;
      else if (event.key === "0" && !event.shiftKey) count = 10;
      else if (event.key === ")") count = 50;
      if (count > 0) {
        event.preventDefault();
        runSimulation(count);
      }
    };
    window.addEventListener("keydown", handleSimKey);
    return () => window.removeEventListener("keydown", handleSimKey);
  }, [simulationEnabled, runId, isSimulating, runSimulation]);

  const runCounts = debugData?.counts?.run || null;
  const testCounts = debugData?.counts?.test || null;
  const bounds = debugData?.bounds || null;
  const rectangles = debugData?.rectangles || null;
  const pretestState = debugData?.pretest_state || null;
  const pretestWarnings = debugData?.run?.pretest_warnings || [];
  const lastResult = debugData?.last_result || null;

  return (
    <>
      {debugEnabled && (
        <div
          className="debug-toggle"
          style={{ top: currentPhase === "pretest" ? "42px" : "12px" }}
        >
          <button
            className={`debug-toggle-btn ${debugVisible ? "active" : ""}`}
            onClick={() => setDebugVisible((prev) => !prev)}
            type="button"
          >
            Debug {debugVisible ? "On" : "Off"}
          </button>
        </div>
      )}

      {debugEnabled && debugVisible && (
        <div
          className={`debug-panel ${
            currentPhase === "pretest" ? "debug-panel-pretest" : ""
          }`}
        >
          <div className="debug-panel-header">
            <div>
              <div className="debug-panel-title">Debug Overlay</div>
              <div className="debug-panel-meta">
                <span>Phase: {debugData?.phase || currentPhase}</span>
                <span>Updated: {formatTimestamp(debugData?.timestamp)}</span>
                {debugLoading && <span>Updating...</span>}
              </div>
            </div>
            <div className="debug-panel-controls">
              <button
                type="button"
                className={`debug-level-btn ${
                  debugDetail === "summary" ? "active" : ""
                }`}
                onClick={() => setDebugDetail("summary")}
              >
                Summary
              </button>
              <button
                type="button"
                className={`debug-level-btn ${
                  debugDetail === "detailed" ? "active" : ""
                }`}
                onClick={() => setDebugDetail("detailed")}
              >
                Detailed
              </button>
            </div>
          </div>

          <div className="debug-grid">
            <div className="debug-stat">
              <div className="debug-stat-label">Run</div>
              <div className="debug-stat-value">
                {runId
                  ? `#${debugData?.run?.id ?? runId} | ${
                      debugData?.run?.status || "N/A"
                    } | ${debugData?.run?.pretest_mode || "N/A"}`
                  : `Test #${debugData?.test?.id ?? testId}`}
              </div>
              <div className="debug-stat-hint">
                {debugData?.test?.title || "N/A"}
              </div>
            </div>

            <div className="debug-stat">
              <div className="debug-stat-label">Current Trial</div>
              <div className="debug-stat-value">
                size {formatNumber(currentTest?.triangle_size, 1)} | sat{" "}
                {formatNumber(currentTest?.saturation, 3)} |{" "}
                {currentTest?.orientation || "N/A"}
              </div>
              <div className="debug-stat-hint">
                rect {currentTest?.rectangle_id ?? "N/A"} | total{" "}
                {formatNumber(totalSamples, 0)}
              </div>
            </div>

            {runCounts && (
              <div className="debug-stat">
                <div className="debug-stat-label">Run Counts</div>
                <div className="debug-stat-value">
                  correct {runCounts.correct} / incorrect {runCounts.incorrect}
                </div>
                <div className="debug-stat-hint">
                  total {runCounts.total} | pretest {runCounts.pretest} | main{" "}
                  {runCounts.main} | rate {formatPercent(runCounts.success_rate)}
                </div>
              </div>
            )}

            {testCounts && (
              <div className="debug-stat">
                <div className="debug-stat-label">Test Counts</div>
                <div className="debug-stat-value">
                  correct {testCounts.correct} / incorrect {testCounts.incorrect}
                </div>
                <div className="debug-stat-hint">
                  total {testCounts.total} | pretest {testCounts.pretest} | main{" "}
                  {testCounts.main} | rate {formatPercent(testCounts.success_rate)}
                </div>
              </div>
            )}

            <div className="debug-stat">
              <div className="debug-stat-label">Active Bounds</div>
              <div className="debug-stat-value">
                {formatBounds(bounds?.active)}
              </div>
              <div className="debug-stat-hint">
                source: {bounds?.active_source || "N/A"}
              </div>
            </div>

            <div className="debug-stat">
              <div className="debug-stat-label">Global Limits</div>
              <div className="debug-stat-value">
                {formatBounds(bounds?.global)}
              </div>
            </div>

            {rectangles && (
              <div className="debug-stat">
                <div className="debug-stat-label">Rectangles</div>
                <div className="debug-stat-value">
                  {rectangles.count} total
                </div>
                <div className="debug-stat-hint">
                  true {rectangles.total_true} | false {rectangles.total_false}
                </div>
              </div>
            )}

            {lastResult && (
              <div className="debug-stat">
                <div className="debug-stat-label">Last Result</div>
                <div className="debug-stat-value">
                  size {formatNumber(lastResult.triangle_size, 1)} | sat{" "}
                  {formatNumber(lastResult.saturation, 3)} |{" "}
                  {lastResult.orientation}
                </div>
                <div className="debug-stat-hint">
                  success {lastResult.success} | {lastResult.phase}
                </div>
              </div>
            )}
          </div>

          {debugDetail === "detailed" && (
            <div className="debug-section">
              {bounds?.test && (
                <div className="debug-subsection">
                  <div className="debug-subsection-title">Test Bounds</div>
                  <div className="debug-subsection-value">
                    {formatBounds(bounds.test)}
                  </div>
                </div>
              )}

              {bounds?.run && (
                <div className="debug-subsection">
                  <div className="debug-subsection-title">Run Bounds</div>
                  <div className="debug-subsection-value">
                    {formatBounds(bounds.run)}
                  </div>
                </div>
              )}

              {pretestState && (
                <details className="debug-details">
                  <summary>Pretest State</summary>
                  <div className="debug-kv-grid">
                    <div className="debug-kv">
                      <span className="debug-kv-label">Axis</span>
                      <span className="debug-kv-value">
                        {pretestState.current_axis}
                      </span>
                    </div>
                    <div className="debug-kv">
                      <span className="debug-kv-label">Phase</span>
                      <span className="debug-kv-value">
                        {pretestState.search_phase}
                      </span>
                    </div>
                    <div className="debug-kv">
                      <span className="debug-kv-label">Probe Value</span>
                      <span className="debug-kv-value">
                        {formatNumber(pretestState.current_probe_value, 3)}
                      </span>
                    </div>
                    <div className="debug-kv">
                      <span className="debug-kv-label">Probe Correct</span>
                      <span className="debug-kv-value">
                        {pretestState.current_probe_correct}
                      </span>
                    </div>
                    <div className="debug-kv">
                      <span className="debug-kv-label">Probe Trials</span>
                      <span className="debug-kv-value">
                        {pretestState.current_probe_trials}
                      </span>
                    </div>
                    <div className="debug-kv">
                      <span className="debug-kv-label">Probes Used</span>
                      <span className="debug-kv-value">
                        {pretestState.probes_used}
                      </span>
                    </div>
                    <div className="debug-kv">
                      <span className="debug-kv-label">Bracket</span>
                      <span className="debug-kv-value">
                        {formatNumber(pretestState.bracket_lo, 3)} -{" "}
                        {formatNumber(pretestState.bracket_hi, 3)}
                      </span>
                    </div>
                    <div className="debug-kv">
                      <span className="debug-kv-label">Anchor</span>
                      <span className="debug-kv-value">
                        {formatNumber(pretestState.anchor_value, 3)} (
                        {formatNumber(pretestState.anchor_p_hat, 3)})
                      </span>
                    </div>
                    <div className="debug-kv">
                      <span className="debug-kv-label">Size Lower</span>
                      <span className="debug-kv-value">
                        {formatNumber(pretestState.size_lower, 2)}
                      </span>
                    </div>
                    <div className="debug-kv">
                      <span className="debug-kv-label">Size Upper</span>
                      <span className="debug-kv-value">
                        {formatNumber(pretestState.size_upper, 2)}
                      </span>
                    </div>
                    <div className="debug-kv">
                      <span className="debug-kv-label">Size 95%</span>
                      <span className="debug-kv-value">
                        {formatNumber(pretestState.size_95, 2)}
                      </span>
                    </div>
                    <div className="debug-kv">
                      <span className="debug-kv-label">Sat Lower</span>
                      <span className="debug-kv-value">
                        {formatNumber(pretestState.saturation_lower, 3)}
                      </span>
                    </div>
                    <div className="debug-kv">
                      <span className="debug-kv-label">Sat Upper</span>
                      <span className="debug-kv-value">
                        {formatNumber(pretestState.saturation_upper, 3)}
                      </span>
                    </div>
                    <div className="debug-kv">
                      <span className="debug-kv-label">Refine Step</span>
                      <span className="debug-kv-value">
                        {pretestState.refine_step}
                      </span>
                    </div>
                    <div className="debug-kv">
                      <span className="debug-kv-label">Complete</span>
                      <span className="debug-kv-value">
                        {pretestState.is_complete ? "yes" : "no"}
                      </span>
                    </div>
                  </div>
                </details>
              )}

              {pretestWarnings.length > 0 && (
                <details className="debug-details">
                  <summary>Pretest Warnings</summary>
                  <div className="debug-warning-list">
                    {pretestWarnings.map((warning, index) => (
                      <div key={index} className="debug-warning-item">
                        {warning}
                      </div>
                    ))}
                  </div>
                </details>
              )}

              {pretestState?.completed_probes?.length > 0 && (
                <details className="debug-details">
                  <summary>
                    Completed Probes ({pretestState.completed_probes.length})
                  </summary>
                  <div className="debug-table-wrap">
                    <table className="debug-table">
                      <thead>
                        <tr>
                          <th>Axis</th>
                          <th>Phase</th>
                          <th>Value</th>
                          <th>Correct</th>
                          <th>Trials</th>
                          <th>P_hat</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pretestState.completed_probes.map((probe, index) => (
                          <tr key={index}>
                            <td>{probe.axis}</td>
                            <td>{probe.phase}</td>
                            <td>{formatNumber(probe.value, 3)}</td>
                            <td>{probe.correct}</td>
                            <td>{probe.trials}</td>
                            <td>{formatNumber(probe.p_hat, 3)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              )}

              {rectangles?.items?.length > 0 && (
                <details className="debug-details">
                  <summary>Rectangles ({rectangles.items.length})</summary>
                  <div className="debug-table-wrap">
                    <table className="debug-table">
                      <thead>
                        <tr>
                          <th>ID</th>
                          <th>Triangle Size</th>
                          <th>Saturation</th>
                          <th>Area</th>
                          <th>True</th>
                          <th>False</th>
                          <th>Weight</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rectangles.items.map((rect) => (
                          <tr key={rect.id}>
                            <td>{rect.id}</td>
                            <td>
                        {formatNumber(rect.bounds.triangle_size[0], 2)} -{" "}
                        {formatNumber(rect.bounds.triangle_size[1], 2)}
                      </td>
                      <td>
                        {formatNumber(rect.bounds.saturation[0], 3)} -{" "}
                        {formatNumber(rect.bounds.saturation[1], 3)}
                      </td>
                            <td>{formatNumber(rect.area, 4)}</td>
                            <td>{rect.true_samples}</td>
                            <td>{rect.false_samples}</td>
                            <td>{formatNumber(rect.selection_weight, 4)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              )}
            </div>
          )}

          {debugError && (
            <div className="debug-error">{debugError}</div>
          )}
        </div>
      )}

      {currentPhase === "pretest" && stimulusPhase === "stimulus" && (
        <div className="pretest-banner">PRETEST</div>
      )}
      {stimulusPhase === "stimulus" && (
        <div className="play-page">
          <div className="play-info">
            <span className="sample-count">#{totalSamples}</span>
            <Link
              to={`/test-visualization/${testId}`}
              className="btn btn-outline btn-icon"
            >
              <span className="icon">📊</span>
            </Link>
          </div>
        </div>
      )}
      <div className="play-test-container">
        {stimulusPhase === "stimulus" && currentTest ? (
          <Content
            sideLength={currentTest.triangle_size}
            diameter={800}
            colorCircle="#1a1a1a"
            colorTriangle={hslToRgb(
              0,
              0,
              theme === "light"
                ? (1 - currentTest.saturation) * 100
                : currentTest.saturation * 100
            )}
            orientation={currentTest.orientation}
          />
        ) : null}

        {stimulusPhase === "eink" && (
          <div
            className={`eink-flash-screen ${
              displaySettings?.eink?.flash_color === "black"
                ? "eink-black"
                : "eink-white"
            }`}
          />
        )}

        {!didInitialFetch && (
          <div className="play-loading-indicator">Loading...</div>
        )}

        {feedback && (
          <div
            style={{
              position: "absolute",
              bottom: 0,
              left: 0,
              width: "100%",
              height: "20px",
              backgroundColor: feedback.correct ? "#4CAF50" : "#F44336",
              transition: "all 0.3s ease",
            }}
          />
        )}
      </div>

      {simulationEnabled && runId && (
        <div className="simulation-bar simulation-bar-with-heatmap">
          <div className="simulation-bar-inner">
            <div className="simulation-controls">
              <span className="simulation-bar-label">Simulation</span>
              <select
                className="simulation-model-select"
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                disabled={isSimulating}
              >
                {simulationModels.map((m) => (
                  <option key={m.name} value={m.name}>
                    {m.label}
                  </option>
                ))}
              </select>
              <button
                className="simulation-btn"
                disabled={isSimulating}
                onClick={() => runSimulation(1)}
              >
                ×1 <kbd>1</kbd>
              </button>
              <button
                className="simulation-btn"
                disabled={isSimulating}
                onClick={() => runSimulation(5)}
              >
                ×5 <kbd>5</kbd>
              </button>
              <button
                className="simulation-btn"
                disabled={isSimulating}
                onClick={() => runSimulation(10)}
              >
                ×10 <kbd>0</kbd>
              </button>
              <button
                className="simulation-btn"
                disabled={isSimulating}
                onClick={() => runSimulation(50)}
              >
                ×50 <kbd>⇧0</kbd>
              </button>
              {isSimulating && <span className="simulation-spinner">Running…</span>}
              {simulationLog && !isSimulating && (
                <span className="simulation-log">{simulationLog}</span>
              )}
            </div>
            {simHeatmap && (
              <div className="simulation-heatmap-area">
                <SimulationHeatmap
                  heatmap={simHeatmap}
                  markers={simTrialMarkers}
                  currentTrial={currentTest}
                />
                {simTrialMarkers.length > 0 && (
                  <div className="simulation-heatmap-legend">
                    <span className="sim-legend-item">
                      <span className="sim-legend-dot sim-legend-correct" /> correct
                    </span>
                    <span className="sim-legend-item">
                      <span className="sim-legend-dot sim-legend-incorrect" /> incorrect
                    </span>
                    <span className="sim-legend-item">
                      <span className="sim-legend-x">✕</span> current
                    </span>
                    <span className="sim-legend-count">
                      {simTrialMarkers.length} pts
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

/* ═══ Mini simulation heatmap with trial markers ═══ */
function SimulationHeatmap({ heatmap, markers, currentTrial }) {
  const canvasRef = useRef(null);

  const cols = heatmap ? heatmap.triangle_sizes.length : 0;
  const rows = heatmap ? heatmap.saturations.length : 0;
  const mL = 42, mB = 32, mT = 8, mR = 8;
  const plotW = 200, plotH = 160;
  const totalW = plotW + mL + mR;
  const totalH = plotH + mT + mB;

  const tsMin = heatmap ? heatmap.triangle_sizes[0] : 0;
  const tsMax = heatmap ? heatmap.triangle_sizes[cols - 1] : 1;
  const satMin = heatmap ? heatmap.saturations[0] : 0;
  const satMax = heatmap ? heatmap.saturations[rows - 1] : 1;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !heatmap) return;
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    canvas.width = totalW * dpr;
    canvas.height = totalH * dpr;
    canvas.style.width = totalW + "px";
    canvas.style.height = totalH + "px";
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, totalW, totalH);

    const cellW = plotW / cols;
    const cellH = plotH / rows;

    // Draw heatmap cells
    for (let si = 0; si < rows; si++) {
      const ry = rows - 1 - si;
      for (let ci = 0; ci < cols; ci++) {
        const p = heatmap.grid[si][ci];
        ctx.fillStyle = simRdYlGn(p);
        ctx.fillRect(mL + ci * cellW, mT + ry * cellH, cellW + 0.5, cellH + 0.5);
      }
    }

    // Helper to convert data coords to canvas coords
    const tsRange = tsMax - tsMin || 1;
    const satRange = satMax - satMin || 1;
    const toX = (ts) => mL + ((ts - tsMin) / tsRange) * plotW;
    const toY = (sat) => mT + (1 - (sat - satMin) / satRange) * plotH;

    // Draw trial markers
    markers.forEach((m) => {
      const x = toX(m.ts);
      const y = toY(m.sat);
      ctx.fillStyle = m.success ? "rgba(255,255,255,0.8)" : "rgba(0,0,0,0.8)";
      ctx.beginPath();
      ctx.arc(x, y, 2.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = m.success ? "rgba(0,0,0,0.4)" : "rgba(255,255,255,0.4)";
      ctx.lineWidth = 0.5;
      ctx.stroke();
    });

    // Draw current trial crosshair
    if (currentTrial) {
      const cx = toX(currentTrial.triangle_size);
      const cy = toY(currentTrial.saturation);
      // White outline for visibility
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(cx - 8, cy - 8); ctx.lineTo(cx + 8, cy + 8);
      ctx.moveTo(cx + 8, cy - 8); ctx.lineTo(cx - 8, cy + 8);
      ctx.stroke();
      // Dark X
      ctx.strokeStyle = "#000";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(cx - 8, cy - 8); ctx.lineTo(cx + 8, cy + 8);
      ctx.moveTo(cx + 8, cy - 8); ctx.lineTo(cx - 8, cy + 8);
      ctx.stroke();
    }

    // Border
    ctx.strokeStyle = "#666";
    ctx.lineWidth = 0.5;
    ctx.strokeRect(mL, mT, plotW, plotH);

    // X-axis labels
    ctx.fillStyle = "#999";
    ctx.font = "8px monospace";
    ctx.textAlign = "center";
    [0, 0.5, 1].forEach((f) => {
      const v = tsMin + f * (tsMax - tsMin);
      ctx.fillText(Math.round(v).toString(), mL + f * plotW, mT + plotH + 12);
    });
    ctx.font = "8px sans-serif";
    ctx.fillText("Size (px)", mL + plotW / 2, mT + plotH + 24);

    // Y-axis labels
    ctx.font = "8px monospace";
    ctx.textAlign = "right";
    [0, 0.5, 1].forEach((f) => {
      const v = satMin + f * (satMax - satMin);
      ctx.fillText(v.toFixed(2), mL - 4, mT + (1 - f) * plotH + 3);
    });
    ctx.save();
    ctx.translate(8, mT + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = "center";
    ctx.font = "8px sans-serif";
    ctx.fillText("Sat", 0, 0);
    ctx.restore();
  }, [heatmap, markers, currentTrial, cols, rows, plotW, plotH, totalW, totalH, tsMin, tsMax, satMin, satMax, mL, mT, mB, mR]);

  if (!heatmap) return null;
  return <canvas ref={canvasRef} style={{ display: "block" }} />;
}

function simRdYlGn(p) {
  const t = Math.max(0, Math.min(1, (p - 0.3) / 0.7));
  const stops = [
    [215, 48, 39], [244, 109, 67], [253, 174, 97], [254, 224, 139],
    [255, 255, 191], [217, 239, 139], [166, 217, 106], [102, 189, 99],
    [26, 152, 80], [0, 104, 55],
  ];
  const n = stops.length - 1;
  const idx = t * n;
  const lo = Math.floor(idx);
  const hi = Math.min(lo + 1, n);
  const frac = idx - lo;
  const r = Math.round(stops[lo][0] + (stops[hi][0] - stops[lo][0]) * frac);
  const g = Math.round(stops[lo][1] + (stops[hi][1] - stops[lo][1]) * frac);
  const b = Math.round(stops[lo][2] + (stops[hi][2] - stops[lo][2]) * frac);
  return `rgb(${r},${g},${b})`;
}

export default PlayTest;
