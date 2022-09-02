import { render, screen, fireEvent } from "@testing-library/react";
import App from "./App";

test("renders the options", () => {
  render(<App />);
  expect(screen.getByTestId("fileInput")).toBeInTheDocument();
  expect(screen.getByTestId("breakInput")).toBeInTheDocument();
  expect(screen.getByTestId("filenameInput")).toBeInTheDocument();
  expect(screen.getByTestId("backgroundColorInput")).toBeInTheDocument();
  expect(screen.getByText("Start")).toBeInTheDocument();
});

test("shows the content with the triangle after the file input", () => {
  render(<App />);
  // input the file
  const fileInput = screen.getByTestId("fileInput");
  fireEvent.change(fileInput, {
    target: {
      files: [
        new File(
          [
            "TriangleSideLength;CircleDiameter;TriangleRGB;CircleRGB;duration;orientation;\n100;500;255,0,0;0,255,0;10000;N",
          ],
          "test.csv",
          { type: "text/csv" }
        ),
      ],
    },
  });

  // click the start button
  const startButton = screen.getByText("Start");
  fireEvent.click(startButton);

  // check if the triangle is shown
  expect(screen.getByTestId("triangleN")).toBeInTheDocument();

  // check if the content is shown
  expect(screen.getByTestId("circle")).toBeInTheDocument();
});
