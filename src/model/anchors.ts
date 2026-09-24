import * as Y from "yjs";
import { readDocument, textOf } from "../collaboration/yjs-codec";
import { LOCAL_ORIGIN } from "../collaboration/origins";
import type { EditorSelection } from "./types";
import { selectionBounds } from "./viewport";

export type CommentAnchor =
  | { type: "slide"; slideId: string }
  | { type: "element"; slideId: string; elementId: string }
  | { type: "elements"; slideId: string; elementIds: string[] }
  | {
      type: "text";
      slideId: string;
      elementId: string;
      start: Y.RelativePosition;
      end: Y.RelativePosition;
    };
export function captureAnchor(
  selection: EditorSelection,
): CommentAnchor | null {
  if (!selection) return null;
  if (selection.type === "text")
    return {
      type: "element",
      slideId: selection.slideId,
      elementId: selection.elementId,
    };
  return selection.elementIds.length === 1
    ? {
        type: "element",
        slideId: selection.slideId,
        elementId: selection.elementIds[0],
      }
    : selection.elementIds.length
      ? {
          type: "elements",
          slideId: selection.slideId,
          elementIds: [...new Set(selection.elementIds)],
        }
      : null;
}
export function resolveAnchor(doc: Y.Doc, anchor: CommentAnchor) {
  const value = readDocument(doc),
    slide = value.slides[anchor.slideId];
  if (!slide || !value.slideOrder.includes(anchor.slideId)) return null;
  if (anchor.type === "elements") {
    const ids = [...new Set(anchor.elementIds)].filter((id) =>
      slide.elementOrder.includes(id),
    );
    if (!ids.length) return null;
    return {
      slideId: slide.id,
      elementIds: ids,
      partial: ids.length !== anchor.elementIds.length,
      transform: {
        ...selectionBounds(ids.map((id) => slide.elements[id].transform)),
        rotation: 0,
      },
    };
  }
  if (anchor.type === "slide")
    return {
      slideId: slide.id,
      transform: {
        x: 0,
        y: 0,
        width: value.size.width,
        height: value.size.height,
        rotation: 0,
      },
    };
  const element = slide.elements[anchor.elementId];
  if (!element || !slide.elementOrder.includes(element.id)) return null;
  if (anchor.type === "text") {
    const a = Y.createAbsolutePositionFromRelativePosition(anchor.start, doc),
      b = Y.createAbsolutePositionFromRelativePosition(anchor.end, doc);
    const root = textOf(doc, anchor.slideId, anchor.elementId);
    if (!a || !b || a.type !== b.type || a.index >= b.index || !root)
      return null;
    let parent: Y.AbstractType<any> | null = a.type;
    while (parent && parent !== root) parent = parent.parent;
    if (parent !== root) return null;
  }
  return {
    slideId: slide.id,
    elementId: element.id,
    transform: element.transform,
  };
}
export interface TextMatch {
  anchor: Extract<CommentAnchor, { type: "text" }>;
  text: string;
}
export interface CommentMarker {
  id: string;
  anchor: CommentAnchor;
}
/** Stable-identity overlap candidates; host owns chooser, comment content and drawer. */
export function commentCandidates(
  doc: Y.Doc,
  markers: CommentMarker[],
  target: CommentAnchor,
): CommentMarker[] {
  const current = resolveAnchor(doc, target);
  if (!current) return [];
  const ids =
    "elementIds" in current
      ? (current.elementIds ?? [])
      : "elementId" in current
        ? [current.elementId]
        : null;
  return markers.filter((marker) => {
    const resolved = resolveAnchor(doc, marker.anchor);
    if (!resolved || resolved.slideId !== current.slideId) return false;
    const other =
      "elementIds" in resolved
        ? (resolved.elementIds ?? [])
        : "elementId" in resolved
          ? [resolved.elementId]
          : null;
    return !ids || !other || ids.some((id) => other.includes(id));
  });
}
const plain = (text: Y.XmlText): string =>
  text
    .toDelta()
    .map((part: { insert?: unknown }) =>
      typeof part.insert === "string" ? part.insert : "\uFFFC",
    )
    .join("");
export function findText(
  doc: Y.Doc,
  query: string,
  options: { caseSensitive?: boolean } = {},
): TextMatch[] {
  if (!query) return [];
  // Match against the original string: lowercasing can change UTF-16 length
  // (e.g. U+0130), shifting subsequent Yjs anchors onto the wrong characters.
  const pattern = new RegExp(
    query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
    options.caseSensitive ? "gu" : "giu",
  );
  const value = readDocument(doc),
    matches: TextMatch[] = [];
  for (const slideId of value.slideOrder)
    for (const elementId of value.slides[slideId].elementOrder) {
      const root = textOf(doc, slideId, elementId);
      if (!root) continue;
      for (const part of root.toDelta()) {
        const paragraph = part.insert;
        if (!(paragraph instanceof Y.XmlText)) continue;
        const text = plain(paragraph);
        for (const match of text.matchAll(pattern)) {
          const index = match.index;
          matches.push({
            text: match[0],
            anchor: {
              type: "text",
              slideId,
              elementId,
              start: Y.createRelativePositionFromTypeIndex(paragraph, index),
              end: Y.createRelativePositionFromTypeIndex(
                paragraph,
                index + match[0].length,
              ),
            },
          });
        }
      }
    }
  return matches;
}
export function replaceMatches(
  doc: Y.Doc,
  matches: TextMatch[],
  replacement: string,
): number {
  let replaced = 0;
  doc.transact(() => {
    for (const match of [...matches].reverse()) {
      if (!resolveAnchor(doc, match.anchor)) continue;
      const a = Y.createAbsolutePositionFromRelativePosition(
          match.anchor.start,
          doc,
        ),
        b = Y.createAbsolutePositionFromRelativePosition(match.anchor.end, doc);
      if (!a || !b || a.type !== b.type || !(a.type instanceof Y.XmlText))
        continue;
      const text = a.type;
      if (plain(text).slice(a.index, b.index) !== match.text) continue;
      let offset = 0,
        attributes: Record<string, unknown> | undefined;
      for (const part of text.toDelta()) {
        if (typeof part.insert === "string") {
          if (offset + part.insert.length > a.index) {
            attributes = part.attributes;
            break;
          }
          offset += part.insert.length;
        }
      }
      text.delete(a.index, b.index - a.index);
      text.insert(a.index, replacement, attributes ?? {});
      replaced++;
    }
  }, LOCAL_ORIGIN);
  return replaced;
}
