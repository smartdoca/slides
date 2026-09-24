import { expect, it, vi } from "vitest";
import * as Y from "yjs";
import { createPresentation } from "./create";
import { EditorController } from "./controller";
import {
  createYDocument,
  readDocument,
  textOf,
} from "../collaboration/yjs-codec";
import { presentationOrder, slideOutline } from "./slides";
import { validateDocument } from "./validate";
import { exportPptx, importPptx } from "../pptx";

function setup() {
  const doc = createYDocument(createPresentation()),
    c = new EditorController(doc);
  c.addSlide();
  c.addSlide();
  c.addSlide();
  c.history.clear();
  return { doc, c, ids: readDocument(doc).slideOrder };
}
function sync(a: Y.Doc, b: Y.Doc) {
  const first = Y.encodeStateAsUpdate(a),
    second = Y.encodeStateAsUpdate(b);
  Y.applyUpdate(a, second);
  Y.applyUpdate(b, first);
  expect(readDocument(a)).toEqual(readDocument(b));
}
it("batch copy/move/delete keep identities, one update and one undo step", () => {
  const { doc, c, ids } = setup(),
    before = readDocument(doc);
  const writes = vi.fn();
  doc.on("update", writes);
  const copies = c.duplicateSlides([ids[1], ids[0], ids[0]]);
  expect(writes).toHaveBeenCalledTimes(1);
  expect(readDocument(doc).slideOrder).toEqual([
    ids[0],
    ids[1],
    ...copies,
    ids[2],
    ids[3],
  ]);
  const copied = readDocument(doc).slides[copies[0]],
    original = before.slides[ids[0]];
  expect(copied.elementOrder[0]).not.toBe(original.elementOrder[0]);
  c.undo();
  expect(readDocument(doc)).toEqual(before);
  writes.mockClear();
  c.moveSlidesBefore([ids[2], ids[3]], ids[0]);
  expect(writes).toHaveBeenCalledTimes(1);
  expect(readDocument(doc).slideOrder).toEqual([
    ids[2],
    ids[3],
    ids[0],
    ids[1],
  ]);
  c.undo();
  expect(readDocument(doc)).toEqual(before);
  const text = textOf(doc, ids[0], original.elementOrder[0]);
  writes.mockClear();
  c.deleteSlides([ids[0], ids[1]]);
  expect(writes).toHaveBeenCalledTimes(1);
  c.undo();
  expect(readDocument(doc)).toEqual(before);
  expect(textOf(doc, ids[0], original.elementOrder[0])).toBe(text);
  c.dispose();
  doc.destroy();
});
it("noncontiguous batch drop resolves a selected anchor without losing page order", () => {
  const { doc, c, ids } = setup(),
    before = readDocument(doc);
  const writes = vi.fn();
  doc.on("update", writes);
  c.moveSlidesBefore([ids[0], ids[2]], ids[2]);
  expect(readDocument(doc).slideOrder).toEqual([
    ids[1],
    ids[0],
    ids[2],
    ids[3],
  ]);
  expect(writes).toHaveBeenCalledTimes(1);
  c.undo();
  expect(readDocument(doc)).toEqual(before);
  writes.mockClear();
  c.moveSlidesBefore([ids[0]], ids[0]);
  expect(writes).not.toHaveBeenCalled();
  c.dispose();
  doc.destroy();
});
it("section drops combine order and membership in one update/undo and converge with remote edits", () => {
  const { doc: a, c: ca, ids } = setup();
  const section = ca.createSection("章节", [ids[2]])!;
  const initial = readDocument(a),
    b = new Y.Doc();
  Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
  const cb = new EditorController(b),
    writes = vi.fn();
  a.on("update", writes);
  // Already directly above the section: membership must change even if order does not.
  ca.moveSlidesBefore([ids[1]], ids[2], section);
  expect(writes).toHaveBeenCalledTimes(1);
  expect(readDocument(a).slideOrder).toEqual(ids);
  expect(readDocument(a).slides[ids[1]].sectionId).toBe(section);
  ca.undo();
  expect(readDocument(a)).toEqual(initial);
  writes.mockClear();
  ca.moveSlidesBefore([ids[3]], ids[1], section);
  expect(writes).toHaveBeenCalledTimes(1);
  cb.renameSection(section, "远端名称");
  sync(a, b);
  expect(readDocument(b).slides[ids[3]].sectionId).toBe(section);
  ca.undo();
  sync(a, b);
  expect(readDocument(b).slideOrder).toEqual(ids);
  expect(readDocument(b).slides[ids[3]].sectionId).toBeUndefined();
  expect(readDocument(b).sections![section]).toBe("远端名称");
  const checkpoint = new Y.Doc();
  Y.applyUpdate(checkpoint, Y.encodeStateAsUpdate(a));
  expect(readDocument(checkpoint)).toEqual(readDocument(a));
  const before = readDocument(a);
  expect(() => ca.moveSlidesBefore([ids[0]], null, "missing")).toThrow();
  expect(readDocument(a)).toEqual(before);
  ca.setReadOnly(true);
  ca.moveSlidesBefore([ids[0]], null, section);
  expect(readDocument(a)).toEqual(before);
  ca.dispose();
  cb.dispose();
  a.destroy();
  b.destroy();
  checkpoint.destroy();
});
it("concurrent independent sections survive, membership follows IDs, checkpoint and undo recover", () => {
  const { doc: a, c: ca, ids } = setup(),
    b = new Y.Doc();
  Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
  const cb = new EditorController(b);
  const first = ca.createSection("开场", [ids[0], ids[1]])!;
  const second = cb.createSection("正文", [ids[2], ids[3]])!;
  sync(a, b);
  expect(readDocument(a).sections).toEqual({
    [first]: "开场",
    [second]: "正文",
  });
  ca.moveSlidesBefore([ids[1]], null);
  cb.renameSection(first, "背景");
  sync(a, b);
  expect(readDocument(a).slides[ids[1]].sectionId).toBe(first);
  expect(readDocument(a).sections![first]).toBe("背景");
  const checkpoint = new Y.Doc();
  Y.applyUpdate(checkpoint, Y.encodeStateAsUpdate(a));
  expect(readDocument(checkpoint)).toEqual(readDocument(a));
  validateDocument(readDocument(checkpoint));
  ca.setSlidesHidden(ids, true);
  cb.deleteSlides([ids[1], ids[2]]);
  sync(a, b);
  expect(presentationOrder(readDocument(a))).toEqual([]);
  cb.undo();
  sync(a, b);
  expect(readDocument(a).slideOrder).toHaveLength(4);
  ca.undo();
  sync(a, b);
  expect(presentationOrder(readDocument(a))).toHaveLength(4);
  ca.dispose();
  cb.dispose();
  a.destroy();
  b.destroy();
  checkpoint.destroy();
});
it("undo of section creation preserves concurrent references with a recoverable unnamed section", () => {
  const { doc: a, c: ca, ids } = setup(),
    b = new Y.Doc();
  const section = ca.createSection("计划", [ids[0]])!;
  Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
  const cb = new EditorController(b);
  cb.assignSection([ids[1]], section);
  ca.undo();
  sync(a, b);
  expect(readDocument(a).slides[ids[1]].sectionId).toBe(section);
  validateDocument(readDocument(a));
  ca.renameSection(section, "恢复分节");
  sync(a, b);
  expect(readDocument(b).sections![section]).toBe("恢复分节");
  ca.dispose();
  cb.dispose();
  a.destroy();
  b.destroy();
});
it("readonly batch/section operations do not submit and invalid names do not partially apply", () => {
  const { doc, c, ids } = setup(),
    before = readDocument(doc);
  const updates = vi.fn();
  doc.on("update", updates);
  expect(() => c.createSection(" ", ids)).toThrow();
  expect(() => c.assignSection(ids, "missing")).toThrow();
  c.setReadOnly(true);
  c.createSection("不会写入", ids);
  c.deleteSlides(ids);
  c.duplicateSlides(ids);
  c.moveSlidesBefore([ids[3]], ids[0]);
  c.setSlidesHidden(ids, true);
  expect(updates).not.toHaveBeenCalled();
  expect(readDocument(doc)).toEqual(before);
  c.dispose();
  doc.destroy();
});
it("deleting a section preserves page and text identities, remote edits, undo and checkpoint", () => {
  const { doc: a, c: ca, ids } = setup();
  const section = ca.createSection("章节", [ids[0], ids[2]])!;
  const before = readDocument(a),
    eid = before.slides[ids[0]].elementOrder[0];
  const text = textOf(a, ids[0], eid),
    b = new Y.Doc();
  Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
  const cb = new EditorController(b),
    writes = vi.fn();
  a.on("update", writes);
  ca.deleteSection(section);
  expect(writes).toHaveBeenCalledTimes(1);
  expect(readDocument(a).slideOrder).toEqual(before.slideOrder);
  expect(readDocument(a).sections?.[section]).toBeUndefined();
  expect(readDocument(a).slides[ids[0]].sectionId).toBeUndefined();
  expect(textOf(a, ids[0], eid)).toBe(text);
  cb.patch(ids[0], eid, { fill: "#ff0000" });
  sync(a, b);
  ca.undo();
  sync(a, b);
  expect(readDocument(a).sections![section]).toBe("章节");
  expect(readDocument(a).slides[ids[0]].sectionId).toBe(section);
  expect(readDocument(a).slides[ids[0]].elements[eid]).toMatchObject({fill: "#ff0000"});
  ca.redo();
  sync(a, b);
  const restored = new Y.Doc();
  Y.applyUpdate(restored, Y.encodeStateAsUpdate(a));
  expect(readDocument(restored)).toEqual(readDocument(a));
  validateDocument(readDocument(restored));
  const clean = readDocument(a);
  writes.mockClear();
  ca.setReadOnly(true);
  ca.deleteSection(section);
  expect(readDocument(a)).toEqual(clean);
  expect(writes).not.toHaveBeenCalled();
  ca.dispose();
  cb.dispose();
  a.destroy();
  b.destroy();
  restored.destroy();
});
it("a concurrent new section member is retained as a recoverable unnamed section", () => {
  const { doc: a, c: ca, ids } = setup(),
    section = ca.createSection("章节", [ids[0]])!,
    b = new Y.Doc();
  Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
  const cb = new EditorController(b);
  ca.deleteSection(section);
  cb.assignSection([ids[1]], section);
  sync(a, b);
  expect(readDocument(a).slides[ids[1]].sectionId).toBe(section);
  expect(readDocument(a).sections?.[section]).toBeUndefined();
  validateDocument(readDocument(a));
  ca.renameSection(section, "恢复章节");
  sync(a, b);
  expect(readDocument(b).sections![section]).toBe("恢复章节");
  ca.dispose();
  cb.dispose();
  a.destroy();
  b.destroy();
});
it("hidden slides roundtrip in PPTX without dropping their content; outline is model text", async () => {
  const { doc, c, ids } = setup();
  c.setSlidesHidden([ids[0]], true);
  c.createSection("第一节", ids);
  const before = readDocument(doc),
    exported = await exportPptx(before);
  expect(exported.warnings.some((w) => w.message.includes("分节"))).toBe(true);
  const imported = (await importPptx(await exported.blob.arrayBuffer()))
    .document;
  expect(imported.slideOrder).toHaveLength(4);
  expect(imported.slides[imported.slideOrder[0]].hidden).toBe(true);
  expect(presentationOrder(imported)).toHaveLength(3);
  expect(slideOutline(imported.slides[imported.slideOrder[0]])).toEqual([
    "EPPT 协同演示文稿",
  ]);
  expect(readDocument(doc)).toEqual(before);
  c.dispose();
  doc.destroy();
});
