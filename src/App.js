import "./css/App.css";
import { useEffect, useState, useRef } from "react";
import Content from "./components/Content";
import Options from "./components/Options";
import { CSVLink, CSVDownload } from "react-csv";
import { invertColor } from "./helpers";

const ARROW_UP = 38;
const ARROW_DOWN = 40;
const ARROW_LEFT = 37;
const ARROW_RIGHT = 39;

const startResults = {
  correct: 0,
  false: 0,
  history: [
    [
      "TriangleSideLength",
      "CircleDiameter",
      "TriangleRGB",
      "CircleRGB",
      "duration",
      "orientation",
      "answer",
      "answerTime",
    ],
  ],
};

function App() {
  // "options" = choosing options, "showTriangle" = showing triangle,
  // "waitResponse" = waiting for response,
  // "showCorrectAnswer" = showing correct answer,
  // "showIncorrectAnser" = showing incorrect answer,
  // "showFinalScore" = showing final score
  const [testing, setTesting] = useState("options");
  const [sideLength, setSideLength] = useState(200);
  const [diameter, setDiameter] = useState(500);
  const [colorTriangle, setColorTriangle] = useState("pink");
  const [colorCircle, setColorCircle] = useState("red");
  const [error, setError] = useState("");
  const [data, setData] = useState([]);
  const [index, setIndex] = useState(0);
  const [duration, setDuration] = useState(0);
  const [breakInBetween, setBreakInBetween] = useState(0);
  const [orientation, setOrientation] = useState("W");
  const [results, setResults] = useState(startResults);
  const [timer, setTimer] = useState(null);
  const [backgroundColor, setBackgroundColor] = useState("#000000");
  const [filename, setFilename] = useState("results.csv");
  const [startTime, setStartTime] = useState(null);
  const [answerTime, setAnswerTime] = useState(0);

  const reset = () => {
    setResults(startResults);
    setIndex(0);
    setTesting("options");
    setData([]);
  };

  const ref = useRef(null);

  const showNewTriangle = () => {
    setTesting("showTriangle");
    setStartTime(new Date());
    setTimer(
      setTimeout(() => {
        setTesting("waitResponse");
      }, duration)
    );
  };

  const startTest = () => {
    if (data.length === 0) {
      return;
    }
    showNewTriangle();
  };

  useEffect(() => {
    if (data.length > 0) {
      setSideLength(data[index].TriangleSideLength);
      setDiameter(data[index].CircleDiameter);
      setColorCircle(`rgb(${data[index].CircleRGB})`);
      setColorTriangle(`rgb(${data[index].TriangleRGB})`);
      setOrientation(data[index].orientation);
      setDuration(data[index].duration);
    }
  }, [data, index]);

  useEffect(() => {
    ref.current.focus();
  }, [testing]);

  const handleKeyDown = (e) => {
    const code = e.keyCode;
    if (testing !== "waitResponse" && testing !== "showTriangle") return;
    clearTimeout(timer);
    const responseTime = new Date() - startTime;
    setAnswerTime(responseTime);
    let answer = undefined;
    if (code === ARROW_UP) {
      if (orientation === "N") answer = "correct";
      else answer = "false";
    } else if (code === ARROW_DOWN) {
      if (orientation === "S") answer = "correct";
      else answer = "false";
    } else if (code === ARROW_LEFT) {
      if (orientation === "W") answer = "correct";
      else answer = "false";
    } else if (code === ARROW_RIGHT) {
      if (orientation === "E") answer = "correct";
      else answer = "false";
    }
    let falseAnswer = 0,
      correctAnswer = 0;
    if (answer === "correct") {
      setTesting("showCorrectAnswer");
      correctAnswer++;
    }
    if (answer === "false") {
      setTesting("showIncorrectAnswer");
      falseAnswer++;
    }
    if (answer === "correct" || answer === "false") {
      setResults({
        ...results,
        correct: results.correct + correctAnswer,
        false: results.false + falseAnswer,
        history: [
          ...results.history,
          [
            sideLength,
            diameter,
            colorTriangle,
            colorCircle,
            duration,
            orientation,
            "correct",
            responseTime,
          ],
        ],
      });
    }
    if (answer !== undefined) {
      if (index === data.length - 1) {
        setTesting("showFinalScore");
      } else {
        setIndex(index + 1);
        setTimeout(() => {
          showNewTriangle();
        }, breakInBetween);
      }
    }
  };

  let content;
  if (testing === "showTriangle") {
    content = (
      <Content
        sideLength={sideLength}
        diameter={diameter}
        colorTriangle={colorTriangle}
        colorCircle={colorCircle}
        orientation={orientation}
      ></Content>
    );
  } else if (testing === "options") {
    content = (
      <Options
        setData={setData}
        setError={setError}
        startTest={startTest}
        setDuration={setDuration}
        duration={duration}
        setBreakInBetween={setBreakInBetween}
        breakInBetween={breakInBetween}
        setBackgroundColor={setBackgroundColor}
        backgroundColor={backgroundColor}
        setFilename={setFilename}
        filename={filename}
      ></Options>
    );
  } else if (testing === "waitResponse") {
    content = <p style={{ fontSize: 50 }}>?</p>;
  } else if (testing === "showCorrectAnswer") {
    content = (
      <p style={{ color: "green", fontSize: 100 }}>
        &#10003; Correct! {answerTime} ms.
      </p>
    );
  } else if (testing === "showIncorrectAnswer") {
    content = (
      <p style={{ color: "red", fontSize: 100 }}>
        &#10060; Incorrect! {answerTime} ms.
      </p>
    );
  } else if (testing === "showFinalScore") {
    const score = Math.round((results.correct / data.length) * 100);
    content = (
      <div className="container">
        <p>
          You got {results.correct} correct and {results.false} incorrect.
        </p>
        <p
          style={{
            color: score >= 75 ? "green" : "red",
          }}
        >
          You got {score} % correct.
        </p>
        <button onClick={reset}>Restart</button>
        <CSVLink
          style={{
            color: invertColor(backgroundColor),
            paddingTop: 10,
          }}
          data={results.history}
          filename="results.csv"
        >
          Download Results
        </CSVLink>
      </div>
    );
  }

  return (
    <div
      id="rootDiv"
      onKeyDown={handleKeyDown}
      tabIndex={0}
      ref={ref}
      style={{
        backgroundColor: backgroundColor,
        color: invertColor(backgroundColor),
      }}
    >
      {content}
    </div>
  );
}

export default App;
