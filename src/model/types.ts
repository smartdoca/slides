export type Emu = number;
export type ElementId = string;
export type SlideId = string;

export const EMU_PER_INCH = 914_400;
export const EMU_PER_POINT = 12_700;
export const CSS_DPI = 96;

export interface SlideSize {
  width: Emu;
  height: Emu;
}

export interface Transform {
  x: Emu;
  y: Emu;
  width: Emu;
  height: Emu;
  rotation: number;
  flipH?: boolean;
  flipV?: boolean;
}

export interface ElementBase {
  id: ElementId;
  name?: string;
  transform: Transform;
  opacity?: number;
  visible?: boolean;
  locked?: boolean;
  /** Flat editable group. Nested group coordinate systems are not represented. */
  groupId?: string;
  animation?: {
    effect: "fade" | "appear" | "fly";
    duration: number;
    trigger: "on-click" | "after-previous";
  };
}

export interface TextLeaf {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  script?: "normal" | "superscript" | "subscript";
  link?: string;
  color?: string;
  backgroundColor?: string;
  fontFamily?: string;
  fontSize?: number;
}

export interface TextParagraph {
  type: "paragraph";
  align?: "left" | "center" | "right" | "justify";
  children: TextLeaf[];
  bullet?: boolean;
  list?: "none" | "bullet" | "number";
  indentLevel?: number;
  lineHeight?: number;
  spaceBefore?: number;
  spaceAfter?: number;
}

export interface TextElement extends ElementBase {
  type: "text";
  paragraphs: TextParagraph[];
  fill?: string;
  background?: string;
  verticalAlign?: "top" | "middle" | "bottom";
  /** Uniform text inset in CSS pixels, independent of the slide zoom. */
  padding?: number;
}

export interface ShapeElement extends ElementBase {
  type: "shape";
  shape: import("./shapes").ShapeKind;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
}

export interface ImageElement extends ElementBase {
  type: "image";
  assetId: string;
  alt?: string;
  /** Fraction removed from [left, top, right, bottom]; one atomic crop range. */
  crop?: ImageCrop;
}
export type ImageCrop = [number, number, number, number];
export interface LineElement extends ElementBase {
  type: "line";
  stroke: string;
  strokeWidth: number;
  arrow?: boolean;
}
export interface TableElement extends ElementBase {
  type: "table";
  cells: string[][];
  /** Codec-projected stable identities, not indices. Copies receive independent IDs. */
  rowIds?: string[];
  columnIds?: string[];
  headerFill?: string;
}
export interface ChartElement extends ElementBase {
  type: "chart";
  chartType: "bar" | "line" | "pie" | "doughnut";
  labels: string[];
  values: number[];
  color: string;
  series?: ChartSeries[];
  stacking?: "none" | "stacked" | "percent";
  curve?: "linear" | "smooth" | "step";
  title?: string;
  showLegend?: boolean;
  showLabels?: boolean;
}
export interface ChartSeries {
  name: string;
  values: number[];
  color?: string;
}
export type SlideElement =
  | TextElement
  | ShapeElement
  | ImageElement
  | LineElement
  | TableElement
  | ChartElement;

export interface Slide {
  id: SlideId;
  name?: string;
  hidden?: boolean;
  /** Stable section identity; order changes do not change membership. */
  sectionId?: string;
  background?: string;
  elementOrder: ElementId[];
  elements: Record<ElementId, SlideElement>;
  notes?: string;
}

export interface PresentationDocument {
  id: string;
  schemaVersion: 2;
  title: string;
  size: SlideSize;
  slideOrder: SlideId[];
  slides: Record<SlideId, Slide>;
  /** Section IDs mapped to their editable names. */
  sections?: Record<string, string>;
  assets?: Record<
    string,
    { id: string; mime: string; data?: string; name?: string }
  >;
}

export type EditorSelection =
  | { type: "elements"; slideId: SlideId; elementIds: ElementId[] }
  | { type: "text"; slideId: SlideId; elementId: ElementId }
  | null;

export function emuToPx(value: Emu): number {
  return (value / EMU_PER_INCH) * CSS_DPI;
}

export function pxToEmu(value: number): Emu {
  return Math.round((value / CSS_DPI) * EMU_PER_INCH);
}
