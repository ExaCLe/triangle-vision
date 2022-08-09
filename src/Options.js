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
        <input
          onChange={this.props.handleFileChange}
          id="csvInput"
          name="file"
          type="File"
        />
      </>
    );
  }
}

export default Options;
