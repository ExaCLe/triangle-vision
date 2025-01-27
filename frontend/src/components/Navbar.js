import { Link } from "react-router-dom";
import "../css/Navbar.css";

function Navbar({ onCreateClick }) {
  return (
    <div className="container">
      <div className="py-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              Triangle Vision Tests
            </h1>
            <p className="text-muted-foreground">
              Manage and run your vision tests
            </p>
          </div>
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
  );
}

export default Navbar;
