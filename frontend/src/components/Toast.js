function Toast({ toast, onDismiss }) {
  if (!toast) return null;

  return (
    <div className="toast-stack" aria-live="polite" aria-atomic="true">
      <div className={`toast toast-${toast.type || "info"}`} role="status">
        <span className="toast-message">{toast.message}</span>
        <button className="toast-close" onClick={onDismiss} aria-label="Dismiss notification">
          ×
        </button>
      </div>
    </div>
  );
}

export default Toast;
