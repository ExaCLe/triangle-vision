import '../css/TestCard.css';
import { useNavigate } from 'react-router-dom';

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
      <button className="play-button" onClick={handlePlayTest}>
        Play Test
      </button>
    </div>
  );
}

export default TestCard;
