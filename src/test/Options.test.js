import { render, fireEvent } from "@testing-library/react";

import Options from "../components/Options";

describe("renders the needed elements", () => {
  test("renders the file input", () => {
    const { getByTestId } = render(<Options />);
    expect(getByTestId("fileInput")).toBeInTheDocument();
  });

  test("renders break input", () => {
    const { getByTestId } = render(<Options />);
    expect(getByTestId("breakInput")).toBeInTheDocument();
  });

  test("renders filename input", () => {
    const { getByTestId } = render(<Options />);
    expect(getByTestId("filenameInput")).toBeInTheDocument();
  });

  test("renders the color picker", () => {
    const { getByTestId } = render(<Options />);
    expect(getByTestId("backgroundColorInput")).toBeInTheDocument();
  });
});

describe("handleFileChange", () => {
  test("sets the error when invalid extension", () => {
    // mock the setError function
    const setError = jest.fn();

    // mock the file
    const file = new File([""], "test.txt", { type: "text/plain" });

    // mock the event
    const event = {
      target: {
        files: [file],
      },
    };

    // render the component
    const { getByTestId } = render(<Options setError={setError} />);
    const fileInput = getByTestId("fileInput");

    // fire the event
    fireEvent.change(fileInput, event);

    // check if the function was called
    expect(setError).toHaveBeenCalledWith("Invalid file extension");
  });

  test("sets the file correctly", (done) => {
    // mock the setError function
    const setError = jest.fn();

    // mock the setData function
    const setData = jest.fn((data) => {
      // check if the setData function was called with the correct data
      const expectedData = [
        {
          TriangleSideLength: 100,
          CircleDiameter: 500,
          TriangleRGB: "255,0,0",
          CircleRGB: "0,255,0",
          duration: 1000,
          orientation: "N",
        },
      ];
      // expect(data.length).toEqual(expectedData.length);
      expect(data).toEqual(expectedData);
      done();
    });

    // mock the file
    const file = new File(
      [
        "TriangleSideLength;CircleDiameter;TriangleRGB;CircleRGB;duration;orientation;\n100;500;255,0,0;0,255,0;1000;N",
      ],
      "test.csv",
      {
        type: "text/csv",
      }
    );

    // mock the event
    const event = {
      target: {
        files: [file],
      },
    };

    // render the component
    const { getByTestId } = render(
      <Options setError={setError} setData={setData} />
    );

    const fileInput = getByTestId("fileInput");

    // fire the event
    fireEvent.change(fileInput, event);

    // check if the function was called only with null as argument
    setError.mock.calls.forEach((call) => {
      expect(call).toEqual([null]);
    });
  });
});

describe("handle normal input changes", () => {
  test("sets the break correctly", () => {
    const setBreak = jest.fn();
    const { getByTestId } = render(<Options setBreakInBetween={setBreak} />);
    const breakInput = getByTestId("breakInput");
    fireEvent.change(breakInput, { target: { value: "1000" } });
    expect(setBreak).toHaveBeenCalledWith("1000");
  });

  test("sets the filename correctly", () => {
    const setFilename = jest.fn();
    const { getByTestId } = render(<Options setFilename={setFilename} />);
    const filenameInput = getByTestId("filenameInput");
    fireEvent.change(filenameInput, { target: { value: "test" } });
    expect(setFilename).toHaveBeenCalledWith("test");
  });

  test("sets the background color correctly", () => {
    const setBackgroundColor = jest.fn();
    const { getByTestId } = render(
      <Options setBackgroundColor={setBackgroundColor} />
    );
    const backgroundColorInput = getByTestId("backgroundColorInput");
    fireEvent.change(backgroundColorInput, { target: { value: "#ffffff" } });
    expect(setBackgroundColor).toHaveBeenCalledWith("#ffffff");
  });
});
