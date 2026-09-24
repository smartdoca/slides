import type { Box } from "./viewport";
export interface SnapGuide {
  axis: "x" | "y";
  position: number;
  start: number;
  end: number;
  gap?: number;
}
export function snapBox(
  moving: Box,
  others: Box[],
  page: { width: number; height: number },
  threshold = 6,
) {
  let dx = 0,
    dy = 0;
  const guides: SnapGuide[] = [];
  for (const axis of ["x", "y"] as const) {
    const pos = axis,
      size = axis === "x" ? "width" : "height",
      other = axis === "x" ? "y" : "x",
      otherSize = axis === "x" ? "height" : "width";
    const edges = [
        moving[pos],
        moving[pos] + moving[size] / 2,
        moving[pos] + moving[size],
      ],
      extent = page[size];
    let best = threshold + 1,
      offset = 0,
      guide: SnapGuide | undefined;
    for (const target of [{ x: 0, y: 0, ...page }, ...others])
      for (const p of [
        target[pos],
        target[pos] + target[size] / 2,
        target[pos] + target[size],
      ])
        for (const edge of edges) {
          const delta = p - edge;
          if (Math.abs(delta) < best) {
            best = Math.abs(delta);
            offset = delta;
            guide = {
              axis,
              position: p,
              start: Math.min(target[other], moving[other]),
              end: Math.max(
                target[other] + target[otherSize],
                moving[other] + moving[otherSize],
              ),
            };
          }
        }
    // Equal gaps around a between-object selection, and repeated gaps after/before two objects.
    const nearby = others
      .filter(
        (o) =>
          o[other] < moving[other] + moving[otherSize] &&
          o[other] + o[otherSize] > moving[other],
      )
      .sort(
        (a, b) =>
          Math.abs(a[pos] - moving[pos]) - Math.abs(b[pos] - moving[pos]),
      )
      .slice(0, 40)
      .sort((a, b) => a[pos] - b[pos]);
    for (let i = 0; i < nearby.length - 1; i++) {
      const a = nearby[i],
        b = nearby[i + 1],
        end = a[pos] + a[size],
        gap = b[pos] - end;
      if (gap < 0) continue;
      const candidates = [
        { value: b[pos] + b[size] + gap, gap },
        { value: a[pos] - moving[size] - gap, gap },
        ...(gap >= moving[size]
          ? [
              {
                value: end + (gap - moving[size]) / 2,
                gap: (gap - moving[size]) / 2,
              },
            ]
          : []),
      ];
      for (const c of candidates) {
        const delta = c.value - moving[pos];
        if (Math.abs(delta) < best) {
          best = Math.abs(delta);
          offset = delta;
          guide = {
            axis,
            position: moving[other] + moving[otherSize] / 2,
            start: Math.min(a[pos], moving[pos] + delta),
            end: Math.max(b[pos] + b[size], moving[pos] + delta + moving[size]),
            gap: c.gap,
          };
        }
      }
    }
    if (best <= threshold && guide) {
      if (axis === "x") dx = offset;
      else dy = offset;
      guides.push(guide);
    }
  }
  return { dx, dy, guides };
}
