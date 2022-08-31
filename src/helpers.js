export const invertColor = (hex) => {
  assert;
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
