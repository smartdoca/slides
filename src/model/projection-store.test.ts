import { expect, it, vi } from "vitest";
import * as Y from "yjs";
import { createPresentation } from "./create";
import {
  createYDocument,
  readDocument,
  rootOf,
  textOf,
} from "../collaboration/yjs-codec";
import { presentationStore } from "./projection-store";
import { EditorController } from "./controller";
import { SlidePreviewStore } from "./preview-store";

it("invalidates only changed slides/elements and keeps public snapshots independent", () => {
  const doc = createYDocument(createPresentation()),
    c = new EditorController(doc);
  const first = readDocument(doc).slideOrder[0],
    second = c.addSlide(first);
  const store = presentationStore(doc),
    before = store.getSnapshot();
  const id = before.slides[first].elementOrder[0];
  const untouched = before.slides[first].elementOrder[1];
  c.patch(first, id, { fill: "#123456", transform: { x: 4321 } });
  const next = store.getSnapshot();
  expect(next).toEqual(readDocument(doc));
  expect(next.slides[second]).toBe(before.slides[second]);
  expect(next.slides[first].elements[untouched]).toBe(
    before.slides[first].elements[untouched],
  );
  expect(next.slides[first].elements[id]).not.toBe(
    before.slides[first].elements[id],
  );
  const snapshot = readDocument(doc);
  snapshot.slides[first].background = "changed outside";
  expect(store.getSnapshot().slides[first].background).not.toBe(
    "changed outside",
  );
  expect(presentationStore(doc)).toBe(store);
  c.dispose();
  doc.destroy();
});

it("matches fresh projection after bootstrap, nested text, table, tombstone undo, remote and checkpoint", () => {
  const a = createYDocument(createPresentation()),
    b = new Y.Doc();
  const store = presentationStore(b);
  Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
  const c = new EditorController(a),
    local = presentationStore(a);
  const slide = readDocument(a).slideOrder[0],
    text = readDocument(a).slides[slide].elementOrder[0];
  const check = () => {
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
    expect(local.getSnapshot()).toEqual(readDocument(a));
    expect(store.getSnapshot()).toEqual(readDocument(a));
  };
  check();
  c.formatText(slide, [text], { color: "#654321" });
  check();
  c.replaceAll("EPPT", "中文远端投影");
  check();
  const identity = textOf(a, slide, text);
  c.remove(slide, [text]);
  check();
  c.undo();
  check();
  expect(textOf(a, slide, text)).toBe(identity);
  const table = c.add(slide, "table");
  check();
  c.tableCommand(slide, table, { kind: "insert-row", after: null });
  check();
  c.undo();
  check();
  c.redo();
  check();
  const copy = c.addSlide(slide, readDocument(a).slides[slide]);
  check();
  c.moveSlideBefore(copy, slide);
  check();
  c.deleteSlide(copy);
  check();
  c.undo();
  check();
  c.pageSize(800, 600);
  check();
  a.transact(() =>
    rootOf(a).set(
      "assets",
      new Y.Map([["stable", new Y.Map([["mime", "image/png"]])]]),
    ),
  );
  check();
  const restored = new Y.Doc();
  Y.applyUpdate(restored, Y.encodeStateAsUpdate(a));
  expect(presentationStore(restored).getSnapshot()).toEqual(readDocument(a));
  c.dispose();
  a.destroy();
  b.destroy();
  restored.destroy();
});

it("preview subscribers share work, receive targeted invalidations, and dispose without content writes", () => {
  const doc = createYDocument(createPresentation()),
    c = new EditorController(doc);
  const first = readDocument(doc).slideOrder[0],
    second = c.addSlide(first);
  const previews = new SlidePreviewStore(doc),
    listener = vi.fn(),
    writes = vi.fn();
  previews.subscribe(listener);
  doc.on("update", writes);
  for (let i = 0; i < 100; i++) previews.getSnapshot(second);
  expect(writes).not.toHaveBeenCalled();
  const snapshot = previews.getSnapshot(first)!;
  snapshot.slide.background = "caller-owned";
  c.slideProperty(first, "background", "#123456");
  expect(listener).toHaveBeenLastCalledWith([first]);
  expect(previews.getSnapshot(first)!.slide.background).toBe("#123456");
  previews.dispose();
  listener.mockClear();
  c.title("metadata");
  expect(listener).not.toHaveBeenCalled();
  c.dispose();
  doc.destroy();
});
