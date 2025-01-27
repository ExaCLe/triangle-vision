import { useState, useEffect, useCallback } from "react";
import "../css/Modal.css";

function TestFormModal({
  isOpen,
  onClose,
  onSubmit,
  mode = "create",
  initialTest = null,
}) {
  const [tests, setTests] = useState([]);
  const [selectedTest, setSelectedTest] = useState(null);
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    min_triangle_size: 5.0,
    max_triangle_size: 100.0,
    min_saturation: 0.05,
    max_saturation: 0.8,
  });

  useEffect(() => {
    if (isOpen && mode === "modify") {
      fetchTests();
    }
    if (initialTest) {
      setFormData(initialTest);
    }
  }, [isOpen, initialTest]);

  const fetchTests = async () => {
    try {
      const response = await fetch("http://localhost:8000/tests/");
      const data = await response.json();
      setTests(data);
    } catch (error) {
      console.error("Error fetching tests:", error);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    await onSubmit(formData, selectedTest?.id);
    onClose();
  };

  // Handle click outside
  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  // Handle escape key
  const handleEscape = useCallback(
    (e) => {
      if (e.key === "Escape") {
        onClose();
      }
    },
    [onClose]
  );

  useEffect(() => {
    if (isOpen) {
      document.addEventListener("keydown", handleEscape);
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = "unset";
    };
  }, [isOpen, handleEscape]);

  if (!isOpen) return null;

  return (
    <div
      className="modal-overlay"
      onClick={handleOverlayClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <div className="modal-content">
        <button
          className="modal-close"
          onClick={onClose}
          aria-label="Close modal"
        >
          ×
        </button>
        <h2 id="modal-title">
          {mode === "create" ? "Create New Test" : "Modify Test"}
        </h2>
        {mode === "modify" && (
          <div className="test-list">
            {tests.map((test) => (
              <div
                key={test.id}
                className={`test-item ${
                  selectedTest?.id === test.id ? "selected" : ""
                }`}
                onClick={() => {
                  setSelectedTest(test);
                  setFormData(test);
                }}
              >
                {test.title}
              </div>
            ))}
          </div>
        )}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Title:</label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) =>
                setFormData({ ...formData, title: e.target.value })
              }
              required
            />
          </div>
          <div className="form-group">
            <label>Description:</label>
            <textarea
              value={formData.description}
              onChange={(e) =>
                setFormData({ ...formData, description: e.target.value })
              }
              required
            />
          </div>
          <div className="form-group range-inputs">
            <label>Triangle Size Range:</label>
            <div className="range-container">
              <input
                type="number"
                step="0.1"
                value={formData.min_triangle_size}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    min_triangle_size: parseFloat(e.target.value),
                  })
                }
                required
              />
              <span>to</span>
              <input
                type="number"
                step="0.1"
                value={formData.max_triangle_size}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    max_triangle_size: parseFloat(e.target.value),
                  })
                }
                required
              />
            </div>
          </div>
          <div className="form-group range-inputs">
            <label>Saturation Range:</label>
            <div className="range-container">
              <input
                type="text"
                value={formData.min_saturation}
                onChange={(e) => {
                  const value = e.target.value;
                  if (
                    value === "" ||
                    (!isNaN(value) &&
                      parseFloat(value) >= 0 &&
                      parseFloat(value) <= 1)
                  ) {
                    setFormData({
                      ...formData,
                      min_saturation: value === "" ? value : parseFloat(value),
                    });
                  }
                }}
                required
              />
              <span>to</span>
              <input
                type="text"
                value={formData.max_saturation}
                onChange={(e) => {
                  const value = e.target.value;
                  if (
                    value === "" ||
                    (!isNaN(value) &&
                      parseFloat(value) >= 0 &&
                      parseFloat(value) <= 1)
                  ) {
                    setFormData({
                      ...formData,
                      max_saturation: value === "" ? value : parseFloat(value),
                    });
                  }
                }}
                required
              />
            </div>
          </div>
          <div className="modal-buttons">
            <button type="submit">
              {mode === "create" ? "Create" : "Save Changes"}
            </button>
            <button type="button" onClick={onClose}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default TestFormModal;
