import { it, expect } from "vitest";
import { createEditor, Transforms, Node } from "slate";
import { withYjs, YjsEditor } from "@slate-yjs/core";
import { createPresentation } from "./create";
import {
  createYDocument,
  readDocument,
  textOf,
} from "../collaboration/yjs-codec";
import { EditorController } from "./controller";
import { findText, replaceMatches, resolveAnchor } from "./anchors";
import { LocalTextOrigin } from "../collaboration/origins";
it("finds across formatted leaves, replaces in one undo group and updates an open Slate editor", () => {
  const model = createPresentation(),
    slideId = model.slideOrder[0],
    id = model.slides[slideId].elementOrder[0];
  const element = model.slides[slideId].elements[id];
  if (element.type !== "text") throw new Error("fixture");
  element.paragraphs = [
    {
      type: "paragraph",
      children: [{ text: "Hello ", bold: true }, { text: "world world" }],
    },
  ];
  const doc = createYDocument(model),
    controller = new EditorController(doc),
    editor = withYjs(createEditor(), textOf(doc, slideId, id)!, {
      localOrigin: new LocalTextOrigin(),
    });
  YjsEditor.connect(editor);
  expect(findText(doc, "hello world")).toHaveLength(1);
  expect(controller.replaceAll("world", "PPT")).toBe(2);
  expect(Node.string(editor)).toBe("Hello PPT PPT");
  expect((editor.children[0] as any).children).toEqual([
    { text: "Hello ", bold: true },
    { text: "PPT PPT" },
  ]);
  controller.undo();
  expect(Node.string(editor)).toBe("Hello world world");
  YjsEditor.disconnect(editor);
});
it("relative anchors move with text and orphan on element deletion", () => {
  const doc = createYDocument(createPresentation()),
    controller = new EditorController(doc),
    view = readDocument(doc),
    slide = view.slideOrder[0],
    id = view.slides[slide].elementOrder[0];
  const match = findText(doc, "协同")[0];
  const editor = withYjs(createEditor(), textOf(doc, slide, id)!, {
    localOrigin: new LocalTextOrigin(),
  });
  YjsEditor.connect(editor);
  Transforms.insertText(editor, "prefix ", { at: { path: [0, 0], offset: 0 } });
  YjsEditor.flushLocalChanges(editor);
  expect(resolveAnchor(doc, match.anchor)).not.toBeNull();
  expect(replaceMatches(doc, [match], "多人")).toBe(1);
  YjsEditor.disconnect(editor);
  controller.remove(slide, [id]);
  expect(resolveAnchor(doc, match.anchor)).toBeNull();
});
it("refuses stale text matches and guards readonly replace", () => {
  const doc = createYDocument(createPresentation()),
    controller = new EditorController(doc),
    match = findText(doc, "EPPT")[0];
  controller.replaceAll("EPPT", "Changed");
  expect(replaceMatches(doc, [match], "bad")).toBe(0);
  controller.setReadOnly(true);
  expect(controller.replaceAll("Changed", "bad")).toBe(0);
});
it("keeps original Unicode offsets and treats query punctuation literally", () => {
  const model = createPresentation(),
    slide = model.slides[model.slideOrder[0]],
    text = slide.elements[slide.elementOrder[0]];
  if (text.type !== "text") throw new Error("fixture");
  text.paragraphs = [
    { type: "paragraph", children: [{ text: "İ A+B 👩‍💻 A+B" }] },
  ];
  const doc = createYDocument(model),
    controller = new EditorController(doc);
  const matches = controller.find("a+b");
  expect(matches).toHaveLength(2);
  expect(matches.map((m) => m.text)).toEqual(["A+B", "A+B"]);
  expect(controller.replaceMatch(matches[1], "完成")).toBe(1);
  expect(JSON.stringify(readDocument(doc))).toContain("İ A+B 👩‍💻 完成");
  controller.undo();
  expect(JSON.stringify(readDocument(doc))).toContain("İ A+B 👩‍💻 A+B");
  controller.setReadOnly(true);
  expect(controller.replaceMatch(controller.find("A+B")[0], "禁止")).toBe(0);
});
