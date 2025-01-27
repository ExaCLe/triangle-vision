import '../css/TestCard.css';
import { useNavigate, Link } from 'react-router-dom';

function TestCard({ test }) {
  const navigate = useNavigate();

  const handlePlayTest = () => {
    navigate(`/play-test/${test.id}`);
  };

  return (
    <div className="test-card">
      <h2>{test.title}</h2>
      <p>{test.description}</p>
      <div className="ranges">
        <p>Triangle Size: {test.min_triangle_size} - {test.max_triangle_size}</p>
        <p>Saturation: {test.min_saturation} - {test.max_saturation}</p>
      </div>
      <div className="test-card-actions">
        <Link to={`/play-test/${test.id}`} className="play-button">
          Play Test
        </Link>
        <Link to={`/test-visualization/${test.id}`} className="visualize-button">
          Visualize
        </Link>
      </div>
    </div>
  );
}

export default TestCard;
