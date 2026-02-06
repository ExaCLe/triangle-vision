export const invertColor = (hex) => {
  if (hex.indexOf("#") === 0 && (hex.length === 7 || hex.length === 4)) {
    hex = hex.slice(1);

    if (hex.length === 3) {
      hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    }

    let result = "#";
    for (let i = 0; i < 3; i++) {
      const color = hex.slice(i * 2, i * 2 + 2);
      const inverted = 0xff - parseInt(color, 16);
      result += inverted.toString(16).padStart(2, "0");
    }
    return result;
  }
  return hex;
};

export const orientationFromArrowKey = (key) => {
  switch (key) {
    case "ArrowUp":
      return "N";
    case "ArrowRight":
      return "E";
    case "ArrowDown":
      return "S";
    case "ArrowLeft":
      return "W";
    default:
      return null;
  }
};

export const applyOrientationFlip = (orientation, flip = {}) => {
  if (!orientation) return orientation;
  const { horizontal = false, vertical = false } = flip;

  let mapped = orientation;

  if (horizontal) {
    if (mapped === "E") mapped = "W";
    else if (mapped === "W") mapped = "E";
  }

  if (vertical) {
    if (mapped === "N") mapped = "S";
    else if (mapped === "S") mapped = "N";
  }

  return mapped;
};
