import { expect, it } from "vitest";
import * as Y from "yjs";
import { createEditor, Editor, Transforms } from "slate";
import { withYjs, YjsEditor } from "@slate-yjs/core";
import { LocalTextOrigin } from "../collaboration/origins";
import { createPresentation, createTextElement } from "./create";
import {
  createYDocument,
  readDocument,
  textOf,
} from "../collaboration/yjs-codec";
import { EditorController } from "./controller";
import {
  captureStyle,
  characterStyle,
  commonStyle,
  DEFAULT_CHARACTER_STYLE,
  DEFAULT_PARAGRAPH_STYLE,
  paragraphStyleOf,
} from "./styles";
import { applyTextStyle, stepSelectedTextSize } from "../react/text-commands";
import type { TextElement } from "./types";
import { exportPptx, importPptx } from "../pptx";
import JSZip from "jszip";

function fixture() {
  const model = createPresentation(),
    sid = model.slideOrder[0];
  const source = model.slides[sid].elements[
    model.slides[sid].elementOrder[0]
  ] as TextElement;
  source.padding = 12;
  source.paragraphs = [
    {
      type: "paragraph",
      align: "center",
      lineHeight: 1.5,
      children: [{ text: "源文字", fontSize: 32, color: "#4472c4" }],
    },
  ];
  const target = createTextElement("目标文字"),
    second = createTextElement("另一个目标");
  target.paragraphs[0].children[0] = {
    text: "目标文字",
    fontSize: 18,
    bold: true,
    italic: true,
    strike: true,
    link: "https://example.com/target",
  };
  for (const el of [target, second]) {
    model.slides[sid].elements[el.id] = el;
    model.slides[sid].elementOrder.push(el.id);
  }
  const doc = createYDocument(model),
    controller = new EditorController(doc);
  const get = (id: string) =>
    readDocument(doc).slides[sid].elements[id] as TextElement;
  return { model, sid, source, target, second, doc, controller, get };
}
it("captures a detached style without content writes or hyperlink destinations", () => {
  const f = fixture(),
    update = () => {
      throw new Error("unexpected content write");
    };
  f.doc.on("update", update);
  f.source.paragraphs[0].children[0].link = "https://source.example/";
  const style = captureStyle(f.source)!;
  expect(style.type === "text" && style.marks).not.toHaveProperty("link");
  f.source.paragraphs[0].children[0].fontSize = 99;
  expect(style.type === "text" && style.marks.fontSize).toBe(32);
  f.controller.dispose();
  f.doc.destroy();
});
it("paints multiple text boxes atomically, replacing old styles but preserving content, links, geometry and text identities", () => {
  const f = fixture(),
    original = f.get(f.target.id),
    text = textOf(f.doc, f.sid, f.target.id);
  const updates: Uint8Array[] = [];
  f.doc.on("update", (update) => updates.push(update));
  f.controller.applyStyle(
    f.sid,
    [f.target.id, f.second.id],
    captureStyle(f.source)!,
  );
  expect(updates).toHaveLength(1);
  expect(f.controller.history.undoStack).toHaveLength(1);
  expect(textOf(f.doc, f.sid, f.target.id)).toBe(text);
  const painted = f.get(f.target.id);
  expect(painted.transform).toEqual(original.transform);
  expect(painted.padding).toBe(12);
  expect(painted.paragraphs[0]).toMatchObject({
    align: "center",
    lineHeight: 1.5,
    children: [
      {
        text: "目标文字",
        fontSize: 32,
        bold: false,
        italic: false,
        strike: false,
        link: "https://example.com/target",
      },
    ],
  });
  f.controller.undo();
  expect(f.get(f.target.id)).toEqual(original);
  expect(f.get(f.second.id).padding).toBeUndefined();
  f.controller.redo();
  expect(f.get(f.second.id).padding).toBe(12);
  f.controller.dispose();
  f.doc.destroy();
});
it("ignores locked, deleted and incompatible targets and readonly style commands", () => {
  const f = fixture();
  f.controller.patch(f.sid, f.target.id, { locked: true });
  const shape = f.controller.add(f.sid, "rect"),
    before = readDocument(f.doc);
  const updates: Uint8Array[] = [];
  f.doc.on("update", (update) => updates.push(update));
  f.controller.applyStyle(
    f.sid,
    [f.target.id, shape, "deleted"],
    captureStyle(f.source)!,
  );
  f.controller.clearTextFormatting(f.sid, [f.target.id]);
  f.controller.stepTextSize(f.sid, [f.target.id], 1);
  expect(readDocument(f.doc)).toEqual(before);
  expect(updates).toHaveLength(0);
  f.controller.setReadOnly(true);
  f.controller.applyStyle(f.sid, [f.second.id], captureStyle(f.source)!);
  f.controller.clearTextFormatting(f.sid, [f.second.id]);
  f.controller.stepTextSize(f.sid, [f.second.id], 1);
  expect(readDocument(f.doc)).toEqual(before);
  expect(updates).toHaveLength(0);
  f.controller.dispose();
  f.doc.destroy();
});
it("clear formatting is one undo step and retains semantic hyperlinks and box styling", () => {
  const f = fixture();
  f.controller.patch(f.sid, f.target.id, {
    background: "#ffc000",
    padding: 16,
  });
  const before = f.get(f.target.id);
  f.controller.clearTextFormatting(f.sid, [f.target.id]);
  expect(f.get(f.target.id)).toMatchObject({
    background: "#ffc000",
    padding: 16,
    paragraphs: [
      {
        ...DEFAULT_PARAGRAPH_STYLE,
        children: [
          {
            ...DEFAULT_CHARACTER_STYLE,
            text: "目标文字",
            link: "https://example.com/target",
          },
        ],
      },
    ],
  });
  f.controller.undo();
  expect(f.get(f.target.id)).toEqual(before);
  f.controller.dispose();
  f.doc.destroy();
});
it("converges painted styles with concurrent text edits and retains remote edits when undone", () => {
  const f = fixture(),
    peer = new Y.Doc();
  Y.applyUpdate(peer, Y.encodeStateAsUpdate(f.doc));
  const peerText = textOf(peer, f.sid, f.target.id)!.toDelta()[0]
    .insert as Y.XmlText;
  peer.transact(() => peerText.insert(0, "远端"));
  f.controller.applyStyle(f.sid, [f.target.id], captureStyle(f.source)!);
  Y.applyUpdate(f.doc, Y.encodeStateAsUpdate(peer));
  Y.applyUpdate(peer, Y.encodeStateAsUpdate(f.doc));
  expect(readDocument(f.doc)).toEqual(readDocument(peer));
  f.controller.undo();
  Y.applyUpdate(peer, Y.encodeStateAsUpdate(f.doc));
  expect(
    f
      .get(f.target.id)
      .paragraphs[0].children.map((leaf) => leaf.text)
      .join(""),
  ).toBe("远端目标文字");
  expect(readDocument(f.doc)).toEqual(readDocument(peer));
  f.controller.dispose();
  f.doc.destroy();
  peer.destroy();
});
it("grows and shrinks each run independently and reports mixed selections", () => {
  const f = fixture();
  f.controller.formatText(f.sid, [f.target.id], { fontSize: 18 });
  const p = textOf(f.doc, f.sid, f.target.id)!.toDelta()[0].insert as Y.XmlText;
  f.controller.run(() => p.format(2, 2, { fontSize: 32 }));
  f.controller.stepTextSize(f.sid, [f.target.id], 1);
  const leaves = f.get(f.target.id).paragraphs[0].children;
  expect(leaves.map((leaf) => leaf.fontSize)).toEqual([20, 36]);
  expect(
    commonStyle(leaves.map((leaf) => characterStyle(leaf))).fontSize,
  ).toBeUndefined();
  f.controller.undo();
  expect(
    f.get(f.target.id).paragraphs[0].children.map((leaf) => leaf.fontSize),
  ).toEqual([18, 32]);
  expect(paragraphStyleOf({ bullet: true }).list).toBe("bullet");
  f.controller.dispose();
  f.doc.destroy();
});
it("Slate style and size commands respect partial ranges and undo without replacing the text root", () => {
  const f = fixture(),
    text = textOf(f.doc, f.sid, f.target.id)!;
  const editor = withYjs(createEditor(), text, {
    localOrigin: new LocalTextOrigin(),
  });
  YjsEditor.connect(editor);
  Transforms.select(editor, {
    anchor: { path: [0, 0], offset: 1 },
    focus: { path: [0, 0], offset: 3 },
  });
  applyTextStyle(editor, f.controller, DEFAULT_CHARACTER_STYLE);
  expect(
    f
      .get(f.target.id)
      .paragraphs[0].children.map((leaf) => [leaf.text, leaf.bold]),
  ).toEqual([
    ["目", true],
    ["标文", false],
    ["字", true],
  ]);
  stepSelectedTextSize(editor, f.controller, 1);
  expect(
    f.get(f.target.id).paragraphs[0].children.map((leaf) => leaf.fontSize),
  ).toEqual([18, 28, 18]);
  f.controller.undo();
  f.controller.undo();
  expect(f.get(f.target.id).paragraphs[0].children).toHaveLength(1);
  expect(Editor.string(editor, [])).toBe("目标文字");
  expect(textOf(f.doc, f.sid, f.target.id)).toBe(text);
  YjsEditor.disconnect(editor);
  f.controller.dispose();
  f.doc.destroy();
});
it("outline/no-fill styles remain editable through PPTX export and import", async () => {
  const f = fixture(),
    a = f.controller.add(f.sid, "rect"),
    b = f.controller.add(f.sid, "ellipse");
  f.controller.patch(f.sid, a, {
    fill: "transparent",
    stroke: "#4472c4",
    strokeWidth: 2,
  });
  f.controller.applyStyle(
    f.sid,
    [b],
    captureStyle(readDocument(f.doc).slides[f.sid].elements[a])!,
  );
  const output = await exportPptx(readDocument(f.doc)),
    bytes = await output.blob.arrayBuffer();
  const zip = await JSZip.loadAsync(bytes),
    xml = await zip.file("ppt/slides/slide1.xml")!.async("string");
  expect(xml).toContain('val="0"');
  const imported = (await importPptx(bytes)).document;
  const shapes = Object.values(
    imported.slides[imported.slideOrder[0]].elements,
  ).filter((el) => el.type === "shape");
  expect(shapes).toHaveLength(2);
  expect(shapes.map((el) => [el.fill, el.stroke, el.strokeWidth])).toEqual([
    ["transparent", "#4472c4", 2],
    ["transparent", "#4472c4", 2],
  ]);
  f.controller.dispose();
  f.doc.destroy();
});
it("quick styles apply to the current paragraph at a caret and retain its position", () => {
  const f = fixture(),
    editor = withYjs(createEditor(), textOf(f.doc, f.sid, f.target.id)!, {
      localOrigin: new LocalTextOrigin(),
    });
  YjsEditor.connect(editor);
  Transforms.select(editor, { path: [0, 0], offset: 2 });
  applyTextStyle(
    editor,
    f.controller,
    { ...DEFAULT_CHARACTER_STYLE, fontSize: 32 },
    DEFAULT_PARAGRAPH_STYLE,
    true,
  );
  expect(f.get(f.target.id).paragraphs[0].children).toEqual([
    {
      ...DEFAULT_CHARACTER_STYLE,
      fontSize: 32,
      text: "目标文字",
      link: "https://example.com/target",
    },
  ]);
  expect(editor.selection?.anchor.offset).toBe(2);
  expect(f.controller.history.undoStack).toHaveLength(1);
  f.controller.undo();
  expect(f.get(f.target.id).paragraphs[0].children[0].fontSize).toBe(18);
  YjsEditor.disconnect(editor);
  f.controller.dispose();
  f.doc.destroy();
});
