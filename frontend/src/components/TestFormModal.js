import { useState, useEffect, useCallback } from "react";
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
              ? "Create a new vision test by filling out the form below."
              : "Modify the existing vision test by updating the form below."}
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
