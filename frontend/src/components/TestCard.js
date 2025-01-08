import '../css/TestCard.css';

function TestCard({ test }) {
  return (
    <div className="test-card">
      <h2>{test.name}</h2>
      <p>{test.description}</p>
      <button className="play-button" onClick={() => console.log(`Start test ${test.id}`)}>
        Play Test
      </button>
    </div>
  );
}

export default TestCard;
