import { CSVLink, CSVDownload } from "react-csv";
import { invertColor } from "../helpers";

function FinalScore({
  correct,
  incorrect,
  backgroundColor,
  history,
  filename,
  resetApp,
}) {
  const score = Math.round((correct / (correct + incorrect)) * 100);
  return (
    <div className="container">
      <p>
        You got {correct} correct and {incorrect} incorrect.
      </p>
      <p
        style={{
          color: score >= 75 ? "green" : "red",
        }}
      >
        You got {score} % correct.
      </p>
      <button onClick={resetApp}>Restart</button>
      <CSVLink
        style={{
          color: invertColor(backgroundColor),
          paddingTop: 10,
        }}
        data={history}
        filename={filename}
      >
        Download Results
      </CSVLink>
    </div>
  );
}

export default FinalScore;
