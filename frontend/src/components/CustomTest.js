import "../css/App.css";
import {useEffect, useState, useRef} from "react";
import Content from "./Content";
import Options from "./Options";
import {invertColor} from "../helpers";
import {
    APP_STATE,
    startResults,
    ARROW_UP,
    ARROW_DOWN,
    ARROW_LEFT,
    ARROW_RIGHT,
} from "../AppConstants";
import FinalScore from "./FinalScore";
import AnswerFeedback from "./AnswerFeedback";
import ResetWindow from "./ResetWindow";

const {
    OPTIONS,
    SHOW_TRIANGLE,
    WAIT_FOR_ANSWER,
    SHOW_ANSWER,
    RESET_WINDOW,
    SHOW_FINAL_SCORE,
} = APP_STATE;

function CustomTest() {
    // internal state
    const [appState, setAppState] = useState(OPTIONS);
    const [error, setError] = useState("");
    const [index, setIndex] = useState(0);
    const [triangleTimer, setTimer] = useState(null);

    // testing properties
    const [duration, setDuration] = useState(0);
    const [breakInBetween, setBreakInBetween] = useState(0);

    // collected testing data
    const [results, setResults] = useState(startResults);
    const [answerTime, setAnswerTime] = useState(0);
    const [answerWasCorrect, setAnswerWasCorrect] = useState(false);
    const [startTime, setStartTime] = useState(null);

    // other options
    const [backgroundColor, setBackgroundColor] = useState("#000000");
    const [filename, setFilename] = useState("results.csv");

    // Triangle and Circle properties
    const [data, setData] = useState([]);
    const [orientation, setOrientation] = useState("W");
    const [sideLength, setSideLength] = useState(200);
    const [diameter, setDiameter] = useState(500);
    const [colorTriangle, setColorTriangle] = useState("pink");
    const [colorCircle, setColorCircle] = useState("red");

    // Change listener for the index and data to update the triangle and circle in the state/UI
    useEffect(() => {
        if (data.length > 0) {
            const dataSet = data[index];
            setSideLength(dataSet.TriangleSideLength);
            setDiameter(dataSet.CircleDiameter);
            setColorCircle(`rgb(${dataSet.CircleRGB})`);
            setColorTriangle(`rgb(${dataSet.TriangleRGB})`);
            setOrientation(dataSet.orientation);
            setDuration(dataSet.duration);
        }
    }, [data, index]);

    // Gets the focus on the window to listen for key presses
    useEffect(() => {
        ref.current.focus();
    }, [appState]);

    /**
     * Resets the state of the app to the initial state
     */
    const resetApp = () => {
        setResults(startResults);
        setIndex(0);
        setAppState(OPTIONS);
        setData([]);
    };

    const ref = useRef(null);

    /**
     * Sets a timer and records the current time before changing the app state. This is only done if the data is not empty.
     */
    const startTest = () => {
        if (data.length === 0) {
            return;
        }
        setAppState(SHOW_TRIANGLE);
        setStartTime(new Date());
        setTimer(
            setTimeout(() => {
                setAppState(WAIT_FOR_ANSWER);
            }, duration)
        );
    };

    /**
     * Handles the logic of the key presses to get to the next triangle question if the app is in the correct state.
     *
     * If the app is not in the correct state, it will not do anything.
     * If no arrow key is pressed, it will not do anything.
     * @param {Event} e the keyboard event
     */
    const handleKeyDown = (e) => {
        const code = e.keyCode;

        // do nothing if the app is not in the correct state or if the key pressed is not an arrow key
        if (appState !== WAIT_FOR_ANSWER && appState !== SHOW_TRIANGLE) return;
        if (
            code !== ARROW_UP &&
            code !== ARROW_DOWN &&
            code !== ARROW_LEFT &&
            code !== ARROW_RIGHT
        )
            return;

        // the timer for hiding the triangle is not needed anymore
        clearTimeout(triangleTimer);

        // measure the response time
        const responseTime = new Date() - startTime;
        setAnswerTime(responseTime);

        // figure out if the answer was correct
        let correct = false;
        if (code === ARROW_UP && orientation === "N") {
            correct = true;
        } else if (code === ARROW_DOWN && orientation === "S") {
            correct = true;
        } else if (code === ARROW_LEFT && orientation === "W") {
            correct = true;
        } else if (code === ARROW_RIGHT && orientation === "E") {
            correct = true;
        }

        // update the state to show the correctness of the answer to the user
        setAppState(SHOW_ANSWER);
        setAnswerWasCorrect(correct);

        // reset window to avoid ghost image
        setAppState(RESET_WINDOW);

        // record the results for later export
        setResults({
            ...results,
            correct: results.correct + (correct ? 1 : 0),
            false: results.false + (correct ? 0 : 1),
            history: [
                ...results.history,
                [
                    sideLength,
                    diameter,
                    colorTriangle,
                    colorCircle,
                    duration,
                    orientation,
                    correct,
                    responseTime,
                ],
            ],
        });

        // show the next triangle or the final score if there are no more triangles
        if (index === data.length - 1) {
            setAppState(SHOW_FINAL_SCORE);
        } else {
            setIndex(index + 1);
            setTimeout(() => {
                startTest();
            }, breakInBetween);
        }
    };

    // determine the content to show based on the app state
    let content;
    if (appState === SHOW_TRIANGLE) {
        content = (
            <Content
                sideLength={sideLength}
                diameter={diameter}
                colorTriangle={colorTriangle}
                colorCircle={colorCircle}
                orientation={orientation}
            ></Content>
        );
    } else if (appState === OPTIONS) {
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
    } else if (appState === WAIT_FOR_ANSWER) {
        content = <p style={{fontSize: 50}}>?</p>;
    } else if (appState === SHOW_ANSWER) {
        content = (
            <AnswerFeedback
                answerWasCorrect={answerWasCorrect}
                answerTime={answerTime}
            />
        );
    } else if (appState === RESET_WINDOW) {
        content = (
            <ResetWindow/>
        );
    } else if (appState === SHOW_FINAL_SCORE) {
        content = (
            <FinalScore
                correct={results.correct}
                incorrect={results.false}
                backgroundColor={backgroundColor}
                history={results.history}
                filename={filename}
                resetApp={resetApp}
            />
        );
    }

    // wrap the content for better styling and to listen for key presses
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

export default CustomTest;
