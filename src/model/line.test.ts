import { it, expect } from "vitest";
import { linePath } from "./line";
import { pxToEmu, type LineElement } from "./types";

it("uses the same finite path for ordinary, thin and short arrow lines", () => {
  const line: LineElement = {
    id: "line",
    type: "line",
    stroke: "#202124",
    strokeWidth: 2,
    transform: {
      x: 0,
      y: 0,
      width: pxToEmu(300),
      height: pxToEmu(1),
      rotation: 0,
    },
  };
  expect(linePath(line)).toBe("M 0 0 L 300 1");
  for (const size of [0, 1, 300]) {
    const path = linePath({
      ...line,
      arrow: true,
      transform: { ...line.transform, width: pxToEmu(size) },
    });
    expect(path).not.toMatch(/NaN|Infinity/);
    expect(path.endsWith("Z")).toBe(true);
  }
});
