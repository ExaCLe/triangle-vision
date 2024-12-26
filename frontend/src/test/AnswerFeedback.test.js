import { getByText, render } from "@testing-library/react";

import AnswerFeedback from "../components/AnswerFeedback";

test("renders correct text in green", () => {
  const { getByTestId } = render(<AnswerFeedback answerWasCorrect={true} />);
  expect(getByTestId("answerFeedback")).toHaveStyle("color: green");
  // check for the correct text
  expect(getByTestId("answerFeedback")).toHaveTextContent("Correct!");
});

test("renders incorrect text in red", () => {
  const { getByTestId } = render(<AnswerFeedback answerWasCorrect={false} />);
  expect(getByTestId("answerFeedback")).toHaveStyle("color: red");
  // check for the correct text
  expect(getByTestId("answerFeedback")).toHaveTextContent("Incorrect!");
});

test("renders the reaction time", () => {
  const { getByTestId } = render(
    <AnswerFeedback answerWasCorrect={true} answerTime={1000} />
  );
  // check for the correct text
  expect(getByTestId("answerFeedback")).toHaveTextContent("1000 ms");
});
