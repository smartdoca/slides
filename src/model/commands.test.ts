import { it, expect } from "vitest";
import * as Y from "yjs";
import { createEditor } from "slate";
import { withYjs, YjsEditor } from "@slate-yjs/core";
import { createPresentation } from "./create";
import {
  createYDocument,
  readDocument,
  textOf,
} from "../collaboration/yjs-codec";
import { LocalTextOrigin, REMOTE_ORIGIN } from "../collaboration/origins";
import { EditorController } from "./controller";
import { pxToEmu } from "./types";

function setup() {
  const doc = createYDocument(createPresentation()),
    controller = new EditorController(doc),
    slide = readDocument(doc).slideOrder[0];
  return { doc, controller, slide };
}
it("groups select and move together, duplicate independently, ungroup and undo converge", () => {
  const { doc, controller, slide } = setup(),
    ids = [controller.add(slide, "rect"), controller.add(slide, "ellipse")],
    peer = new Y.Doc();
  Y.applyUpdate(peer, Y.encodeStateAsUpdate(doc));
  const group = controller.group(slide, ids);
  expect(controller.expandSelection(slide, [ids[0]])).toEqual(ids);
  controller.nudge(slide, controller.expandSelection(slide, [ids[0]]), 10, 10);
  const copies = controller.duplicate(slide, [ids[0]]);
  expect(copies).toHaveLength(2);
  expect(readDocument(doc).slides[slide].elements[copies[0]].groupId).not.toBe(
    group,
  );
  controller.ungroup(slide, [ids[0]]);
  expect(controller.expandSelection(slide, [ids[0]])).toEqual([ids[0]]);
  controller.undo();
  expect(controller.expandSelection(slide, [ids[0]])).toEqual(ids);
  Y.applyUpdate(peer, Y.encodeStateAsUpdate(doc));
  expect(readDocument(peer)).toEqual(readDocument(doc));
});
it("pastes a multi-element clipboard as one undoable transaction", () => {
  const { doc, controller, slide } = setup();
  controller.add(slide, "rect");
  controller.add(slide, "ellipse");
  const before = readDocument(doc),
    source = Object.values(before.slides[slide].elements);
  let updates = 0;
  doc.on("update", () => updates++);
  const ids = controller.paste(slide, source);
  expect(updates).toBe(1);
  expect(ids).toHaveLength(3);
  controller.undo();
  expect(readDocument(doc)).toEqual(before);
  controller.redo();
  expect(readDocument(doc).slides[slide].elementOrder).toHaveLength(6);
});
it("distributes three elements, preserves outer edges and respects readonly", () => {
  const { doc, controller, slide } = setup(),
    ids = [
      controller.add(slide, "rect"),
      controller.add(slide, "ellipse"),
      controller.add(slide, "diamond"),
    ];
  ids.forEach((id, i) =>
    controller.patch(slide, id, {
      transform: { x: pxToEmu([0, 50, 800][i]), width: pxToEmu(100) },
    }),
  );
  controller.distribute(slide, ids, "horizontal");
  expect(
    ids.map((id) => readDocument(doc).slides[slide].elements[id].transform.x),
  ).toEqual([0, pxToEmu(400), pxToEmu(800)]);
  const before = Y.encodeStateAsUpdate(doc);
  controller.setReadOnly(true);
  controller.distribute(slide, ids, "vertical");
  controller.pageSize(960, 720);
  expect(Y.encodeStateAsUpdate(doc)).toEqual(before);
});
it("page resize is undoable and converges without moving elements", () => {
  const { doc, controller } = setup(),
    before = readDocument(doc),
    peer = new Y.Doc();
  Y.applyUpdate(peer, Y.encodeStateAsUpdate(doc));
  controller.pageSize(960, 720);
  Y.applyUpdate(peer, Y.encodeStateAsUpdate(doc), REMOTE_ORIGIN);
  expect(readDocument(peer)).toEqual(readDocument(doc));
  expect(readDocument(doc).slides).toEqual(before.slides);
  controller.undo();
  expect(readDocument(doc)).toEqual(before);
});
it("paragraph format reaches the active Slate editor and undoes without rewriting text", () => {
  const { doc, controller, slide } = setup(),
    id = readDocument(doc).slides[slide].elementOrder[0];
  const editor = withYjs(createEditor(), textOf(doc, slide, id)!, {
    localOrigin: new LocalTextOrigin(),
  });
  YjsEditor.connect(editor);
  controller.paragraphFormat(slide, [id], { align: "center", bullet: true });
  expect(editor.children[0]).toMatchObject({ align: "center", bullet: true });
  controller.undo();
  expect(editor.children[0]).not.toHaveProperty("bullet");
  YjsEditor.disconnect(editor);
});
