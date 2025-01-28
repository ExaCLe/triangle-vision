import { Component } from "react";
import { parse } from "papaparse";

const allowedExtensions = ["csv"];

class Options extends Component {
  state = {};

  constructor(props) {
    super(props);
  }

  /**
   * Checks for correct file extension and gets the file content
   * @param {Event} e
   */
  handleFileChange = (e) => {
    this.props.setError(null);
    if (e.target.files.length) {
      const inputFile = e.target.files[0];

      // assure the correct file type
      const fileExtension = inputFile?.type.split("/")[1];
      if (!allowedExtensions.includes(fileExtension)) {
        this.props.setError("Invalid file extension");
        return;
      }

      this.parseFile(inputFile, (results) => {
        // ignore empty rows
        results.data = results.data.filter((row) => {
          return Object.values(row).some((value) => value !== null && value !== "");
        });
        this.props.setData(results.data);
      });
    }
  };

  /**
   * Parses the csv file and calls the callback function on success.
   * @param {File} file the file object to parse
   * @param {ResultsCallback} onComplete function that is called with the parsed results as argument
   */
  parseFile = (file, onComplete) => {
    parse(file, {
      complete: onComplete,
      error: (err) => {
        this.props.setError(err);
      },
      header: true,
      dynamicTyping: true,
    });
  };

  render() {
    return (
      <>
        <form
          onSubmit={(e) => {
            e.preventDefault();
          }}
        >
          {/* File Input */}
          <div>
            <label htmlFor="csvInput">
              <span>Upload a csv file</span>
            </label>
            <input
              onChange={this.handleFileChange}
              id="csvInput"
              name="file"
              type="File"
              data-testid="fileInput"
            />
          </div>
          {/* Break Input */}
          <div>
            <label htmlFor="breakInput">Pause zwischen den Fragen in ms:</label>
            <input
              type="number"
              id="breakInput"
              data-testid="breakInput"
              value={this.props.breakInBetween}
              className="numberInput"
              onChange={(e) => this.props.setBreakInBetween(e.target.value)}
              placeholder="Break in between the answers in milliseconds"
            />
          </div>
          {/* Result File Name Input */}
          <div>
            <label htmlFor="filenameInput">Name der Ausgabedatei:</label>
            <input
              type="text"
              id="filenameInput"
              data-testid="filenameInput"
              value={this.props.filename}
              onChange={(e) => this.props.setFilename(e.target.value)}
              placeholder="Name der Ausgabedatei"
            />
          </div>
          {/* Background Color Picker */}
          <div>
            <label htmlFor="backgroundColorInput">Hintergrundfarbe:</label>
            <input
              type="color"
              id="backgroundColorInput"
              data-testid="backgroundColorInput"
              value={this.props.backgroundColor}
              onChange={(e) => this.props.setBackgroundColor(e.target.value)}
              placeholder="Background color"
            />
          </div>
          {/* Start Button */}
          <button onClick={this.props.startTest}>Start</button>
        </form>
      </>
    );
  }
}

export default Options;
