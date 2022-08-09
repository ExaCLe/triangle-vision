import "./App.css";
import { useEffect, useState } from "react";
import Content from "./Content";
import Options from "./Options";

function App() {
  const [testing, setTesting] = useState(false);
  const [sideLength, setSideLength] = useState(200);
  const [diameter, setDiameter] = useState(500);
  const [colorTriangle, setColorTriangle] = useState("pink");
  const [colorCircle, setColorCircle] = useState("blue");
  const [error, setError] = useState("");
  const [data, setData] = useState([]);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (data.length > 0) {
      setSideLength(data[index].TriangleSideLength);
      setDiameter(data[index].CircleDiameter);
      setColorCircle(`rgb(${data[index].CircleRGB}`);
      setColorTriangle(`rgb(${data[index].TriangleRGB}`);
    }
  }, [data, index]);

  if (testing) {
    return <Content sideLength diameter colorTriangle colorCircle></Content>;
  } else {
    return <Options setData setError></Options>;
  }
}

export default App;
