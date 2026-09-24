import { expect, it } from "vitest";
import { snapBox } from "./snapping";
const page = { width: 1280, height: 720 };
it("snaps page edges and centers within the screen tolerance", () => {
  expect(snapBox({ x: 3, y: 202, width: 100, height: 100 }, [], page).dx).toBe(
    -3,
  );
  expect(
    snapBox({ x: 591, y: 311, width: 100, height: 100 }, [], page),
  ).toMatchObject({ dx: -1, dy: -1 });
  expect(
    snapBox({ x: 201, y: 211, width: 100, height: 100 }, [], page).guides,
  ).toEqual([]);
});
it("aligns object edges and reports equal gaps without mutating input", () => {
  const other = [
    { x: 100, y: 110, width: 80, height: 70 },
    { x: 300, y: 110, width: 80, height: 70 },
  ];
  const original = JSON.stringify(other);
  const result = snapBox(
    { x: 499, y: 110, width: 80, height: 70 },
    other,
    page,
  );
  expect(result.dx).toBe(1);
  expect(result.guides.some((g) => g.gap === 120)).toBe(true);
  expect(JSON.stringify(other)).toBe(original);
  expect(
    snapBox({ x: 99, y: 250, width: 60, height: 60 }, other, page).dx,
  ).toBe(1);
});
