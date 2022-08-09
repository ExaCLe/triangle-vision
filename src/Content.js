const Content = ({ sideLength, diameter, colorCircle, colorTriangle }) => {
  const triangleHeight = Math.sqrt(3 * Math.pow(sideLength / 2, 2));

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
    </>
  );
};

export default Content;
