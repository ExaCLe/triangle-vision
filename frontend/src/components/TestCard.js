import { Link } from "react-router-dom";

function TestCard({ test }) {
  const {
    id,
    name,
    description,
    triangleMin,
    triangleMax,
    saturationMin,
    saturationMax,
  } = test;

  return (
    <div className="card">
      <div className="card-header">
        <h3 className="card-title">{name}</h3>
        <p className="card-description">{description}</p>
      </div>
      <div className="card-content">
        <div className="text-sm">
          <span className="font-medium">Triangle Size:</span> {triangleMin} -{" "}
          {triangleMax}
        </div>
        <div className="text-sm">
          <span className="font-medium">Saturation:</span> {saturationMin} -{" "}
          {saturationMax}
        </div>
      </div>
      <div className="card-footer">
        <Link to={`/play-test/${id}`} className="btn btn-primary flex-1">
          <span className="icon">▶</span>
          Play Test
        </Link>
        <Link
          to={`/test-visualization/${id}`}
          className="btn btn-outline btn-icon"
        >
          <span className="icon">👁</span>
        </Link>
        <button className="btn btn-outline btn-icon">
          <span className="icon">⚙️</span>
        </button>
        <button className="btn btn-outline btn-icon">
          <span className="icon">🗑</span>
        </button>
      </div>
    </div>
  );
}

export default TestCard;
