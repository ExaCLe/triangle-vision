import { Link } from "react-router-dom";

function TestCard({ test, onEdit, onDelete }) {
  const {
    id,
    title,
    description,
    min_triangle_size,
    max_triangle_size,
    min_saturation,
    max_saturation,
  } = test;

  const handleDelete = async () => {
    if (window.confirm("Are you sure you want to delete this test?")) {
      onDelete(id);
    }
  };

  return (
    <div className="card">
      <div className="card-header">
        <h3 className="card-title">{title}</h3>
        <p className="card-description">{description}</p>
      </div>
      <div className="card-content">
        <div className="text-sm">
          <span className="font-medium">Triangle Size:</span>{" "}
          {min_triangle_size} - {max_triangle_size}
        </div>
        <div className="text-sm">
          <span className="font-medium">Saturation:</span> {min_saturation} -{" "}
          {max_saturation}
        </div>
      </div>
      <div className="card-footer">
        <Link to={`/play-test/${id}`} className="btn btn-primary flex-1">
          <span className="icon play-icon">▶</span>
          Play Test
        </Link>
        <Link
          to={`/test-visualization/${id}`}
          className="btn btn-outline btn-icon"
        >
          <span className="icon">📊</span>
        </Link>
        <button
          className="btn btn-outline btn-icon"
          onClick={() => onEdit(test)}
        >
          <span className="icon">⚙️</span>
        </button>
        <button className="btn btn-outline btn-icon" onClick={handleDelete}>
          <span className="icon">🗑</span>
        </button>
      </div>
    </div>
  );
}

export default TestCard;
