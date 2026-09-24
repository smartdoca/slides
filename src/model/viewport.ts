export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}
export function selectionBounds(items: (Box & { rotation: number })[]): Box {
  if (!items.length) return { x: 0, y: 0, width: 0, height: 0 };
  const points = items.flatMap((t) => {
    const angle = (t.rotation * Math.PI) / 180,
      c = Math.cos(angle),
      s = Math.sin(angle);
    return [
      [0, 0],
      [t.width, 0],
      [0, t.height],
      [t.width, t.height],
    ].map(([x, y]) => ({ x: t.x + x * c - y * s, y: t.y + x * s + y * c }));
  });
  const x = Math.min(...points.map((p) => p.x)),
    y = Math.min(...points.map((p) => p.y));
  return {
    x,
    y,
    width: Math.max(...points.map((p) => p.x)) - x,
    height: Math.max(...points.map((p) => p.y)) - y,
  };
}
export function floatingPosition(
  box: Box,
  viewport: Box,
  toolbar: { width: number; height: number },
) {
  const gap = 12,
    edge = 8;
  const visible =
    box.x + box.width > viewport.x &&
    box.x < viewport.x + viewport.width &&
    box.y + box.height > viewport.y &&
    box.y < viewport.y + viewport.height;
  const clamp = (v: number, min: number, max: number) =>
    Math.max(min, Math.min(max, v));
  const above = box.y - toolbar.height - gap;
  return {
    left: clamp(
      box.x + (box.width - toolbar.width) / 2,
      viewport.x + edge,
      viewport.x + viewport.width - toolbar.width - edge,
    ),
    top: clamp(
      above >= viewport.y + edge ? above : box.y + box.height + gap,
      viewport.y + edge,
      viewport.y + viewport.height - toolbar.height - edge,
    ),
    visible,
  };
}
