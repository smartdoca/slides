import * as Y from "yjs";
import { slateNodesToInsertDelta, yTextToSlateElement } from "@slate-yjs/core";
import type { Node } from "slate";
import { BOOTSTRAP_ORIGIN, LOCAL_ORIGIN } from "./origins";
import { TABLE_OP, projectTable, type TableOperation } from "../model/table";
import type {
  PresentationDocument,
  Slide,
  SlideElement,
  TextParagraph,
} from "../model/types";

export const ROOT = "presentation";
export const rootOf = (doc: Y.Doc) => doc.getMap<unknown>(ROOT);
export const slidesOf = (doc: Y.Doc) =>
  rootOf(doc).get("slides") as Y.Map<Y.Map<unknown>>;
export const slideOf = (doc: Y.Doc, id: string) => slidesOf(doc)?.get(id);
export const elementsOf = (doc: Y.Doc, id: string) =>
  slideOf(doc, id)?.get("elements") as Y.Map<Y.Map<unknown>> | undefined;
export const elementOf = (doc: Y.Doc, slide: string, id: string) =>
  elementsOf(doc, slide)?.get(id);
export const textOf = (doc: Y.Doc, slide: string, id: string) =>
  elementOf(doc, slide, id)?.get("text") as Y.XmlText | undefined;

