import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import Content from './Content';
import AnswerFeedback from './AnswerFeedback';

function PlayTest() {
  const { testId } = useParams();
  const [currentTest, setCurrentTest] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [startTime, setStartTime] = useState(null);

  const hslToRgb = (h, s, l) => {
    // Convert saturation and lightness to decimal
    s /= 100;
    l /= 100;
    
    // Edge case - achromatic (gray) if saturation is 0
    if (s === 0) {
      const v = Math.round(l * 255);
      return `rgb(${v}, ${v}, ${v})`;
    }

    const k = n => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));

    const r = Math.round(255 * f(0));
    const g = Math.round(255 * f(8));
    const b = Math.round(255 * f(4));

    return `rgb(${r}, ${g}, ${b})`;
  };

  const fetchNextCombination = async () => {
    try {
      const response = await fetch(`http://localhost:8000/test-combinations/next/${testId}`);
      const data = await response.json();
      setCurrentTest(data);
      setStartTime(Date.now());
      setFeedback(null);
    } catch (error) {
      console.error('Error fetching next combination:', error);
    }
  };

  const submitResult = async (success) => {
    if (!currentTest) return;

    const answerTime = Date.now() - startTime;

    try {
      await fetch('http://localhost:8000/test-combinations/result', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...currentTest,
          success: success ? 1 : 0
        })
      });

      setFeedback({
        correct: success,
        time: answerTime
      });

      // Fetch next combination after a brief delay to show feedback
      setTimeout(() => {
        fetchNextCombination();
      }, 1000);

    } catch (error) {
      console.error('Error submitting result:', error);
    }
  };

  useEffect(() => {
    fetchNextCombination();
  }, [testId]);

  const handleKeyPress = (event) => {
    if (!feedback) {  // Only accept input if not showing feedback
      const orientation = currentTest?.orientation;
      let success = false;

      switch (event.key) {
        case 'ArrowUp':
          success = orientation === 'N';
          break;
        case 'ArrowRight':
          success = orientation === 'E';
          break;
        case 'ArrowDown':
          success = orientation === 'S';
          break;
        case 'ArrowLeft':
          success = orientation === 'W';
          break;
        default:
          return; // ignore other keys
      }

      // Only submit if an arrow key was pressed
      if (['ArrowUp', 'ArrowRight', 'ArrowDown', 'ArrowLeft'].includes(event.key)) {
        submitResult(success);
      }
    }
  };

  useEffect(() => {
    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [currentTest, feedback]);

  console.log(currentTest?.saturation)
  return (
    <div className="play-test-container">
      {feedback ? (
        <AnswerFeedback 
          answerWasCorrect={feedback.correct}
          answerTime={feedback.time}
        />
      ) : currentTest ? (
        <Content
          sideLength={currentTest.triangle_size}
          diameter={200}
          colorCircle="#1a1a1a"
          colorTriangle={hslToRgb(0, 0, currentTest.saturation * 100)}
          orientation={currentTest.orientation}
        />
      ) : (
        <div>Loading...</div>
      )}
    </div>
  );
}

export default PlayTest;
