import { expect, it } from "vitest";
import * as Y from "yjs";
import { createPresentation } from "./create";
import {
  createYDocument,
  readDocument,
  textOf,
} from "../collaboration/yjs-codec";
import { EditorController } from "./controller";
import { validateDocument } from "./validate";

function fixture() {
  const doc = createYDocument(createPresentation()),
    c = new EditorController(doc);
  c.addSlide();
  c.addSlide();
  c.addSlide();
  c.history.clear();
  return { doc, c, ids: readDocument(doc).slideOrder };
}
it("reorders by stable identity in one undo step without rebuilding slide text", () => {
  const { doc, c, ids } = fixture();
  const first = readDocument(doc).slides[ids[0]];
  const text = textOf(doc, ids[0], first.elementOrder[0]);
  c.moveSlideBefore(ids[0], null);
  expect(readDocument(doc).slideOrder).toEqual([...ids.slice(1), ids[0]]);
  expect(textOf(doc, ids[0], first.elementOrder[0])).toBe(text);
  c.undo();
  expect(readDocument(doc).slideOrder).toEqual(ids);
  c.redo();
  expect(readDocument(doc).slideOrder.at(-1)).toBe(ids[0]);
  c.moveSlideBefore(ids[0], ids[1]);
  expect(readDocument(doc).slideOrder).toEqual(ids);
  c.dispose();
});
it("ignores readonly, no-op and stale deleted drag targets without content updates", () => {
  const { doc, c, ids } = fixture();
  let updates = 0;
  doc.on("update", () => updates++);
  c.moveSlideBefore(ids[0], ids[1]);
  c.moveSlideBefore(ids[0], ids[0]);
  c.moveSlideBefore(ids[0], "missing");
  c.setReadOnly(true);
  c.moveSlideBefore(ids[0], null);
  expect(updates).toBe(0);
  expect(readDocument(doc).slideOrder).toEqual(ids);
  c.dispose();
});
it("concurrent same-slide moves and other slide edits converge and checkpoint faithfully", () => {
  const { doc: a, c: ca, ids } = fixture(),
    b = new Y.Doc();
  Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
  const cb = new EditorController(b);
  ca.moveSlideBefore(ids[0], null);
  cb.moveSlideBefore(ids[0], ids[2]);
  cb.slideProperty(ids[1], "notes", "并发备注保留");
  Y.applyUpdate(a, Y.encodeStateAsUpdate(b));
  Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
  expect(readDocument(a)).toEqual(readDocument(b));
  expect(new Set(readDocument(a).slideOrder).size).toBe(ids.length);
  ca.moveSlideBefore(ids[0], ids[1]);
  Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
  expect(readDocument(a)).toEqual(readDocument(b));
  validateDocument(readDocument(a));
  const restored = new Y.Doc();
  Y.applyUpdate(restored, Y.encodeStateAsUpdate(a));
  expect(readDocument(restored)).toEqual(readDocument(a));
  ca.dispose();
  cb.dispose();
});
