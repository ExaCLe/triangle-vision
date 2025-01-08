import '../css/TestCard.css';

function TestCard({ test }) {
  return (
    <div className="test-card">
      <h2>{test.title}</h2>
      <p>{test.description}</p>
      <div className="ranges">
        <p>Triangle Size: {test.min_triangle_size} - {test.max_triangle_size}</p>
        <p>Saturation: {test.min_saturation} - {test.max_saturation}</p>
      </div>
      <button className="play-button" onClick={() => console.log(`Start test ${test.id}`)}>
        Play Test
      </button>
    </div>
  );
}

export default TestCard;
