import Triangle from "./Triangle";

const Content = (props) => {
  const { sideLength, diameter, colorCircle, colorTriangle, orientation } =
    props;
  const radius = diameter / 2;
  return (
    <>
      <div
        className="triangleView"
        style={{
          left: window.innerWidth / 2 - radius,
          top: window.innerHeight / 2 - radius,
        }}
      >
        <Triangle
          diameter={diameter}
          sideLength={sideLength}
          color={colorTriangle}
          orientation={orientation}
        />
      </div>
    </>
  );
};

export default Content;