function shared(value: unknown): unknown {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const map = new Y.Map<unknown>();
    for (const [k, v] of Object.entries(value))
      if (v !== undefined) map.set(k, shared(v));
    return map;
  }
  return value;
}
function json(value: unknown): unknown {
  return value instanceof Y.AbstractType ? value.toJSON() : value;
}
function patchMap(map: Y.Map<unknown>, patch: Record<string, unknown>) {
  for (const [key, value] of Object.entries(patch)) {
    if (key === "id" || key === "type" || key === "paragraphs") continue;
    const old = map.get(key);
    if (
      old instanceof Y.Map &&
      value &&
      typeof value === "object" &&
      !Array.isArray(value)
    )
      patchMap(old, value as Record<string, unknown>);
    else if (JSON.stringify(json(old)) !== JSON.stringify(value)) {
      if (value === undefined) map.delete(key);
      else map.set(key, shared(value));
    }
  }
}
export function encodeElement(element: SlideElement): Y.Map<unknown> {
  const map = new Y.Map<unknown>();
  for (const [key, value] of Object.entries(element)) {
    if (
      key === "paragraphs" ||
      key === "rowIds" ||
      key === "columnIds" ||
      key.startsWith(TABLE_OP) ||
      value === undefined
    )
      continue;
    map.set(key, shared(value));
  }
  if (element.type === "text") {
    const text = new Y.XmlText();
    text.applyDelta(slateNodesToInsertDelta(element.paragraphs as Node[]));
    map.set("text", text);
  }
  return map;
}
export function encodeSlide(slide: Slide): Y.Map<unknown> {
  const map = new Y.Map<unknown>();
  for (const key of [
    "id",
    "name",
    "background",
    "notes",
    "hidden",
    "sectionId",
  ] as const)
    if (slide[key] !== undefined) map.set(key, slide[key]);
  const order = new Y.Array<string>();
  order.push(slide.elementOrder);
  map.set("elementOrder", order);
  const elements = new Y.Map<Y.Map<unknown>>();
  for (const element of Object.values(slide.elements))
    elements.set(element.id, encodeElement(element));
  map.set("elements", elements);
  return map;
}
export function createYDocument(initial?: PresentationDocument): Y.Doc {
  const doc = new Y.Doc();
  if (initial) replaceDocument(doc, initial, BOOTSTRAP_ORIGIN);
  return doc;
}
// Full replacement is initialization only; live imports require a new epoch.
export function replaceDocument(
  doc: Y.Doc,
  value: PresentationDocument,
  origin: unknown = BOOTSTRAP_ORIGIN,
): void {
  if (rootOf(doc).size)
    throw new Error(
      "DOCUMENT_ALREADY_INITIALIZED: import into a new document/epoch",
    );
  doc.transact(() => {
    const root = rootOf(doc);
    for (const key of [
      "id",
      "schemaVersion",
      "title",
      "size",
      "assets",
    ] as const)
      if (value[key] !== undefined) root.set(key, shared(value[key]));
    for (const [id, name] of Object.entries(value.sections ?? {}))
      root.set("section:" + id, name);
    const order = new Y.Array<string>();
    order.push(value.slideOrder);
    root.set("slideOrder", order);
    const slides = new Y.Map<Y.Map<unknown>>();
    for (const slide of Object.values(value.slides))
      slides.set(slide.id, encodeSlide(slide));
    root.set("slides", slides);
  }, origin);
}
export function readDocument(doc: Y.Doc): PresentationDocument {
  return projectDocument(doc);
}
/** A fresh single-slide snapshot, including changes inside an active transaction. */
export function readSlide(doc: Y.Doc, id: string): Slide | undefined {
  return projectDocument(doc, undefined, id).slides[id];
}
export function projectDocument(
  doc: Y.Doc,
  cache?: WeakMap<object, unknown>,
  onlySlide?: string,
): PresentationDocument {
  const cached = <T>(key: object, make: () => T): T => {
    if (cache?.has(key)) return cache.get(key) as T;
    const result = make();
    cache?.set(key, result);
    return result;
  };
  const projectJson = (value: unknown) =>
    value instanceof Y.AbstractType
      ? cached(value, () => value.toJSON())
      : value;
  const root = rootOf(doc);
  const sections: Record<string, string> = {};
  root.forEach((name, key) => {
    if (key.startsWith("section:")) sections[key.slice(8)] = name as string;
  });
  const slides: Record<string, Slide> = {};
  const source =
    onlySlide === undefined
      ? slidesOf(doc)
      : new Map(
          slideOf(doc, onlySlide)
            ? [[onlySlide, slideOf(doc, onlySlide)!]]
            : [],
        );
  source?.forEach((map, id) => {
    if (map.get("deleted") === true) return;
    slides[id] = cached(map, () => {
      const elements: Record<string, SlideElement> = {};
      const elementMap = map.get("elements") as Y.Map<Y.Map<unknown>>;
      elementMap?.forEach((item, eid) => {
        if (item.get("deleted") === true) return;
        elements[eid] = cached(item, () => {
          // XmlText.toJSON serializes markup that the Slate projection never uses.
          const value: Record<string, any> = {};
          item.forEach((entry, key) => {
            if (key !== "text" && key !== "deleted") value[key] = json(entry);
          });
          if (value.type === "table") {
            const operations = Object.keys(value)
              .filter((key) => key.startsWith(TABLE_OP))
              .map((key) => {
                const op = value[key] as TableOperation;
                if (!op || key !== TABLE_OP + op.id)
                  throw new Error("Invalid table operation key");
                delete value[key];
                return op;
              });
            Object.assign(value, projectTable(eid, value.cells, operations));
          }
          if (value.type === "text") {
            const text = item.get("text");
            value.paragraphs =
              text instanceof Y.XmlText
                ? yTextToSlateElement(text).children
                : value.paragraphs;
          }
          return value as SlideElement;
        });
      });
      return {
        id,
        name: map.get("name") as string | undefined,
        background: map.get("background") as string | undefined,
        ...(map.has("hidden") ? { hidden: map.get("hidden") as boolean } : {}),
        ...(map.has("sectionId")
          ? { sectionId: map.get("sectionId") as string }
          : {}),
        ...(map.has("notes") ? { notes: map.get("notes") as string } : {}),
        elementOrder: uniqueLive(
          (map.get("elementOrder") as Y.Array<string>)?.toArray() ?? [],
          elements,
        ),
        elements,
      };
    });
  });
  return {
    id: root.get("id") as string,
    schemaVersion: root.get("schemaVersion") as 2,
    title: root.get("title") as string,
    size: projectJson(root.get("size")) as PresentationDocument["size"],
    slideOrder: uniqueLive(
      onlySlide === undefined
        ? ((root.get("slideOrder") as Y.Array<string>)?.toArray() ?? [])
        : [onlySlide],
      slides,
    ),
    slides,
    ...(Object.keys(sections).length ? { sections } : {}),
    ...(onlySlide === undefined && root.has("assets")
      ? {
          assets: projectJson(
            root.get("assets"),
          ) as PresentationDocument["assets"],
        }
      : {}),
  };
}
function uniqueLive<T>(ids: string[], live: Record<string, T>): string[] {
  return [...new Set(ids)].filter((id) => live[id]);
}
export function patchElement(
  doc: Y.Doc,
  slide: string,
  id: string,
  patch: Record<string, unknown>,
  origin: unknown = LOCAL_ORIGIN,
) {
  const target = elementOf(doc, slide, id);
  if (!target) throw new Error(`Unknown element: ${id}`);
  if ("paragraphs" in patch)
    throw new Error("Use the Slate/Yjs binding for text edits");
  if (
    target.get("type") === "table" &&
    ("cells" in patch || "rowIds" in patch || "columnIds" in patch)
  )
    throw new Error(
      "Use EditorController.tableCommand for table edits; the original cell baseline is immutable",
    );
  doc.transact(() => patchMap(target, patch), origin);
}
export function updateElement(
  doc: Y.Doc,
  slide: string,
  element: SlideElement,
  origin: unknown = LOCAL_ORIGIN,
) {
  const { id, type, ...rest } = element;
  delete (rest as { paragraphs?: TextParagraph[] }).paragraphs;
  patchElement(doc, slide, id, rest, origin);
}
