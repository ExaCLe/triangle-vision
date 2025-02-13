import { Link } from "react-router-dom";
import "../css/Navbar.css";
import { useTheme } from "../context/ThemeContext";

function Navbar({ onCreateClick }) {
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="container">
      <div className="py-6">
        <div className="flex items-center justify-between">
          <Link to="/" className="no-underline">
            <h1 className="text-3xl font-bold tracking-tight">
              Triangle Vision
            </h1>
          </Link>
          <div className="flex items-center gap-4">
            <Link to="/" className="btn btn-ghost">
              Home
            </Link>
            <Link to="/custom-test" className="btn btn-ghost">
              Custom Test
            </Link>
            <button
              className="btn btn-icon"
              onClick={toggleTheme}
              aria-label="Toggle theme"
            >
              <span className="icon">{theme === "light" ? "🌙" : "☀️"}</span>
            </button>
            <button className="create-test-btn" onClick={onCreateClick}>
              <svg
                className="plus-icon"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="16" />
                <line x1="8" y1="12" x2="16" y2="12" />
              </svg>
              Create New Test
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Navbar;
