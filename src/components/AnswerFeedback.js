function AnswerFeedback({ answerWasCorrect, answerTime }) {
  const color = answerWasCorrect ? "green" : "red";
  const text = answerWasCorrect ? "✓ Correct!" : "❌ Incorrect!";
  return (
    <p style={{ color: color, fontSize: 100 }}>
      {text} {answerTime} ms.
    </p>
  );
}

export default AnswerFeedback;
