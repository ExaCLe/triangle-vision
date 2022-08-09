import "./App.css";
import { useEffect, useState } from "react";
import { parse } from "papaparse";

const allowedExtensions = ["csv"];

function App() {
  const [sideLength, setSideLength] = useState(200);
  const [diameter, setDiameter] = useState(500);
  const [colorTriangle, setColorTriangle] = useState("pink");
  const [colorCircle, setColorCircle] = useState("blue");
  const [error, setError] = useState("");
  const [data, setData] = useState([]);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (data.length > 0) {
      console.log(data[index]);
      setSideLength(data[index].TriangleSideLength);
      setDiameter(data[index].CircleDiameter);
      setColorCircle(`rgb(${data[index].CircleRGB}`);
      setColorTriangle(`rgb(${data[index].TriangleRGB}`);
    }
  }, [data, index]);

  const triangleHeight = Math.sqrt(3 * Math.pow(sideLength / 2, 2));

  const handleFileChange = (e) => {
    setError("");
    if (e.target.files.length) {
      const inputFile = e.target.files[0];

      // assure the correct file type
      const fileExtension = inputFile?.type.split("/")[1];
      if (!allowedExtensions.includes(fileExtension)) {
        setError("Please input a csv file");
        return;
      }

      parseFile(inputFile);
    }
  };

  const parseFile = (file) => {
    parse(file, {
      complete: (results) => {
        setData(results.data);
      },
      error: (err) => {
        console.error(err);
      },
      header: true,
      dynamicTyping: true,
    });
  };
  console.log(diameter, sideLength, colorCircle, colorTriangle);
  return (
    <>
      <div className="triangleView">
        <div
          id="triangle"
          style={{
            borderBottomWidth: triangleHeight,
            borderRightWidth: sideLength / 2,
            borderLeftWidth: sideLength / 2,
            left: diameter / 2 - sideLength / 2,
            top: diameter / 2 - triangleHeight / 2,
            borderBottomColor: colorTriangle,
          }}
        ></div>
        <div
          id="circle"
          style={{
            width: diameter,
            height: diameter,
            backgroundColor: colorCircle,
          }}
        ></div>
      </div>
      <input
        onChange={handleFileChange}
        id="csvInput"
        name="file"
        type="File"
      />
      <button
        onClick={() => {
          setIndex((index + 1) % data.length);
        }}
      >
        Next
      </button>
    </>
  );
}

export default App;
