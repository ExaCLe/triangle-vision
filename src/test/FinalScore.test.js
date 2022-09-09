import { render } from "@testing-library/react";

import FinalScore from "../components/FinalScore";

test("renders a download button", () => {
  const { getByText } = render(
    <FinalScore
      correct={0}
      incorrect={0}
      backgroundColor={"#fff"}
      history={[]}
      filename={"results.csv"}
      resetApp={() => {}}
    />
  );
  expect(getByText("Download Results")).toBeInTheDocument();
});

test("renders a restart button", () => {
  const { getByText } = render(
    <FinalScore
      correct={0}
      incorrect={0}
      backgroundColor={"#fff"}
      history={[]}
      filename={"results.csv"}
      resetApp={() => {}}
    />
  );
  expect(getByText("Restart")).toBeInTheDocument();
});

test("renders the correct score", () => {
  const { getByText } = render(
    <FinalScore
      correct={13}
      incorrect={7}
      backgroundColor={"#fff"}
      history={[]}
      filename={"results.csv"}
      resetApp={() => {}}
    />
  );
  expect(getByText("You got 65 % correct.")).toBeInTheDocument();
});

test("score has the correct color based on the success rate", () => {
  const { getByText } = render(
    <FinalScore
      correct={13}
      incorrect={7}
      backgroundColor={"#fff"}
      history={[]}
      filename={"results.csv"}
      resetApp={() => {}}
    />
  );
  expect(getByText("You got 65 % correct.")).toHaveStyle("color: red");

  const { getByText: getByText2 } = render(
    <FinalScore
      correct={13}
      incorrect={3}
      backgroundColor={"#fff"}
      history={[]}
      filename={"results.csv"}
      resetApp={() => {}}
    />
  );
  expect(getByText2("You got 81 % correct.")).toHaveStyle("color: green");
});
