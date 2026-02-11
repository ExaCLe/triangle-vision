import { useState, useEffect } from "react";
import { normalizePretestSettings } from "../pretestSettings";
import "../css/SettingsPage.css";

const parseNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

function SettingsPage({ onSimulationChange }) {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    fetch("http://localhost:8000/api/settings/pretest")
      .then((res) => res.json())
      .then((data) => {
        setSettings(normalizePretestSettings(data));
        setLoading(false);
      })
      .catch(() => {
        setMessage({ type: "error", text: "Failed to load settings" });
        setLoading(false);
      });
  }, []);

  const handleSave = async () => {
    if (!settings) return;
    setSaving(true);
    setMessage(null);
    try {
      const payload = normalizePretestSettings(settings);
      const response = await fetch("http://localhost:8000/api/settings/pretest", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error("Failed to save");
      const data = await response.json();
      setSettings(normalizePretestSettings(data));
      setMessage({ type: "success", text: "Settings saved successfully" });
      if (onSimulationChange) {
        onSimulationChange(!!data?.simulation?.enabled);
      }
    } catch {
      setMessage({ type: "error", text: "Failed to save settings" });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="settings-container">
        <p>Loading settings...</p>
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="settings-container">
        <p>Failed to load settings.</p>
      </div>
    );
  }

  return (
    <div className="settings-container">
      <h2 className="settings-title">Pretest & Display Settings</h2>
      <p className="settings-description">
        Configure algorithm search, masking timing, e-ink refresh, and answer flip behavior.
      </p>

      <div className="settings-section">
        <h3>Targets</h3>
        <div className="settings-grid">
          <div className="setting-field">
            <label>Lower Target (p_hat)</label>
            <input
              type="number"
              step="0.01"
              value={settings.lower_target}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  lower_target: parseNumber(e.target.value, settings.lower_target),
                })
              }
            />
            <span className="setting-help">Performance floor (~40%)</span>
          </div>
          <div className="setting-field">
            <label>Upper Target (p_hat)</label>
            <input
              type="number"
              step="0.01"
              value={settings.upper_target}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  upper_target: parseNumber(e.target.value, settings.upper_target),
                })
              }
            />
            <span className="setting-help">Performance ceiling (~95%)</span>
          </div>
        </div>
      </div>

      <div className="settings-section">
        <h3>Probe Rule</h3>
        <div className="settings-grid">
          <div className="setting-field">
            <label>Success Target</label>
            <input
              type="number"
              value={settings.probe_rule.success_target}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  probe_rule: {
                    ...settings.probe_rule,
                    success_target: parseNumber(
                      e.target.value,
                      settings.probe_rule.success_target
                    ),
                  },
                })
              }
            />
            <span className="setting-help">Correct answers to complete a probe</span>
          </div>
          <div className="setting-field">
            <label>Trial Cap</label>
            <input
              type="number"
              value={settings.probe_rule.trial_cap}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  probe_rule: {
                    ...settings.probe_rule,
                    trial_cap: parseNumber(
                      e.target.value,
                      settings.probe_rule.trial_cap
                    ),
                  },
                })
              }
            />
            <span className="setting-help">Max trials per probe point</span>
          </div>
        </div>
      </div>

      <div className="settings-section">
        <h3>Search Config</h3>
        <div className="settings-grid">
          <div className="setting-field">
            <label>Max Probes Per Axis</label>
            <input
              type="number"
              value={settings.search.max_probes_per_axis}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  search: {
                    ...settings.search,
                    max_probes_per_axis: parseNumber(
                      e.target.value,
                      settings.search.max_probes_per_axis
                    ),
                  },
                })
              }
            />
            <span className="setting-help">Max probes before clamping</span>
          </div>
          <div className="setting-field">
            <label>Refine Steps Per Edge</label>
            <input
              type="number"
              value={settings.search.refine_steps_per_edge}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  search: {
                    ...settings.search,
                    refine_steps_per_edge: parseNumber(
                      e.target.value,
                      settings.search.refine_steps_per_edge
                    ),
                  },
                })
              }
            />
            <span className="setting-help">Binary search iterations per boundary</span>
          </div>
        </div>
      </div>

      <div className="settings-section">
        <h3>Global Limits</h3>
        <div className="settings-grid">
          <div className="setting-field">
            <label>Min Triangle Size</label>
            <input
              type="number"
              value={settings.global_limits.min_triangle_size}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  global_limits: {
                    ...settings.global_limits,
                    min_triangle_size: parseNumber(
                      e.target.value,
                      settings.global_limits.min_triangle_size
                    ),
                  },
                })
              }
            />
          </div>
          <div className="setting-field">
            <label>Max Triangle Size</label>
            <input
              type="number"
              value={settings.global_limits.max_triangle_size}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  global_limits: {
                    ...settings.global_limits,
                    max_triangle_size: parseNumber(
                      e.target.value,
                      settings.global_limits.max_triangle_size
                    ),
                  },
                })
              }
            />
          </div>
          <div className="setting-field">
            <label>Min Saturation</label>
            <input
              type="number"
              step="0.01"
              value={settings.global_limits.min_saturation}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  global_limits: {
                    ...settings.global_limits,
                    min_saturation: parseNumber(
                      e.target.value,
                      settings.global_limits.min_saturation
                    ),
                  },
                })
              }
            />
          </div>
          <div className="setting-field">
            <label>Max Saturation</label>
            <input
              type="number"
              step="0.01"
              value={settings.global_limits.max_saturation}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  global_limits: {
                    ...settings.global_limits,
                    max_saturation: parseNumber(
                      e.target.value,
                      settings.global_limits.max_saturation
                    ),
                  },
                })
              }
            />
          </div>
        </div>
      </div>

      <div className="settings-section">
        <h3>Trial Masking</h3>
        <div className="settings-grid">
          <div className="setting-field">
            <label>Mask Duration (ms)</label>
            <input
              type="number"
              min="0"
              value={settings.display.masking.duration_ms}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  display: {
                    ...settings.display,
                    masking: {
                      ...settings.display.masking,
                      duration_ms: parseNumber(
                        e.target.value,
                        settings.display.masking.duration_ms
                      ),
                    },
                  },
                })
              }
            />
            <span className="setting-help">
              Time to show only background between two triangle stimuli.
            </span>
          </div>
        </div>
      </div>

      <div className="settings-section">
        <h3>Visual Contrast</h3>
        <div className="settings-grid">
          <div className="setting-field setting-toggle">
            <div className="setting-toggle-row">
              <label>Invert playtest colors</label>
              <input
                type="checkbox"
                checked={settings.display.invert_colors ?? false}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    display: {
                      ...settings.display,
                      invert_colors: e.target.checked,
                    },
                  })
                }
              />
            </div>
            <span className="setting-help">
              Default is white background with dark stimulus; enable to invert.
            </span>
          </div>
        </div>
      </div>

      <div className="settings-section">
        <h3>E-Ink Mode</h3>
        <div className="settings-grid">
          <div className="setting-field setting-toggle">
            <div className="setting-toggle-row">
              <label>Enable e-ink flash</label>
              <input
                type="checkbox"
                checked={settings.display.eink.enabled}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    display: {
                      ...settings.display,
                      eink: {
                        ...settings.display.eink,
                        enabled: e.target.checked,
                      },
                    },
                  })
                }
              />
            </div>
            <span className="setting-help">
              Shows a full black/white frame after masking to reduce ghosting.
            </span>
          </div>

          <div className="setting-field">
            <label>Flash Color</label>
            <select
              value={settings.display.eink.flash_color}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  display: {
                    ...settings.display,
                    eink: {
                      ...settings.display.eink,
                      flash_color: e.target.value,
                    },
                  },
                })
              }
            >
              <option value="white">White</option>
              <option value="black">Black</option>
            </select>
          </div>

          <div className="setting-field">
            <label>Flash Duration (ms)</label>
            <input
              type="number"
              min="0"
              value={settings.display.eink.flash_duration_ms}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  display: {
                    ...settings.display,
                    eink: {
                      ...settings.display.eink,
                      flash_duration_ms: parseNumber(
                        e.target.value,
                        settings.display.eink.flash_duration_ms
                      ),
                    },
                  },
                })
              }
            />
          </div>
        </div>
      </div>

      <div className="settings-section">
        <h3>Answer Flip</h3>
        <div className="settings-grid">
          <div className="setting-field setting-toggle">
            <div className="setting-toggle-row">
              <label>Flip Horizontal (Left/Right)</label>
              <input
                type="checkbox"
                checked={settings.display.flip.horizontal}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    display: {
                      ...settings.display,
                      flip: {
                        ...settings.display.flip,
                        horizontal: e.target.checked,
                      },
                    },
                  })
                }
              />
            </div>
          </div>
          <div className="setting-field setting-toggle">
            <div className="setting-toggle-row">
              <label>Flip Vertical (Up/Down)</label>
              <input
                type="checkbox"
                checked={settings.display.flip.vertical}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    display: {
                      ...settings.display,
                      flip: {
                        ...settings.display.flip,
                        vertical: e.target.checked,
                      },
                    },
                  })
                }
              />
            </div>
          </div>
        </div>
      </div>

      <div className="settings-section">
        <h3>Debug Overlay</h3>
        <div className="settings-grid">
          <div className="setting-field setting-toggle">
            <div className="setting-toggle-row">
              <label>Enable PlayTest debug overlay</label>
              <input
                type="checkbox"
                checked={settings.debug?.enabled ?? true}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    debug: {
                      ...(settings.debug ?? { enabled: true }),
                      enabled: e.target.checked,
                    },
                  })
                }
              />
            </div>
            <span className="setting-help">
              Hides the PlayTest debug toggle and overlay when disabled.
            </span>
          </div>
        </div>
      </div>

      <div className="settings-section">
        <h3>Simulation Mode</h3>
        <div className="settings-grid">
          <div className="setting-field setting-toggle">
            <div className="setting-toggle-row">
              <label>Enable simulation bar in PlayTest</label>
              <input
                type="checkbox"
                checked={settings.simulation?.enabled ?? false}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    simulation: {
                      ...(settings.simulation ?? { enabled: false }),
                      enabled: e.target.checked,
                    },
                  })
                }
              />
            </div>
            <span className="setting-help">
              Shows a simulation toolbar during tests. Use hotkeys to run
              automated trials with a ground-truth model (1 = one trial,
              5 / 0 / ⇧0 for 5 / 10 / 50).
            </span>
          </div>
        </div>
      </div>

      {message && <p className={`settings-message ${message.type}`}>{message.text}</p>}

      <div className="settings-actions">
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Save Settings"}
        </button>
      </div>
    </div>
  );
}

export default SettingsPage;
