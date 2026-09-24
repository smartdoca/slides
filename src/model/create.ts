import {
  EMU_PER_INCH,
  type PresentationDocument,
  type TextElement,
} from "./types";

export function createId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

export function createTextElement(text = "双击编辑文本"): TextElement {
  return {
    id: createId("text"),
    type: "text",
    transform: {
      x: EMU_PER_INCH,
      y: EMU_PER_INCH,
      width: EMU_PER_INCH * 5,
      height: EMU_PER_INCH,
      rotation: 0,
    },
    paragraphs: [{ type: "paragraph", children: [{ text, fontSize: 24 }] }],
    fill: "#202124",
  };
}

export function createPresentation(): PresentationDocument {
  const slideId = createId("slide");
  const text = createTextElement("EPPT 协同演示文稿");
  return {
    id: createId("presentation"),
    schemaVersion: 2,
    title: "未命名演示文稿",
    size: { width: 12_192_000, height: EMU_PER_INCH * 7.5 },
    slideOrder: [slideId],
    slides: {
      [slideId]: {
        id: slideId,
        background: "#ffffff",
        elementOrder: [text.id],
        elements: { [text.id]: text },
      },
    },
  };
}
