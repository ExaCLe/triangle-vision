import "../css/Modal.css";
import TestForm from "./TestForm";

function TestFormModal({ isOpen, onClose, onSubmit, mode, defaultValues }) {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content sm:max-w-[500px]">
        <div className="modal-header">
          <h2 className="modal-title">
            {mode === "create" ? "Create New Test" : "Modify Test"}
          </h2>
          <p className="modal-description">
            {mode === "create"
              ? "Create a new vision test. Search bounds are configured when you start a run."
              : "Modify the existing vision test metadata."}
          </p>
        </div>
        <TestForm onSubmit={onSubmit} defaultValues={defaultValues} />
        <button className="modal-close" onClick={onClose}>
          ×
        </button>
      </div>
    </div>
  );
}

export default TestFormModal;
