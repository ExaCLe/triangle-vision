const Triangle = ({ sideLength, diameter, color, orientation }) => {
  const triangleHeight = 0.866 * sideLength; // Math.sqrt(3 * Math.pow(sideLength / 2, 2));
  const halfSideLength = sideLength / 2;
  const radius = diameter / 2;

  if (orientation === "N") {
    return (
      <div
        id="triangle"
        data-testid="triangleN"
        style={{
          borderBottomWidth: triangleHeight,
          borderRightWidth: halfSideLength,
          borderLeftWidth: halfSideLength,
          borderBottomColor: color,
          left: radius - halfSideLength,
          top: radius - triangleHeight * 0.7113,
        }}
      ></div>
    );
  } else if (orientation === "S") {
    return (
      <div
        id="triangle"
        data-testid="triangleS"
        style={{
          borderTopWidth: triangleHeight,
          borderRightWidth: halfSideLength,
          borderLeftWidth: halfSideLength,
          borderTopColor: color,
          left: radius - halfSideLength,
          top: radius - triangleHeight * (1 - 0.7113),
        }}
      ></div>
    );
  } else if (orientation === "E") {
    return (
      <div
        id="triangle"
        data-testid="triangleE"
        style={{
          borderBottomWidth: halfSideLength,
          borderLeftWidth: triangleHeight,
          borderTopWidth: halfSideLength,
          borderRight: 0,
          borderLeftColor: color,
          top: radius - halfSideLength,
          left: radius - triangleHeight * (1 - 0.7113),
        }}
      ></div>
    );
  } else {
    return (
      <div
        id="triangle"
        data-testid="triangleW"
        style={{
          borderBottomWidth: halfSideLength,
          borderRightWidth: triangleHeight,
          borderTopWidth: halfSideLength,
          borderRightColor: color,
          left: radius - triangleHeight * 0.7113,
          top: radius - halfSideLength,
        }}
      ></div>
    );
  }
};
export default Triangle;
