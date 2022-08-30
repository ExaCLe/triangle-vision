import { render } from "@testing-library/react";

import Content from "./Content";

test("renders a circle", () => {
  const { getByTestId } = render(
    <Content
      sideLength={10}
      diameter={30}
      colorCircle={"#fff"}
      colorTriangle={"#000"}
      orientation="N"
    />
  );
  expect(getByTestId("circle")).toBeInTheDocument();
});

test("renders a triangle", () => {
  const { getByTestId } = render(
    <Content
      sideLength={10}
      diameter={30}
      colorCircle={"#fff"}
      colorTriangle={"#000"}
      orientation="N"
    />
  );
  expect(getByTestId("triangleN")).toBeInTheDocument();
});
