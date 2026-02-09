import { Link, useLocation } from "react-router-dom";
import "../css/Navbar.css";
import { useTheme } from "../context/ThemeContext";

function Navbar({ onCreateClick, simulationEnabled }) {
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();

  const isActive = (path) => location.pathname === path;

  return (
    <nav className="navbar">
      <Link to="/" className="nav-brand">
        <span className="nav-brand-icon">
          <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path
              d="M16 4L28 26H4L16 4Z"
              fill="currentColor"
              opacity="0.15"
            />
            <path
              d="M16 4L28 26H4L16 4Z"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinejoin="round"
              fill="none"
            />
            <circle cx="16" cy="18" r="4" fill="currentColor" opacity="0.4" />
          </svg>
        </span>
        <span className="nav-brand-text">
          Triangle<span className="brand-accent">Vision</span>
        </span>
      </Link>

      <div className="nav-links">
        <Link
          to="/"
          className={`nav-link ${isActive("/") ? "active" : ""}`}
        >
          Tests
        </Link>
        <Link
          to="/custom-test"
          className={`nav-link ${isActive("/custom-test") ? "active" : ""}`}
        >
          Custom
        </Link>
        {simulationEnabled ? (
          <Link
            to="/model-explorer"
            className={`nav-link ${isActive("/model-explorer") ? "active" : ""}`}
          >
            Models
          </Link>
        ) : (
          <span className="nav-link disabled" title="Enable simulation mode in Settings to explore models">
            Models
          </span>
        )}
        {simulationEnabled ? (
          <Link
            to="/tuning"
            className={`nav-link ${isActive("/tuning") ? "active" : ""}`}
          >
            Tuning
          </Link>
        ) : (
          <span className="nav-link disabled" title="Enable simulation mode in Settings to tune algorithm">
            Tuning
          </span>
        )}
        <Link
          to="/settings"
          className={`nav-link ${isActive("/settings") ? "active" : ""}`}
        >
          Settings
        </Link>
      </div>

      <div className="nav-actions">
        <button
          className="theme-toggle"
          onClick={toggleTheme}
          aria-label="Toggle theme"
        >
          {theme === "light" ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="5" />
              <line x1="12" y1="1" x2="12" y2="3" />
              <line x1="12" y1="21" x2="12" y2="23" />
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
              <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
              <line x1="1" y1="12" x2="3" y2="12" />
              <line x1="21" y1="12" x2="23" y2="12" />
              <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
              <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
            </svg>
          )}
        </button>
        <div className="nav-divider" />
        <button className="create-btn" onClick={onCreateClick}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          New Test
        </button>
      </div>
    </nav>
  );
}

export default Navbar;
