import { validChart } from "./chart";
import type { PresentationDocument } from "./types";
import { validCrop } from "./image";
import { isShapeKind } from "./shapes";
import { validParagraphFormat, validTextMarks } from "./text-format";
export function validateDocument(value: PresentationDocument): void {
  const finite = (v: unknown, min: number, max: number) =>
    typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
  if (
    !value ||
    value.schemaVersion !== 2 ||
    typeof value.id !== "string" ||
    typeof value.title !== "string"
  )
    throw new Error("INVALID_DOCUMENT");
  if (
    !finite(value.size?.width, 1, 91440000) ||
    !finite(value.size?.height, 1, 91440000)
  )
    throw new Error("INVALID_SIZE");
  if (!Array.isArray(value.slideOrder) || value.slideOrder.length > 500)
    throw new Error("SLIDE_LIMIT");
  if (
    value.sections !== undefined &&
    (!value.sections ||
      Array.isArray(value.sections) ||
      typeof value.sections !== "object" ||
      Object.keys(value.sections).length > 500 ||
      Object.entries(value.sections).some(
        ([id, name]) =>
          !id || typeof name !== "string" || !name.trim() || name.length > 200,
      ))
  )
    throw new Error("INVALID_SECTIONS");
  for (const id of value.slideOrder) {
    const slide = value.slides[id];
    if (!slide || slide.id !== id || slide.elementOrder.length > 2000)
      throw new Error("INVALID_SLIDE");
    if (slide.hidden !== undefined && typeof slide.hidden !== "boolean")
      throw new Error("INVALID_SLIDE_HIDDEN");
    // Undoing a section's creation may race with another user's assignment.
    // Keep that stable reference recoverable instead of rejecting the document.
    if (
      slide.sectionId !== undefined &&
      (typeof slide.sectionId !== "string" ||
        !slide.sectionId ||
        slide.sectionId.length > 200)
    )
      throw new Error("INVALID_SLIDE_SECTION");
    for (const eid of slide.elementOrder) {
      const el = slide.elements[eid];
      if (
        !el ||
        el.id !== eid ||
        !["text", "shape", "image", "line", "table", "chart"].includes(el.type)
      )
        throw new Error("INVALID_ELEMENT");
      if (
        !["x", "y", "width", "height", "rotation"].every((k) =>
          finite(el.transform?.[k as "x"], -914400000, 914400000),
        ) ||
        el.transform.width <= 0 ||
        el.transform.height <= 0
      )
        throw new Error("INVALID_TRANSFORM");
      if (el.type === "text") {
        if (el.padding !== undefined && !finite(el.padding, 0, 200))
          throw new Error("INVALID_TEXT_PADDING");
        if (!Array.isArray(el.paragraphs) || !el.paragraphs.length)
          throw new Error("INVALID_TEXT");
        for (const p of el.paragraphs) {
          if (
            p.type !== "paragraph" ||
            !validParagraphFormat(p) ||
            !Array.isArray(p.children) ||
            !p.children.length ||
            p.children.some(
              (c) =>
                typeof c.text !== "string" ||
                c.text.length > 100000 ||
                !validTextMarks(c),
            )
          )
            throw new Error("INVALID_TEXT");
        }
      }
      if (el.type === "shape" && !isShapeKind(el.shape))
        throw new Error("INVALID_SHAPE");
      if (el.type === "image" && el.crop !== undefined && !validCrop(el.crop))
        throw new Error("INVALID_IMAGE_CROP");
      if (
        el.type === "table" &&
        (!Array.isArray(el.cells) ||
          !el.cells.length ||
          el.cells.length > 100 ||
          el.cells.some(
            (r) =>
              !Array.isArray(r) ||
              !r.length ||
              r.length > 100 ||
              r.length !== el.cells[0].length ||
              r.some((c) => typeof c !== "string"),
          ))
      )
        throw new Error("INVALID_TABLE");
      if (el.type === "chart" && !validChart(el))
        throw new Error("INVALID_CHART");
    }
  }
}
