import { expect, it } from "vitest";
import { floatingPosition, selectionBounds } from "./viewport";
it("places above or below selection and clamps to the visible canvas", () => {
  const v = { x: 220, y: 122, width: 1060, height: 526 };
  expect(
    floatingPosition({ x: 500, y: 300, width: 300, height: 50 }, v, {
      width: 460,
      height: 44,
    }),
  ).toEqual({ left: 420, top: 244, visible: true });
  expect(
    floatingPosition({ x: 1150, y: 125, width: 300, height: 50 }, v, {
      width: 460,
      height: 44,
    }),
  ).toEqual({ left: 812, top: 187, visible: true });
  expect(
    floatingPosition({ x: 1500, y: 300, width: 30, height: 30 }, v, {
      width: 460,
      height: 44,
    }).visible,
  ).toBe(false);
});
it("computes rotated and multi-selection bounds without changing inputs", () => {
  const items = [
    { x: 100, y: 100, width: 80, height: 40, rotation: 90 },
    { x: 10, y: 20, width: 20, height: 10, rotation: 0 },
  ];
  const before = structuredClone(items),
    box = selectionBounds(items);
  expect(box.x).toBeCloseTo(10);
  expect(box.y).toBe(20);
  expect(box.width).toBeCloseTo(90);
  expect(box.height).toBeCloseTo(160);
  expect(items).toEqual(before);
});
