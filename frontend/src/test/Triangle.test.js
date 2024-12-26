import { render } from "@testing-library/react";
import Triangle from "../components/Triangle";

function extractFloatFromPx(str) {
  return parseFloat(str.replace("px", ""));
}

describe("displays a triangle in every orientation", () => {
  test("displays a triangle in north direction and is oriented north", () => {
    const { getByTestId } = render(
      <Triangle
        orientation="N"
        sideLength={10}
        diameter={30}
        color={"#ffffff"}
      />
    );
    expect(getByTestId("triangleN")).toBeInTheDocument();
    const element = getByTestId("triangleN");

    // check the triangle sizes
    expect(element.style.borderBottomColor).toBe("#ffffff");
    const acutalBorderWidth = extractFloatFromPx(
      element.style.borderBottomWidth
    );
    expect(acutalBorderWidth).toBeCloseTo(8.6602540378);
    const actualBorderRight = extractFloatFromPx(
      element.style.borderRightWidth
    );
    expect(actualBorderRight).toBeCloseTo(5);
    const acutalBorderLeft = extractFloatFromPx(element.style.borderLeftWidth);
    expect(acutalBorderLeft).toBeCloseTo(5);

    // check the triangle position
    const actualTop = extractFloatFromPx(element.style.top);
    expect(actualTop).toBeCloseTo(8.840142);
    const actualLeft = extractFloatFromPx(element.style.left);
    expect(actualLeft).toBeCloseTo(10);
  });

  test("displays a triangle in south direction and is oriented south", () => {
    const { getByTestId } = render(
      <Triangle
        orientation="S"
        sideLength={10}
        diameter={30}
        color={"#ffffff"}
      />
    );
    expect(getByTestId("triangleS")).toBeInTheDocument();
    const element = getByTestId("triangleS");

    // check the triangle sizes
    expect(element.style.borderTopColor).toBe("#ffffff");
    const acutalBorderWidth = extractFloatFromPx(element.style.borderTopWidth);
    expect(acutalBorderWidth).toBeCloseTo(8.6602540378);
    const actualBorderRight = extractFloatFromPx(
      element.style.borderRightWidth
    );
    expect(actualBorderRight).toBeCloseTo(5);
    const acutalBorderLeft = extractFloatFromPx(element.style.borderLeftWidth);
    expect(acutalBorderLeft).toBeCloseTo(5);

    // check the triangle position
    const actualTop = extractFloatFromPx(element.style.top);
    expect(actualTop).toBeCloseTo(12.499858);
    const actualLeft = extractFloatFromPx(element.style.left);
    expect(actualLeft).toBeCloseTo(10);
  });

  test("displays a triangle in east direction and in the correct orientation", () => {
    const { getByTestId } = render(
      <Triangle
        orientation="E"
        sideLength={10}
        diameter={30}
        color={"#ffffff"}
      />
    );
    expect(getByTestId("triangleE")).toBeInTheDocument();
    const element = getByTestId("triangleE");

    // check the triangle sizes
    expect(element.style.borderLeftColor).toBe("#ffffff");
    const acutalBorderWidth = extractFloatFromPx(element.style.borderTopWidth);
    expect(acutalBorderWidth).toBeCloseTo(5);
    const actualBorderBottom = extractFloatFromPx(
      element.style.borderBottomWidth
    );
    expect(actualBorderBottom).toBeCloseTo(5);
    const actualBorderLeft = extractFloatFromPx(element.style.borderLeftWidth);
    expect(actualBorderLeft).toBeCloseTo(8.6602540378);

    // check the triangle position
    const actualTop = extractFloatFromPx(element.style.top);
    expect(actualTop).toBeCloseTo(10);
    const actualLeft = extractFloatFromPx(element.style.left);
    expect(actualLeft).toBeCloseTo(12.499858);
  });

  test("displays a triangle in west direction and displays it in the correct orientation", () => {
    const { getByTestId } = render(
      <Triangle
        orientation="W"
        sideLength={10}
        diameter={30}
        color={"#ffffff"}
      />
    );
    expect(getByTestId("triangleW")).toBeInTheDocument();
    const element = getByTestId("triangleW");

    // check the triangle sizes
    expect(element.style.borderRightColor).toBe("#ffffff");
    const acutalBorderWidth = extractFloatFromPx(
      element.style.borderRightWidth
    );
    expect(acutalBorderWidth).toBeCloseTo(8.6602540378);
    const actualBorderBottom = extractFloatFromPx(
      element.style.borderBottomWidth
    );
    expect(actualBorderBottom).toBeCloseTo(5);
    const actualBorderLeft = extractFloatFromPx(element.style.borderTopWidth);
    expect(actualBorderLeft).toBeCloseTo(5);

    // check the triangle position
    const actualTop = extractFloatFromPx(element.style.top);
    expect(actualTop).toBeCloseTo(10);
    const actualLeft = extractFloatFromPx(element.style.left);
    expect(actualLeft).toBeCloseTo(8.840142);
  });
});
