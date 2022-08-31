import { invertColor } from "./helpers";

describe("test inversion of color", () => {
  test("inverts the color", () => {
    expect(invertColor("#ff000f")).toBe("#00fff0");
    expect(invertColor("#0000ff")).toBe("#ffff00");
    expect(invertColor("#ffff00")).toBe("#0000ff");
    expect(invertColor("#ffffff")).toBe("#000000");
    expect(invertColor("#000000")).toBe("#ffffff");
    expect(invertColor("#abcdef")).toBe("#543210");
  });

  test("inverts three digits colors correctyl", () => {
    expect(invertColor("#f00")).toBe("#00ffff");
    expect(invertColor("#0f0")).toBe("#ff00ff");
    expect(invertColor("#00f")).toBe("#ffff00");
    expect(invertColor("#fff")).toBe("#000000");
  });

  test("returns the same color if it isn't starting with a # or isn't of length 3 or 6 numbers", () => {
    expect(invertColor("#")).toBe("#");
    expect(invertColor("abc")).toBe("abc");
    expect(invertColor("#abcde")).toBe("#abcde");
    expect(invertColor("#ab")).toBe("#ab");
  });
});
