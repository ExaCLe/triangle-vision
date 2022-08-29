import Triangle from "./Triangle";

const Content = ({
  sideLength,
  diameter,
  colorCircle,
  colorTriangle,
  orientation,
}) => {
  return (
    <>
      <div
        className="triangleView"
        style={{
          left: window.innerWidth / 2 - diameter / 2,
          top: window.innerHeight / 2 - diameter / 2,
        }}
      >
        <Triangle
          diameter={diameter}
          sideLength={sideLength}
          color={colorTriangle}
          orientation={orientation}
        />
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
