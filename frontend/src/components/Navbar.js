import { Link } from "react-router-dom";
import { useState } from "react";
import "../css/Navbar.css";
import TestFormModal from "./TestFormModal";
import DeleteTestModal from "./DeleteTestModal";

function Navbar({ onRefetch }) {
  const [isTestModalOpen, setIsTestModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [modalMode, setModalMode] = useState("create");

  const handleTestSubmit = async (testData, testId = null) => {
    try {
      const url = testId
        ? `http://localhost:8000/tests/${testId}`
        : "http://localhost:8000/tests/";

      const response = await fetch(url, {
        method: testId ? "PUT" : "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(testData),
      });

      if (!response.ok) {
        throw new Error(`Failed to ${testId ? "modify" : "create"} test`);
      }

      await onRefetch();
      setIsTestModalOpen(false);
    } catch (error) {
      console.error(`Error ${testId ? "modifying" : "creating"} test:`, error);
    }
  };

  return (
    <>
      <nav className="navbar">
        <Link to="/" className="nav-logo">
          Triangle Vision
        </Link>
        <div className="nav-links">
          <Link to="/" className="nav-link">
            Home
          </Link>
          <Link to="/custom-test" className="nav-link">
            Custom Test
          </Link>
          <div className="dropdown">
            <button
              className="dropdown-btn"
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            >
              Change ▼
            </button>
            {isDropdownOpen && (
              <div className="dropdown-content">
                <button
                  onClick={() => {
                    setModalMode("modify");
                    setIsTestModalOpen(true);
                    setIsDropdownOpen(false);
                  }}
                >
                  Modify Test
                </button>
                <button
                  onClick={() => {
                    setIsDeleteModalOpen(true);
                    setIsDropdownOpen(false);
                  }}
                >
                  Delete Test
                </button>
              </div>
            )}
          </div>
          <button
            className="create-test-btn"
            onClick={() => {
              setModalMode("create");
              setIsTestModalOpen(true);
            }}
          >
            Create New Test
          </button>
        </div>
      </nav>
      <TestFormModal
        isOpen={isTestModalOpen}
        onClose={() => setIsTestModalOpen(false)}
        onSubmit={handleTestSubmit}
        mode={modalMode}
      />
      <DeleteTestModal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        onRefetch={onRefetch}
      />
    </>
  );
}

export default Navbar;
