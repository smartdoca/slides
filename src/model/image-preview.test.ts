import { expect, it, vi } from "vitest";
import { createPresentation } from "./create";
import { createYDocument, readDocument } from "../collaboration/yjs-codec";
import { presentationImages, presentationImagePreview } from "./image-preview";
import type { ImageElement } from "./types";

it("returns document-ordered image occurrences across all slides, without resolving URLs or writing", () => {
  const model = createPresentation(),
    first = model.slideOrder[0];
  const image = (id: string, assetId: string): ImageElement => ({
    id,
    type: "image",
    assetId,
    transform: { x: 0, y: 0, width: 1, height: 1, rotation: 0 },
  });
  model.slides[first].elements.a = image("a", "stable-a");
  model.slides[first].elements.b = image("b", "stable-b");
  model.slides[first].elements.unordered = image("unordered", "not-in-order");
  model.slides[first].elementOrder.push("b", "a");
  model.slideOrder.push("hidden-slide");
  model.slides["hidden-slide"] = {
    id: "hidden-slide",
    hidden: true,
    elementOrder: ["a"],
    elements: { a: image("a", "stable-a") },
  };
  const doc = createYDocument(model),
    writes = vi.fn();
  doc.on("update", writes);
  const before = readDocument(doc),
    gallery = presentationImages(before),
    event = presentationImagePreview(before, "hidden-slide", "a")!;
  expect(
    gallery.map((item) => [item.slideId, item.elementId, item.assetId]),
  ).toEqual([
    [first, "b", "stable-b"],
    [first, "a", "stable-a"],
    ["hidden-slide", "a", "stable-a"],
  ]);
  expect(new Set(gallery.map((item) => item.id)).size).toBe(3);
  expect(event.currentId).toBe(gallery[2].id);
  expect(Object.keys(event.gallery[0]).sort()).toEqual([
    "assetId",
    "elementId",
    "id",
    "slideId",
  ]);
  (event.gallery[0] as { assetId: string }).assetId = "host-mutated-copy";
  expect(readDocument(doc)).toEqual(before);
  expect(presentationImagePreview(before, first, "missing")).toBeNull();
  expect(
    presentationImagePreview(
      before,
      first,
      before.slides[first].elementOrder[0],
    ),
  ).toBeNull();
  expect(writes).not.toHaveBeenCalled();
  doc.destroy();
});
