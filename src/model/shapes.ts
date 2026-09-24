const polygon = (points: number[][]) =>
  "M" + points.map((p) => p.join(" ")).join(" L") + " Z";
const regular = (n: number) =>
  polygon(
    Array.from({ length: n }, (_, i) => {
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
      return [50 + 50 * Math.cos(a), 50 + 50 * Math.sin(a)];
    }),
  );
const star = (n: number) =>
  polygon(
    Array.from({ length: n * 2 }, (_, i) => {
      const a = -Math.PI / 2 + (i * Math.PI) / n,
        r = i % 2 ? 22 : 50;
      return [50 + r * Math.cos(a), 50 + r * Math.sin(a)];
    }),
  );
export const SHAPES = [
  {
    id: "rect",
    label: "矩形",
    group: "基础",
    path: "M0 0 L100 0 L100 100 L0 100 Z",
  },
  {
    id: "roundRect",
    label: "圆角矩形",
    group: "基础",
    path: "M10 0 L90 0 Q100 0 100 10 L100 90 Q100 100 90 100 L10 100 Q0 100 0 90 L0 10 Q0 0 10 0 Z",
  },
  {
    id: "ellipse",
    label: "椭圆",
    group: "基础",
    path: "M50 0 C77.61 0 100 22.39 100 50 C100 77.61 77.61 100 50 100 C22.39 100 0 77.61 0 50 C0 22.39 22.39 0 50 0 Z",
  },
  {
    id: "triangle",
    label: "三角形",
    group: "基础",
    path: polygon([
      [50, 0],
      [100, 100],
      [0, 100],
    ]),
  },
  {
    id: "rtTriangle",
    label: "直角三角形",
    group: "基础",
    path: polygon([
      [0, 0],
      [100, 100],
      [0, 100],
    ]),
  },
  {
    id: "diamond",
    label: "菱形",
    group: "基础",
    path: polygon([
      [50, 0],
      [100, 50],
      [50, 100],
      [0, 50],
    ]),
  },
  {
    id: "parallelogram",
    label: "平行四边形",
    group: "基础",
    path: polygon([
      [25, 0],
      [100, 0],
      [75, 100],
      [0, 100],
    ]),
  },
  {
    id: "trapezoid",
    label: "梯形",
    group: "基础",
    path: polygon([
      [20, 0],
      [80, 0],
      [100, 100],
      [0, 100],
    ]),
  },
  { id: "pentagon", label: "五边形", group: "基础", path: regular(5) },
  {
    id: "hexagon",
    label: "六边形",
    group: "基础",
    path: polygon([
      [25, 0],
      [75, 0],
      [100, 50],
      [75, 100],
      [25, 100],
      [0, 50],
    ]),
  },
  {
    id: "octagon",
    label: "八边形",
    group: "基础",
    path: polygon([
      [30, 0],
      [70, 0],
      [100, 30],
      [100, 70],
      [70, 100],
      [30, 100],
      [0, 70],
      [0, 30],
    ]),
  },
  {
    id: "plus",
    label: "十字形",
    group: "基础",
    path: polygon([
      [35, 0],
      [65, 0],
      [65, 35],
      [100, 35],
      [100, 65],
      [65, 65],
      [65, 100],
      [35, 100],
      [35, 65],
      [0, 65],
      [0, 35],
      [35, 35],
    ]),
  },
  { id: "star5", label: "五角星", group: "星与标注", path: star(5) },
  { id: "star6", label: "六角星", group: "星与标注", path: star(6) },
  { id: "star8", label: "八角星", group: "星与标注", path: star(8) },
  {
    id: "heart",
    label: "心形",
    group: "星与标注",
    path: "M50 100 C15 75 0 50 0 25 C0 -5 38 -5 50 20 C62 -5 100 -5 100 25 C100 50 85 75 50 100 Z",
  },
  {
    id: "teardrop",
    label: "水滴",
    group: "星与标注",
    path: "M100 0 L100 50 C100 78 78 100 50 100 C22 100 0 78 0 50 C0 22 22 0 50 0 Z",
  },
  {
    id: "wedgeRectCallout",
    label: "矩形标注",
    group: "星与标注",
    path: polygon([
      [0, 0],
      [100, 0],
      [100, 75],
      [55, 75],
      [30, 100],
      [35, 75],
      [0, 75],
    ]),
  },
  {
    id: "rightArrow",
    label: "向右箭头",
    group: "箭头",
    path: polygon([
      [0, 25],
      [65, 25],
      [65, 0],
      [100, 50],
      [65, 100],
      [65, 75],
      [0, 75],
    ]),
  },
  {
    id: "leftArrow",
    label: "向左箭头",
    group: "箭头",
    path: polygon([
      [100, 25],
      [35, 25],
      [35, 0],
      [0, 50],
      [35, 100],
      [35, 75],
      [100, 75],
    ]),
  },
  {
    id: "upArrow",
    label: "向上箭头",
    group: "箭头",
    path: polygon([
      [25, 100],
      [25, 35],
      [0, 35],
      [50, 0],
      [100, 35],
      [75, 35],
      [75, 100],
    ]),
  },
  {
    id: "downArrow",
    label: "向下箭头",
    group: "箭头",
    path: polygon([
      [25, 0],
      [25, 65],
      [0, 65],
      [50, 100],
      [100, 65],
      [75, 65],
      [75, 0],
    ]),
  },
  {
    id: "leftRightArrow",
    label: "左右箭头",
    group: "箭头",
    path: polygon([
      [0, 50],
      [25, 0],
      [25, 30],
      [75, 30],
      [75, 0],
      [100, 50],
      [75, 100],
      [75, 70],
      [25, 70],
      [25, 100],
    ]),
  },
  {
    id: "chevron",
    label: "燕尾箭头",
    group: "箭头",
    path: polygon([
      [0, 0],
      [65, 0],
      [100, 50],
      [65, 100],
      [0, 100],
      [35, 50],
    ]),
  },
  {
    id: "homePlate",
    label: "五边箭头",
    group: "箭头",
    path: polygon([
      [0, 0],
      [65, 0],
      [100, 50],
      [65, 100],
      [0, 100],
    ]),
  },
] as const;
export type ShapeKind = (typeof SHAPES)[number]["id"];
export function isShapeKind(value: unknown): value is ShapeKind {
  return SHAPES.some((s) => s.id === value);
}
export function shapePath(kind: ShapeKind, width = 100, height = 100) {
  const path = SHAPES.find((s) => s.id === kind)!.path;
  let i = 0;
  return path.replace(/-?\d+(?:\.\d+)?/g, (n) =>
    String((Number(n) * (i++ % 2 ? height : width)) / 100),
  );
}
