import type {
  SlideElement,
  TextElement,
  TextLeaf,
  TextParagraph,
} from "./types";
import { textInsets } from "./text-format";

export type CharacterStyle = Omit<TextLeaf, "text" | "link">;
export type ParagraphStyle = Omit<TextParagraph, "type" | "children">;

// Explicit defaults let a format painter replace false/absent source marks too.
// Hyperlinks are content: painting a style never copies or removes a destination.
export const DEFAULT_CHARACTER_STYLE: Required<CharacterStyle> = {
  fontFamily: "Arial",
  fontSize: 24,
  color: "#202124",
  backgroundColor: "transparent",
  bold: false,
  italic: false,
  underline: false,
  strike: false,
  script: "normal",
  letterSpacing: 0,
};
export const DEFAULT_PARAGRAPH_STYLE: Required<ParagraphStyle> = {
  align: "left",
  bullet: false,
  list: "none",
  indentLevel: 0,
  lineHeight: 1.2,
  spaceBefore: 0,
  spaceAfter: 0,
};
export const FONT_SIZES = [
  6, 8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 44, 48, 54, 60, 66,
  72, 80, 88, 96, 120, 144, 160, 180, 200,
];
export function stepFontSize(
  size: number,
  direction: 1 | -1,
  increment?: number,
) {
  if (increment !== undefined)
    return Math.max(6, Math.min(200, size + direction * increment));
  return direction === 1
    ? (FONT_SIZES.find((value) => value > size) ?? 200)
    : ([...FONT_SIZES].reverse().find((value) => value < size) ?? 6);
}
export function characterStyle(
  leaf: Partial<TextLeaf> = {},
  fill = "#202124",
): Required<CharacterStyle> {
  return Object.fromEntries(
    Object.entries(DEFAULT_CHARACTER_STYLE).map(([key, fallback]) => [
      key,
      leaf[key as keyof CharacterStyle] ?? (key === "color" ? fill : fallback),
    ]),
  ) as Required<CharacterStyle>;
}
export function paragraphStyleOf(
  p: Partial<TextParagraph> = {},
): Required<ParagraphStyle> {
  return {
    ...DEFAULT_PARAGRAPH_STYLE,
    ...Object.fromEntries(
      Object.keys(DEFAULT_PARAGRAPH_STYLE)
        .filter((key) => p[key as keyof ParagraphStyle] !== undefined)
        .map((key) => [key, p[key as keyof ParagraphStyle]]),
    ),
    list: p.list ?? (p.bullet ? "bullet" : "none"),
  };
}
/** Missing keys indicate a mixed selection, rather than the first run's value. */
export function commonStyle<T extends object>(values: T[]): Partial<T> {
  if (!values.length) return {};
  return Object.fromEntries(
    Object.entries(values[0]).filter(([key, value]) =>
      values.every((item) => item[key as keyof T] === value),
    ),
  ) as Partial<T>;
}

export type CopiedStyle =
  | {
      type: "text";
      marks: Required<CharacterStyle>;
      paragraph: Required<ParagraphStyle>;
      box: Pick<
        TextElement,
        | "fill"
        | "background"
        | "verticalAlign"
        | "padding"
        | "paddingInsets"
        | "opacity"
      >;
    }
  | {
      type: "shape";
      fill: string;
      stroke: string;
      strokeWidth: number;
      opacity: number;
    }
  | { type: "line"; stroke: string; strokeWidth: number; opacity: number };

export function captureStyle(
  element: SlideElement,
  marks?: Partial<TextLeaf>,
  paragraph?: Partial<TextParagraph>,
): CopiedStyle | null {
  if (element.type === "text")
    return {
      type: "text",
      marks: characterStyle(
        marks ?? element.paragraphs[0]?.children[0],
        element.fill,
      ),
      paragraph: paragraphStyleOf(paragraph ?? element.paragraphs[0]),
      box: {
        fill: element.fill ?? "#202124",
        background: element.background,
        verticalAlign: element.verticalAlign ?? "top",
        padding: element.padding ?? 0,
        paddingInsets: element.paddingInsets ? textInsets(element) : undefined,
        opacity: element.opacity ?? 1,
      },
    };
  if (element.type === "shape")
    return {
      type: "shape",
      fill: element.fill ?? "#325af0",
      stroke: element.stroke ?? element.fill ?? "#325af0",
      strokeWidth: element.strokeWidth ?? 0,
      opacity: element.opacity ?? 1,
    };
  if (element.type === "line")
    return {
      type: "line",
      stroke: element.stroke,
      strokeWidth: element.strokeWidth,
      opacity: element.opacity ?? 1,
    };
  return null;
}
export function acceptsStyle(style: CopiedStyle, element: SlideElement) {
  return (
    !element.locked &&
    (style.type === "text"
      ? element.type === "text"
      : element.type === "shape" || element.type === "line")
  );
}

export const TEXT_STYLES = [
  { id: "title", fontSize: 54, bold: true, color: "#1f2329", spaceAfter: 0 },
  { id: "heading", fontSize: 40, bold: true, color: "#1f2329", spaceAfter: 0 },
  {
    id: "subtitle",
    fontSize: 32,
    bold: false,
    color: "#1f2329",
    spaceAfter: 0,
  },
  { id: "body", fontSize: 24, bold: false, color: "#202124", spaceAfter: 6 },
  { id: "caption", fontSize: 18, bold: false, color: "#1f2329", spaceAfter: 0 },
] as const;
export const SHAPE_STYLES = [
  { id: "accent", fill: "#4472c4", stroke: "#4472c4", strokeWidth: 0 },
  { id: "subtle", fill: "#dae3f3", stroke: "#4472c4", strokeWidth: 1 },
  { id: "outline", fill: "transparent", stroke: "#4472c4", strokeWidth: 2 },
  { id: "dark", fill: "#203864", stroke: "#203864", strokeWidth: 0 },
  { id: "warm", fill: "#ed7d31", stroke: "#c55a11", strokeWidth: 1 },
  { id: "green", fill: "#70ad47", stroke: "#548235", strokeWidth: 1 },
] as const;
