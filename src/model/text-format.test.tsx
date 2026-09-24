import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import * as Y from "yjs";
import { RichTextView, leafStyle, paragraphStyle } from "../react/text";
import { paragraphMarkers, safeTextLink } from "./text-format";
import { createPresentation } from "./create";
import { createYDocument, readDocument } from "../collaboration/yjs-codec";
import { EditorController } from "./controller";
import { validateDocument } from "./validate";
import { exportPptx, importPptx } from "../pptx";
import type { TextElement, TextParagraph } from "./types";
import { createEditor, Editor, Transforms } from "slate";
import { withYjs, YjsEditor } from "@slate-yjs/core";
import { textOf } from "../collaboration/yjs-codec";
import { LocalTextOrigin } from "../collaboration/origins";
import { runTextCommand } from "../react/text-commands";

const paragraph = (text: string, indentLevel = 0): TextParagraph => ({
  type: "paragraph",
  list: "number",
  indentLevel,
  children: [{ text, fontSize: 24 }],
});
it("rapid Slate toolbar actions are separate undo steps without changing text identity", () => {
  const model = createPresentation(),
    doc = createYDocument(model),
    c = new EditorController(doc);
  const sid = model.slideOrder[0],
    id = model.slides[sid].elementOrder[0],
    text = textOf(doc, sid, id)!;
  const editor = withYjs(createEditor(), text, {
    localOrigin: new LocalTextOrigin(),
  });
  YjsEditor.connect(editor);
  Transforms.select(editor, Editor.range(editor, []));
  runTextCommand(editor, c, () =>
    Editor.addMark(editor, "link", "https://example.com/"),
  );
  runTextCommand(editor, c, () =>
    Editor.addMark(editor, "script", "superscript"),
  );
  expect(c.history.undoStack).toHaveLength(2);
  c.undo();
  const element = readDocument(doc).slides[sid].elements[id] as TextElement;
  expect(element.paragraphs[0].children[0].link).toBe("https://example.com/");
  expect(element.paragraphs[0].children[0].script).toBeUndefined();
  expect(textOf(doc, sid, id)).toBe(text);
  YjsEditor.disconnect(editor);
  c.dispose();
  doc.destroy();
});
it("numbers hierarchical paragraphs and resets after a non-list block", () => {
  const paragraphs = [
    paragraph("一"),
    paragraph("子项", 1),
    paragraph("另一子项", 1),
    paragraph("二"),
    { ...paragraph("正文"), list: "none" as const },
    paragraph("重启"),
  ];
  expect(paragraphMarkers(paragraphs)).toEqual([
    "1.",
    "1.1.",
    "1.2.",
    "2.",
    "",
    "1.",
  ]);
  const style = paragraphStyle({
    ...paragraph("一", 2),
    lineHeight: 1.5,
    spaceBefore: 6,
    spaceAfter: 9,
  });
  expect(style).toMatchObject({
    lineHeight: 1.5,
    paddingLeft: 92,
    marginTop: 8,
    marginBottom: 12,
  });
  expect(
    leafStyle({ text: "2", script: "superscript", strike: true }),
  ).toMatchObject({
    fontSize: 22.4,
    verticalAlign: "super",
    textDecoration: "line-through",
  });
});
it.each([
  "javascript:alert(1)",
  "data:text/html,a",
  "file:///tmp/a",
  "//example.com",
  "https://user:pass@example.com",
  "java\nscript:1",
])("rejects unsafe text link %s", (value) => {
  expect(safeTextLink(value)).toBeNull();
  const markup = renderToStaticMarkup(
    <RichTextView
      paragraphs={[
        { type: "paragraph", children: [{ text: "安全文字", link: value }] },
      ]}
      interactiveLinks
    />,
  );
  expect(markup).not.toContain("href=");
});
it("only interactive previews render safe links, with opener isolation", () => {
  const paragraphs: TextParagraph[] = [
    {
      type: "paragraph",
      children: [{ text: "链接", link: "https://example.com" }],
    },
  ];
  const markup = renderToStaticMarkup(
    <RichTextView paragraphs={paragraphs} interactiveLinks />,
  );
  expect(markup).toContain('href="https://example.com/"');
  expect(markup).toContain('rel="noopener noreferrer"');
  expect(
    renderToStaticMarkup(<RichTextView paragraphs={paragraphs} />),
  ).not.toContain("<a");
});
it("paragraph and character formatting merge, undo independently and roundtrip through checkpoints/PPTX", async () => {
  const initial = createPresentation(),
    sid = initial.slideOrder[0],
    id = initial.slides[sid].elementOrder[0];
  const initialText = initial.slides[sid].elements[id] as TextElement;
  initialText.paragraphs = [paragraph("中文标题"), paragraph("内容")];
  const a = createYDocument(initial),
    b = new Y.Doc();
  Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
  const ca = new EditorController(a),
    cb = new EditorController(b);
  ca.paragraphFormat(sid, [id], {
    lineHeight: 1.5,
    spaceBefore: 6,
    spaceAfter: 9,
    indentLevel: 1,
  });
  cb.formatText(sid, [id], {
    script: "superscript",
    strike: true,
    link: "https://example.com/",
  });
  Y.applyUpdate(a, Y.encodeStateAsUpdate(b));
  Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
  expect(readDocument(a)).toEqual(readDocument(b));
  ca.patch(sid, id, { padding: 12 });
  const snapshot = readDocument(a);
  validateDocument(snapshot);
  const text = snapshot.slides[sid].elements[id] as TextElement;
  expect(text.paragraphs[0]).toMatchObject({
    lineHeight: 1.5,
    indentLevel: 1,
    children: [{ script: "superscript", strike: true }],
  });
  const checkpoint = new Y.Doc();
  Y.applyUpdate(checkpoint, Y.encodeStateAsUpdate(a));
  expect(readDocument(checkpoint)).toEqual(snapshot);
  const restored = (
    await importPptx(await (await exportPptx(snapshot)).blob.arrayBuffer())
  ).document;
  const imported = Object.values(
    restored.slides[restored.slideOrder[0]].elements,
  ).find((e) => e.type === "text") as TextElement;
  expect(imported.padding).toBe(12);
  expect(imported.paragraphs[0]).toMatchObject({
    list: "number",
    indentLevel: 1,
    lineHeight: 1.5,
    spaceBefore: 6,
    spaceAfter: 9,
  });
  expect(imported.paragraphs[0].children[0]).toMatchObject({
    script: "superscript",
    strike: true,
    link: "https://example.com/",
  });
  ca.undo();
  ca.undo();
  const undone = readDocument(a).slides[sid].elements[id] as TextElement;
  expect(undone.paragraphs[0].lineHeight).toBeUndefined();
  expect(undone.paragraphs[0].children[0].script).toBe("superscript");
  const before = readDocument(a);
  expect(() =>
    ca.formatText(sid, [id], { link: "javascript:alert(1)" }),
  ).toThrow();
  expect(() => ca.paragraphFormat(sid, [id], { indentLevel: 2.5 })).toThrow();
  expect(readDocument(a)).toEqual(before);
  ca.setReadOnly(true);
  ca.formatText(sid, [id], { script: "subscript" });
  expect(readDocument(a)).toEqual(before);
  ca.dispose();
  cb.dispose();
  a.destroy();
  b.destroy();
  checkpoint.destroy();
});
