import { expect, it } from "vitest";
import * as Y from "yjs";
import { createPresentation } from "./create";
import { createYDocument, readDocument } from "../collaboration/yjs-codec";
import { EditorController } from "./controller";
import {
  validCrop,
  imageFrame,
  imageNodeTransform,
  imageModelTransform,
} from "./image";
import { pxToEmu, type ImageElement } from "./types";
import { validateDocument } from "./validate";
const image: ImageElement = {
  id: "picture",
  type: "image",
  assetId: "stable-asset",
  transform: {
    x: pxToEmu(80),
    y: pxToEmu(120),
    width: pxToEmu(400),
    height: pxToEmu(240),
    rotation: 31,
  },
};
it("maps non-destructive crop to the original image size and offset", () => {
  expect(imageFrame(400, 240, [0.25, 0, 0.25, 0])).toEqual({
    width: 800,
    height: 240,
    x: -200,
    y: -0,
  });
  expect(validCrop([0.7, 0, 0.7, 0])).toBe(false);
  expect(validCrop([NaN, 0, 0, 0])).toBe(false);
  expect(validCrop([-0.1, 0, 0, 0])).toBe(false);
});
it("maps reflected and resized images back to a positive model box without drift", () => {
  for (const flipH of [false, true])
    for (const flipV of [false, true]) {
      const transform = { ...image.transform, flipH, flipV };
      expect(imageModelTransform(imageNodeTransform(transform))).toEqual(
        transform,
      );
      const node = imageNodeTransform(transform);
      const resized = imageModelTransform({
        ...node,
        scaleX: node.scaleX * 2,
        scaleY: node.scaleY * 2,
      });
      expect(resized.width).toBe(transform.width * 2);
      expect(resized.height).toBe(transform.height * 2);
      expect(resized.flipH).toBe(flipH);
      expect(resized.flipV).toBe(flipV);
    }
});
it("merges crop and movement, keeps concurrent crops atomic, and restores checkpoints", () => {
  const a = createYDocument(createPresentation()),
    ca = new EditorController(a),
    s = readDocument(a).slideOrder[0];
  ca.insert(s, image);
  const b = new Y.Doc();
  Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
  const cb = new EditorController(b);
  ca.patch(s, image.id, { crop: [0.6, 0, 0, 0] });
  cb.patch(s, image.id, { transform: { x: pxToEmu(200) } });
  Y.applyUpdate(a, Y.encodeStateAsUpdate(b));
  Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
  expect(readDocument(a)).toEqual(readDocument(b));
  expect(readDocument(a).slides[s].elements[image.id]).toMatchObject({
    crop: [0.6, 0, 0, 0],
    transform: { x: pxToEmu(200) },
  });
  ca.patch(s, image.id, { crop: [0.7, 0, 0, 0] });
  cb.patch(s, image.id, { crop: [0, 0, 0.7, 0] });
  Y.applyUpdate(a, Y.encodeStateAsUpdate(b));
  Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
  expect(readDocument(a)).toEqual(readDocument(b));
  validateDocument(readDocument(a));
  const restored = new Y.Doc();
  Y.applyUpdate(restored, Y.encodeStateAsUpdate(a));
  expect(readDocument(restored)).toEqual(readDocument(a));
});
it("crop changes are undoable, readonly guarded and invalid ranges cannot be committed", () => {
  const doc = createYDocument(createPresentation()),
    c = new EditorController(doc),
    s = readDocument(doc).slideOrder[0];
  c.insert(s, image);
  c.patch(s, image.id, { crop: [0.2, 0.1, 0.1, 0.2] });
  c.undo();
  expect(
    (readDocument(doc).slides[s].elements[image.id] as ImageElement).crop,
  ).toBeUndefined();
  c.redo();
  c.setReadOnly(true);
  c.patch(s, image.id, { crop: [0, 0, 0, 0] });
  expect(
    (readDocument(doc).slides[s].elements[image.id] as ImageElement).crop,
  ).toEqual([0.2, 0.1, 0.1, 0.2]);
  c.setReadOnly(false);
  c.patch(s, image.id, { crop: [0.8, 0, 0.8, 0] });
  validateDocument(readDocument(doc));
});
