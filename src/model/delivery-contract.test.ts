import { expect, it } from "vitest";
import * as Y from "yjs";
import { createPresentation } from "./create";
import {
  createYDocument,
  readDocument,
  textOf,
} from "../collaboration/yjs-codec";
import { createEditor, Editor, Transforms, Node } from "slate";
import { withYjs, YjsEditor } from "@slate-yjs/core";
import { LocalTextOrigin } from "../collaboration/origins";
import { EditorController } from "./controller";
import { captureAnchor, resolveAnchor, commentCandidates } from "./anchors";
import { SlidePreviewStore } from "./preview-store";
const sync = (a: Y.Doc, b: Y.Doc) => {
  Y.applyUpdate(a, Y.encodeStateAsUpdate(b));
  Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
  expect(readDocument(a)).toEqual(readDocument(b));
};
it("retains text CRDT identity after element deletion undo and allows Chinese after select-all/delete", () => {
  const a = createYDocument(createPresentation()),
    ca = new EditorController(a),
    view = readDocument(a),
    s = view.slideOrder[0],
    id = view.slides[s].elementOrder[0];
  const b = new Y.Doc();
  Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
  const cb = new EditorController(b),
    root = textOf(a, s, id);
  ca.remove(s, [id]);
  cb.replaceAll("EPPT", "协作者");
  sync(a, b);
  ca.undo();
  sync(a, b);
  expect(textOf(a, s, id)).toBe(root);
  expect(JSON.stringify(readDocument(a))).toContain("协作者");
  const editor = withYjs(createEditor(), root!, {
    localOrigin: new LocalTextOrigin(),
  });
  YjsEditor.connect(editor);
  Transforms.select(editor, Editor.range(editor, []));
  Transforms.delete(editor);
  Transforms.insertText(editor, "中文再次输入");
  YjsEditor.flushLocalChanges(editor);
  expect(Node.string(editor)).toBe("中文再次输入");
  sync(a, b);
  YjsEditor.disconnect(editor);
  ca.dispose();
  cb.dispose();
  a.destroy();
  b.destroy();
});
it("preserves multi-element anchor identities, candidates and partial/deleted/undo semantics", () => {
  const doc = createYDocument(createPresentation()),
    c = new EditorController(doc),
    slide = readDocument(doc).slideOrder[0];
  const a = c.add(slide, "rect"),
    b = c.add(slide, "ellipse");
  const anchor = captureAnchor({
    type: "elements",
    slideId: slide,
    elementIds: [a, b],
  })!;
  expect(anchor.type).toBe("elements");
  expect(
    commentCandidates(
      doc,
      [
        { id: "one", anchor },
        {
          id: "two",
          anchor: { type: "element", slideId: slide, elementId: b },
        },
      ],
      anchor,
    ),
  ).toHaveLength(2);
  c.remove(slide, [a]);
  expect(resolveAnchor(doc, anchor)).toMatchObject({
    elementIds: [b],
    partial: true,
  });
  c.remove(slide, [b]);
  expect(resolveAnchor(doc, anchor)).toBeNull();
  c.undo();
  expect(resolveAnchor(doc, anchor)).not.toBeNull();
  c.dispose();
  doc.destroy();
});
it("page deletion wins concurrent edit, local undo restores edited page and checkpoint identities", () => {
  const a = createYDocument(createPresentation()),
    ca = new EditorController(a),
    slide = readDocument(a).slideOrder[0];
  ca.addSlide();
  ca.history.clear();
  const b = new Y.Doc();
  Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
  const cb = new EditorController(b);
  ca.deleteSlide(slide);
  cb.slideProperty(slide, "notes", "删除时的远端编辑");
  sync(a, b);
  expect(readDocument(a).slideOrder).not.toContain(slide);
  ca.undo();
  sync(a, b);
  expect(readDocument(a).slideOrder).toContain(slide);
  expect(readDocument(a).slides[slide].notes).toBe("删除时的远端编辑");
  const reloaded = new Y.Doc();
  Y.applyUpdate(reloaded, Y.encodeStateAsUpdate(a));
  expect(readDocument(reloaded)).toEqual(readDocument(a));
  ca.dispose();
  cb.dispose();
  a.destroy();
  b.destroy();
  reloaded.destroy();
});
it("concurrent copies rebuild slide/element/group IDs and concurrent sorting keeps all identities", () => {
  const a = createYDocument(createPresentation()),
    ca = new EditorController(a),
    s = readDocument(a).slideOrder[0];
  const first = ca.add(s, "rect"),
    second = ca.add(s, "ellipse");
  ca.group(s, [first, second]);
  const b = new Y.Doc();
  Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
  const cb = new EditorController(b);
  const ac = ca.addSlide(s, readDocument(a).slides[s]),
    bc = cb.addSlide(s, readDocument(b).slides[s]);
  sync(a, b);
  const view = readDocument(a),
    all = view.slideOrder.flatMap((id) => view.slides[id].elementOrder);
  expect(new Set(all).size).toBe(all.length);
  expect(
    view.slides[ac].elements[view.slides[ac].elementOrder[1]].groupId,
  ).not.toBe(view.slides[s].elements[first].groupId);
  ca.moveSlideBefore(ac, s);
  cb.moveSlideBefore(bc, s);
  sync(a, b);
  expect(new Set(readDocument(a).slideOrder).size).toBe(3);
  ca.dispose();
  cb.dispose();
  a.destroy();
  b.destroy();
});
it("preview cache invalidates changed slides only; snapshots are independent and disposal is silent", () => {
  const doc = createYDocument(createPresentation()),
    c = new EditorController(doc),
    a = readDocument(doc).slideOrder[0],
    b = c.addSlide();
  const store = new SlidePreviewStore(doc),
    events: string[][] = [];
  store.subscribe((ids) => events.push(ids));
  c.title("业务标题不影响缩略图");
  expect(events).toEqual([]);
  c.slideProperty(a, "background", "#222222");
  expect(events).toEqual([[a]]);
  const snapshot = store.getSnapshot(a)!;
  snapshot.slide.background = "#ffffff";
  expect(store.getSnapshot(a)!.slide.background).toBe("#222222");
  c.deleteSlide(b);
  expect(store.getSnapshot(b)).toBeNull();
  expect(events.at(-1)).toEqual([b]);
  store.dispose();
  c.dispose();
  doc.destroy();
});
