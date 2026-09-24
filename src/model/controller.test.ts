import { describe, it, expect } from "vitest";
import * as Y from "yjs";
import { createEditor, Transforms } from "slate";
import { withYjs, YjsEditor } from "@slate-yjs/core";
import { createPresentation } from "./create";
import { EditorController } from "./controller";
import {
  createYDocument,
  readDocument,
  textOf,
  patchElement,
  replaceDocument,
} from "../collaboration/yjs-codec";
import { LOCAL_ORIGIN, REMOTE_ORIGIN } from "../collaboration/origins";

function setup() {
  const a = createYDocument(createPresentation()),
    b = new Y.Doc();
  Y.applyUpdate(b, Y.encodeStateAsUpdate(a), REMOTE_ORIGIN);
  const ca = new EditorController(a),
    cb = new EditorController(b);
  const view = readDocument(a),
    slide = view.slideOrder[0],
    element = view.slides[slide].elementOrder[0];
  const exchange = () => {
    const ua = Y.encodeStateAsUpdate(a, Y.encodeStateVector(b)),
      ub = Y.encodeStateAsUpdate(b, Y.encodeStateVector(a));
    Y.applyUpdate(a, ub, REMOTE_ORIGIN);
    Y.applyUpdate(b, ua, REMOTE_ORIGIN);
  };
  return { a, b, ca, cb, slide, element, exchange };
}
describe("editing and collaboration contracts", () => {
  it("merges independent position and style fields with no lost changes", () => {
    const s = setup();
    s.ca.patch(s.slide, s.element, { transform: { x: 100 } });
    s.cb.patch(s.slide, s.element, { transform: { y: 200 }, fill: "#aa0000" });
    s.exchange();
    const el = readDocument(s.a).slides[s.slide].elements[s.element];
    expect(el.transform.x).toBe(100);
    expect(el.transform.y).toBe(200);
    expect((el as any).fill).toBe("#aa0000");
    expect(readDocument(s.a)).toEqual(readDocument(s.b));
  });
  it("merges simultaneous character insertions instead of replacing whole text", () => {
    const s = setup();
    const ea = withYjs(createEditor(), textOf(s.a, s.slide, s.element)!, {
      localOrigin: LOCAL_ORIGIN,
    });
    const eb = withYjs(createEditor(), textOf(s.b, s.slide, s.element)!, {
      localOrigin: LOCAL_ORIGIN,
    });
    YjsEditor.connect(ea);
    YjsEditor.connect(eb);
    Transforms.insertText(ea, "AAA", { at: { path: [0, 0], offset: 0 } });
    Transforms.insertText(eb, "BBB", { at: { path: [0, 0], offset: 0 } });
    YjsEditor.flushLocalChanges(ea);
    YjsEditor.flushLocalChanges(eb);
    s.exchange();
    expect(ea.children).toEqual(eb.children);
    const text = JSON.stringify(ea.children);
    expect(text).toContain("AAA");
    expect(text).toContain("BBB");
    expect(readDocument(s.a)).toEqual(readDocument(s.b));
    YjsEditor.disconnect(ea);
    YjsEditor.disconnect(eb);
  });
  it("selection and opening Slate do not write shared content", () => {
    const s = setup();
    let writes = 0;
    s.a.on("update", () => writes++);
    const editor = withYjs(createEditor(), textOf(s.a, s.slide, s.element)!, {
      localOrigin: LOCAL_ORIGIN,
    });
    YjsEditor.connect(editor);
    Transforms.select(editor, { path: [0, 0], offset: 1 });
    YjsEditor.flushLocalChanges(editor);
    YjsEditor.disconnect(editor);
    expect(writes).toBe(0);
  });
  it("undo changes only local fields; redo preserves remote changes", () => {
    const s = setup();
    s.ca.patch(s.slide, s.element, { transform: { x: 400 } });
    s.cb.patch(s.slide, s.element, { fill: "#abcdef" });
    s.exchange();
    s.ca.undo();
    s.exchange();
    expect(
      readDocument(s.a).slides[s.slide].elements[s.element].transform.x,
    ).not.toBe(400);
    expect(
      (readDocument(s.a).slides[s.slide].elements[s.element] as any).fill,
    ).toBe("#abcdef");
    s.ca.redo();
    s.exchange();
    expect(readDocument(s.a)).toEqual(readDocument(s.b));
    expect(
      readDocument(s.a).slides[s.slide].elements[s.element].transform.x,
    ).toBe(400);
  });
  it("enforces readonly for commands and undo with no content transactions", () => {
    const s = setup();
    s.ca.add(s.slide, "rect");
    const before = Y.encodeStateAsUpdate(s.a);
    s.ca.setReadOnly(true);
    s.ca.patch(s.slide, s.element, { fill: "#123456" });
    s.ca.deleteSlide(s.slide);
    s.ca.addSlide();
    s.ca.undo();
    s.ca.title("forbidden");
    expect(Y.encodeStateAsUpdate(s.a)).toEqual(before);
  });
  it("concurrent page additions and reorder converge with unique visible IDs", () => {
    const s = setup();
    const a = s.ca.addSlide(s.slide),
      b = s.cb.addSlide(s.slide);
    s.exchange();
    s.ca.moveSlide(a, -1);
    s.cb.moveSlide(a, 1);
    s.exchange();
    expect(readDocument(s.a)).toEqual(readDocument(s.b));
    const order = readDocument(s.a).slideOrder;
    expect(new Set(order).size).toBe(order.length);
    expect(order).toContain(a);
    expect(order).toContain(b);
  });
  it("delete racing a property edit stays deleted and restores identically", () => {
    const s = setup();
    s.ca.remove(s.slide, [s.element]);
    s.cb.patch(s.slide, s.element, { fill: "#ff0000" });
    s.exchange();
    expect(readDocument(s.a)).toEqual(readDocument(s.b));
    expect(readDocument(s.a).slides[s.slide].elementOrder).toEqual([]);
    const restored = new Y.Doc();
    Y.applyUpdate(restored, Y.encodeStateAsUpdate(s.a));
    expect(readDocument(restored)).toEqual(readDocument(s.a));
  });
  it("duplicates independent text identities and roundtrips every supported element", () => {
    const s = setup();
    for (const type of [
      "rect",
      "ellipse",
      "roundRect",
      "triangle",
      "diamond",
      "line",
      "table",
      "chart",
    ] as const)
      s.ca.add(s.slide, type);
    const [copy] = s.ca.duplicate(s.slide, [s.element]);
    expect(textOf(s.a, s.slide, copy)).not.toBe(
      textOf(s.a, s.slide, s.element),
    );
    s.ca.formatText(s.slide, [copy], { bold: true });
    s.exchange();
    expect(readDocument(s.a)).toEqual(readDocument(s.b));
    const reloaded = new Y.Doc();
    Y.applyUpdate(reloaded, Y.encodeStateAsUpdate(s.a));
    expect(readDocument(reloaded)).toEqual(readDocument(s.a));
  });
  it("forbids replacing a live baseline and detects no-op property edits", () => {
    const s = setup();
    expect(() => replaceDocument(s.a, createPresentation())).toThrow(
      "DOCUMENT_ALREADY_INITIALIZED",
    );
    let writes = 0;
    s.a.on("update", () => writes++);
    const el = readDocument(s.a).slides[s.slide].elements[s.element];
    patchElement(s.a, s.slide, s.element, { transform: el.transform });
    expect(writes).toBe(0);
  });
});
