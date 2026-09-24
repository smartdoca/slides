import { emuToPx, pxToEmu, type ImageCrop, type Transform } from "./types";

export const UNCROPPED: ImageCrop = [0, 0, 0, 0];
export function validCrop(value: unknown): value is ImageCrop {
  return (
    Array.isArray(value) &&
    value.length === 4 &&
    value.every(
      (n) => typeof n === "number" && Number.isFinite(n) && n >= 0 && n < 1,
    ) &&
    value[0] + value[2] <= 0.99 &&
    value[1] + value[3] <= 0.99
  );
}
export function imageFrame(width: number, height: number, crop?: ImageCrop) {
  const [left, top, right, bottom] = validCrop(crop) ? crop : UNCROPPED;
  const fullWidth = width / (1 - left - right),
    fullHeight = height / (1 - top - bottom);
  return {
    width: fullWidth,
    height: fullHeight,
    x: -left * fullWidth,
    y: -top * fullHeight,
  };
}
/** Reflection stays inside the rotated model box, not around the page origin. */
export function imageNodeTransform(t: Transform) {
  const w = emuToPx(t.width),
    h = emuToPx(t.height),
    radians = (t.rotation * Math.PI) / 180;
  const dx = t.flipH ? w : 0,
    dy = t.flipV ? h : 0;
  return {
    x: emuToPx(t.x) + Math.cos(radians) * dx - Math.sin(radians) * dy,
    y: emuToPx(t.y) + Math.sin(radians) * dx + Math.cos(radians) * dy,
    width: w,
    height: h,
    rotation: t.rotation,
    scaleX: t.flipH ? -1 : 1,
    scaleY: t.flipV ? -1 : 1,
  };
}
export function imageModelTransform(node: {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  rotation?: number;
  scaleX?: number;
  scaleY?: number;
}): Transform {
  const width = Math.abs((node.width ?? 1) * (node.scaleX ?? 1)),
    height = Math.abs((node.height ?? 1) * (node.scaleY ?? 1));
  const flipH = (node.scaleX ?? 1) < 0,
    flipV = (node.scaleY ?? 1) < 0;
  const rotation = node.rotation ?? 0,
    radians = (rotation * Math.PI) / 180;
  const dx = flipH ? width : 0,
    dy = flipV ? height : 0;
  return {
    x: pxToEmu((node.x ?? 0) - Math.cos(radians) * dx + Math.sin(radians) * dy),
    y: pxToEmu((node.y ?? 0) - Math.sin(radians) * dx - Math.cos(radians) * dy),
    width: Math.max(1, pxToEmu(width)),
    height: Math.max(1, pxToEmu(height)),
    rotation,
    flipH,
    flipV,
  };
}
