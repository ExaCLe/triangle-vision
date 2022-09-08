import { render, screen, fireEvent } from "@testing-library/react";
import App from "../App";

test("renders the options", () => {
  render(<App />);
  expect(screen.getByTestId("fileInput")).toBeInTheDocument();
  expect(screen.getByTestId("breakInput")).toBeInTheDocument();
  expect(screen.getByTestId("filenameInput")).toBeInTheDocument();
  expect(screen.getByTestId("backgroundColorInput")).toBeInTheDocument();
  expect(screen.getByText("Start")).toBeInTheDocument();
});
