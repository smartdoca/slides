import { createId, createTextElement } from "./create";
import {
  pxToEmu,
  emuToPx,
  type Slide,
  type SlideElement,
  type SlideSize,
} from "./types";
export type LayoutKind = "blank" | "cover" | "agenda" | "columns";
export type LayoutText = {
  blank?: string;
  cover?: string;
  agenda?: string;
  columns?: string;
  title?: string;
  subtitle?: string;
  agendaHeading?: string;
  agendaItem?: string;
  columnsHeading?: string;
  topic1?: string;
  topic2?: string;
  body?: string;
};
/** Explicit insertion templates, not a claim of OOXML master/layout inheritance. */
export function createSlideLayout(
  kind: LayoutKind,
  size: SlideSize,
  dark: boolean,
  copy: LayoutText = {},
): Slide {
  const width = emuToPx(size.width),
    height = emuToPx(size.height),
    sx = width / 1280,
    sy = height / 720;
  const slide: Slide = {
    id: createId("slide"),
    name: {
      blank: copy.blank ?? "空白",
      cover: copy.cover ?? "封面",
      agenda: copy.agenda ?? "目录",
      columns: copy.columns ?? "双栏内容",
    }[kind],
    background: dark ? "#202328" : "#ffffff",
    elementOrder: [],
    elements: {},
  };
  const add = (el: SlideElement) => {
    slide.elements[el.id] = el;
    slide.elementOrder.push(el.id);
  };
  const text = (
    content: string,
    x: number,
    y: number,
    w: number,
    h: number,
    fontSize: number,
    bold = false,
    color = dark ? "#ffffff" : "#202328",
  ) => {
    const el = createTextElement(content);
    el.transform = {
      x: pxToEmu(x * sx),
      y: pxToEmu(y * sy),
      width: pxToEmu(w * sx),
      height: pxToEmu(h * sy),
      rotation: 0,
    };
    el.fill = color;
    el.paragraphs[0].children[0] = {
      text: content,
      fontSize: fontSize * Math.min(sx, sy),
      bold,
      fontFamily: "Arial",
    };
    add(el);
    return el;
  };
  if (kind === "cover") {
    text(copy.title ?? "演示文稿标题", 100, 285, 1080, 94, 56, true);
    text(
      copy.subtitle ?? "点击编辑副标题",
      104,
      402,
      1000,
      50,
      22,
      false,
      dark ? "#aeb4bf" : "#747b89",
    );
  }
  if (kind === "agenda") {
    text(copy.agendaHeading ?? "目录", 100, 82, 1000, 80, 44, true);
    for (let i = 0; i < 6; i++) {
      const x = 100 + (i % 2) * 580,
        y = 238 + Math.floor(i / 2) * 138;
      add({
        id: createId("shape"),
        type: "shape",
        shape: "ellipse",
        fill: "#4c68ff",
        transform: {
          x: pxToEmu(x * sx),
          y: pxToEmu(y * sy),
          width: pxToEmu(54 * sx),
          height: pxToEmu(54 * sy),
          rotation: 0,
        },
      });
      const n = text(
        String(i + 1).padStart(2, "0"),
        x,
        y,
        54,
        54,
        22,
        true,
        "#ffffff",
      );
      n.verticalAlign = "middle";
      n.paragraphs[0].align = "center";
      text(copy.agendaItem ?? "目录标题", x + 76, y + 10, 370, 50, 26, true);
    }
  }
  if (kind === "columns") {
    text(copy.columnsHeading ?? "标题和描述", 100, 84, 1080, 80, 44, true);
    for (let i = 0; i < 2; i++) {
      const x = 100 + i * 570;
      text(
        (i === 0 ? copy.topic1 : copy.topic2) ??
          `主题标题${i === 0 ? "一" : "二"}`,
        x,
        288,
        500,
        56,
        30,
        true,
      );
      text(
        copy.body ??
          "在这里写下你的观点。用简洁的文字讲清楚重点，让内容更易于理解。",
        x,
        366,
        480,
        196,
        22,
        false,
        dark ? "#b7bcc5" : "#626a78",
      );
    }
  }
  return slide;
}
