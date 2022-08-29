import { Component } from "react";
import { parse } from "papaparse";

const allowedExtensions = ["csv"];

class Options extends Component {
  state = {};

  constructor(props) {
    super(props);
  }

  handleFileChange = (e) => {
    this.props.setError("");
    if (e.target.files.length) {
      const inputFile = e.target.files[0];

      // assure the correct file type
      const fileExtension = inputFile?.type.split("/")[1];
      if (!allowedExtensions.includes(fileExtension)) {
        this.props.setError("Please input a csv file");
        return;
      }

      this.parseFile(inputFile);
    }
  };
  parseFile = (file) => {
    parse(file, {
      complete: (results) => {
        console.log(results.data);
        this.props.setData(results.data);
      },
      error: (err) => {
        console.error(err);
      },
      header: true,
      dynamicTyping: true,
    });
  };

  render() {
    return (
      <>
        <form>
          <div>
            <label htmlFor="csvInput">
              <span>Upload a csv file</span>
            </label>
            <input
              onChange={this.handleFileChange}
              id="csvInput"
              name="file"
              type="File"
            />
          </div>
          <div>
            <label htmlFor="breakInput">Pause zwischen den Fragen in ms:</label>
            <input
              type="number"
              id="breakInput"
              value={this.props.breakInBetween}
              className="numberInput"
              onChange={(e) => this.props.setBreakInBetween(e.target.value)}
              placeholder="Break in between the answers in milliseconds"
            />
          </div>
          <div>
            <label htmlFor="filenameInput">Name der Ausgabedatei:</label>
            <input
              type="text"
              id="filenameInput"
              value={this.props.filename}
              onChange={(e) => this.props.setFilename(e.target.value)}
              placeholder="Name der Ausgabedatei"
            />
          </div>
          <div>
            <label htmlFor="backgroundColorInput">Hintergrundfarbe:</label>
            <input
              type="color"
              id="backgroundColorInput"
              value={this.props.backgroundColor}
              onChange={(e) => this.props.setBackgroundColor(e.target.value)}
              placeholder="Background color"
            />
          </div>
          <button onClick={this.props.startTest}>Start</button>
        </form>
      </>
    );
  }
}

export default Options;
