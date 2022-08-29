const Triangle = ({ sideLength, diameter, color, orientation }) => {
  const triangleHeight = 0.866 * sideLength; // Math.sqrt(3 * Math.pow(sideLength / 2, 2));

  if (orientation === "N") {
    return (
      <div
        id="triangle"
        style={{
          borderBottomWidth: triangleHeight,
          borderRightWidth: sideLength / 2,
          borderLeftWidth: sideLength / 2,
          borderBottomColor: color,
          left: diameter / 2 - sideLength / 2,
          top: diameter / 2 - triangleHeight * 0.7113,
        }}
      ></div>
    );
  } else if (orientation === "S") {
    return (
      <div
        id="triangle"
        style={{
          borderTopWidth: triangleHeight,
          borderRightWidth: sideLength / 2,
          borderLeftWidth: sideLength / 2,
          borderTopColor: color,
          left: diameter / 2 - sideLength / 2,
          top: diameter / 2 - triangleHeight * (1 - 0.7113),
        }}
      ></div>
    );
  } else if (orientation === "E") {
    return (
      <div
        id="triangle"
        style={{
          borderBottomWidth: sideLength / 2,
          borderLeftWidth: triangleHeight,
          borderTopWidth: sideLength / 2,
          borderRight: 0,
          borderLeftColor: color,
          top: diameter / 2 - sideLength / 2,
          left: diameter / 2 - triangleHeight * (1 - 0.7113),
        }}
      ></div>
    );
  } else {
    return (
      <div
        id="triangle"
        style={{
          borderBottomWidth: sideLength / 2,
          borderRightWidth: triangleHeight,
          borderTopWidth: sideLength / 2,
          borderRightColor: color,
          left: diameter / 2 - triangleHeight * 0.7113,
          top: diameter / 2 - sideLength / 2,
        }}
      ></div>
    );
  }
};
export default Triangle;
