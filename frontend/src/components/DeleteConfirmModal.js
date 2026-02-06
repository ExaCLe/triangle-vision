import { useEffect } from "react";

function DeleteConfirmModal({ isOpen, test, isDeleting, onCancel, onConfirm }) {
  useEffect(() => {
    if (!isOpen) return undefined;

    const handleEscape = (event) => {
      if (event.key === "Escape" && !isDeleting) {
        onCancel();
      }
    };

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [isOpen, isDeleting, onCancel]);

  if (!isOpen || !test) return null;

  return (
    <div className="modal-overlay" onClick={!isDeleting ? onCancel : undefined}>
      <div className="modal-content delete-confirm-modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onCancel} disabled={isDeleting}>
          ×
        </button>
        <div className="modal-header">
          <h2 className="modal-title">Delete test?</h2>
          <p className="modal-description">
            This will permanently remove <strong>{test.title}</strong> and all associated run history.
          </p>
        </div>
        <div className="modal-actions">
          <button className="btn btn-outline" onClick={onCancel} disabled={isDeleting}>
            Cancel
          </button>
          <button className="btn btn-accent btn-danger" onClick={onConfirm} disabled={isDeleting}>
            {isDeleting ? "Deleting..." : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default DeleteConfirmModal;
