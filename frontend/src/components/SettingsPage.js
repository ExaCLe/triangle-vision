import { useState, useEffect } from "react";
import "../css/SettingsPage.css";

function SettingsPage() {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    fetch("http://localhost:8000/api/settings/pretest")
      .then((res) => res.json())
      .then((data) => {
        setSettings(data);
        setLoading(false);
      })
      .catch(() => {
        setMessage({ type: "error", text: "Failed to load settings" });
        setLoading(false);
      });
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch(
        "http://localhost:8000/api/settings/pretest",
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(settings),
        }
      );
      if (!response.ok) throw new Error("Failed to save");
      const data = await response.json();
      setSettings(data);
      setMessage({ type: "success", text: "Settings saved successfully" });
    } catch {
      setMessage({ type: "error", text: "Failed to save settings" });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="settings-container"><p>Loading settings...</p></div>;
  if (!settings) return <div className="settings-container"><p>Failed to load settings.</p></div>;

  return (
    <div className="settings-container">
      <h2 className="settings-title">Pretest Settings</h2>
      <p className="settings-description">
        Configure the cutting search pretest parameters.
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
                setSettings({ ...settings, lower_target: parseFloat(e.target.value) })
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
                setSettings({ ...settings, upper_target: parseFloat(e.target.value) })
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
                    success_target: parseInt(e.target.value),
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
                    trial_cap: parseInt(e.target.value),
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
                    max_probes_per_axis: parseInt(e.target.value),
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
                    refine_steps_per_edge: parseInt(e.target.value),
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
                    min_triangle_size: parseFloat(e.target.value),
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
                    max_triangle_size: parseFloat(e.target.value),
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
                    min_saturation: parseFloat(e.target.value),
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
                    max_saturation: parseFloat(e.target.value),
                  },
                })
              }
            />
          </div>
        </div>
      </div>

      {message && (
        <p className={`settings-message ${message.type}`}>{message.text}</p>
      )}

      <div className="settings-actions">
        <button
          className="btn btn-primary"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? "Saving..." : "Save Settings"}
        </button>
      </div>
    </div>
  );
}

export default SettingsPage;
