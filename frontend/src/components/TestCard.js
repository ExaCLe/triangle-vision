import { Link } from "react-router-dom";

const formatNumber = (value, maxFractionDigits) =>
  Number(value).toLocaleString(undefined, {
    maximumFractionDigits: maxFractionDigits,
  });

function TestCard({ test, onEdit, onDelete, onPlay }) {
  const {
    id,
    title,
    description,
    min_triangle_size,
    max_triangle_size,
    min_saturation,
    max_saturation,
  } = test;
  const hasStoredBounds = [
    min_triangle_size,
    max_triangle_size,
    min_saturation,
    max_saturation,
  ].every((v) => v !== null && v !== undefined);

  return (
    <div className="card">
      <div className="card-header">
        <h3 className="card-title">{title}</h3>
        <p className="card-description">{description}</p>
      </div>
      <div className="card-content">
        <div className="card-meta">
          <div className="card-meta-item">
            <span className="card-meta-label">Bounds</span>
            <span className="card-meta-value">
              {hasStoredBounds
                ? (
                  <>
                    <span className="bounds-line">
                      <span className="bounds-key">Size</span>
                      <span>
                        {formatNumber(min_triangle_size, 2)} -{" "}
                        {formatNumber(max_triangle_size, 2)}
                      </span>
                    </span>
                    <span className="bounds-line">
                      <span className="bounds-key">Sat</span>
                      <span>
                        {formatNumber(min_saturation, 3)} -{" "}
                        {formatNumber(max_saturation, 3)}
                      </span>
                    </span>
                  </>
                )
                : "Set when starting a run"}
            </span>
          </div>
        </div>
      </div>
      <div className="card-footer">
        <button
          className="btn btn-accent flex-1"
          onClick={() => onPlay(test)}
        >
          <span className="play-icon">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="5,3 19,12 5,21" />
            </svg>
          </span>
          Run Test
        </button>
        <Link
          to={`/test-visualization/${id}`}
          className="btn btn-outline btn-icon"
          title="View results"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="20" x2="18" y2="10" />
            <line x1="12" y1="20" x2="12" y2="4" />
            <line x1="6" y1="20" x2="6" y2="14" />
          </svg>
        </Link>
        <button
          className="btn btn-outline btn-icon"
          onClick={() => onEdit(test)}
          title="Edit test"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
          </svg>
        </button>
        <button
          className="btn btn-outline btn-icon"
          onClick={() => onDelete(test)}
          title="Delete test"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          </svg>
        </button>
      </div>
    </div>
  );
}

export default TestCard;
