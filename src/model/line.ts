import { emuToPx, type LineElement } from "./types";

/** Shared canvas/preview path; arrow dimensions stay in CSS pixels. */
export function linePath(line: LineElement): string {
  const w = emuToPx(line.transform.width),
    h = emuToPx(line.transform.height);
  const shaft = `M 0 0 L ${w} ${h}`;
  if (!line.arrow) return shaft;
  const length = Math.hypot(w, h);
  if (!length) return shaft;
  const dx = w / length,
    dy = h / length;
  const depth = Math.min(Math.max(8, line.strokeWidth * 4), length * 0.45);
  const half = Math.min(Math.max(4, line.strokeWidth * 2), length * 0.22);
  const x = w - dx * depth,
    y = h - dy * depth;
  return `${shaft} M ${w} ${h} L ${x - dy * half} ${y + dx * half} L ${x + dy * half} ${y - dx * half} Z`;
}
