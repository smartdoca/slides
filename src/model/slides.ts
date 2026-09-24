import type { PresentationDocument, Slide } from "./types";

export function presentationOrder(document: PresentationDocument): string[] {
  return document.slideOrder.filter((id) => !document.slides[id].hidden);
}

export function slideOutline(slide: Slide): string[] {
  return slide.elementOrder.flatMap((id) => {
    const element = slide.elements[id];
    return element.type === "text" && element.visible !== false
      ? element.paragraphs
          .map((p) => p.children.map((c) => c.text).join(""))
          .filter(Boolean)
      : [];
  });
}
