import { expect, it, vi } from "vitest";
import * as Y from "yjs";
import JSZip from "jszip";
import { createPresentation } from "./create";
import {
  createYDocument,
  readDocument,
  textOf,
} from "../collaboration/yjs-codec";
import { EditorController } from "./controller";
import { captureStyle, stepFontSize } from "./styles";
import { textInsets, textPadding } from "./text-format";
import { leafStyle } from "../react/text";
import { validateDocument } from "./validate";
import type { TextElement } from "./types";
import { exportPptx, importPptx } from "../pptx";

function fixture() {
  const model = createPresentation(),
    sid = model.slideOrder[0],
    id = model.slides[sid].elementOrder[0];
  const doc = createYDocument(model),
    controller = new EditorController(doc);
  const get = () => readDocument(doc).slides[sid].elements[id] as TextElement;
  return { model, doc, controller, sid, id, get };
}
it("merges individual text margins, preserves text identity and undoes a single field", () => {
  const f = fixture(),
    root = textOf(f.doc, f.sid, f.id);
  f.controller.patch(f.sid, f.id, { padding: 8, paddingInsets: { left: 12 } });
  f.controller.patch(f.sid, f.id, { paddingInsets: { top: 20 } });
  expect(textInsets(f.get())).toEqual({
    top: 20,
    right: 8,
    bottom: 8,
    left: 12,
  });
  expect(textPadding(f.get())).toBe("20px 8px 8px 12px");
  expect(captureStyle(f.get())).toMatchObject({
    box: { paddingInsets: { top: 20, right: 8, bottom: 8, left: 12 } },
  });
  f.controller.undo();
  expect(textInsets(f.get()).top).toBe(8);
  expect(textOf(f.doc, f.sid, f.id)).toBe(root);
  f.controller.dispose();
  f.doc.destroy();
});
it("merges concurrent individual margins and spacing with zero readonly writes", () => {
  const f = fixture();
  f.controller.patch(f.sid, f.id, { paddingInsets: { left: 8, top: 8 } });
  const peer = new Y.Doc();
  Y.applyUpdate(peer, Y.encodeStateAsUpdate(f.doc));
  const remote = new EditorController(peer);
  f.controller.patch(f.sid, f.id, { paddingInsets: { left: 24 } });
  remote.patch(f.sid, f.id, { paddingInsets: { top: 16 } });
  remote.formatText(f.sid, [f.id], { letterSpacing: 2.5 });
  Y.applyUpdate(f.doc, Y.encodeStateAsUpdate(peer));
  Y.applyUpdate(peer, Y.encodeStateAsUpdate(f.doc));
  expect(readDocument(peer)).toEqual(readDocument(f.doc));
  expect(textInsets(f.get())).toMatchObject({ left: 24, top: 16 });
  expect(
    leafStyle(f.get().paragraphs[0].children[0]).letterSpacing,
  ).toBeCloseTo(10 / 3);
  const updates = vi.fn();
  f.doc.on("update", updates);
  f.controller.setReadOnly(true);
  f.controller.patch(f.sid, f.id, { paddingInsets: { right: 99 } });
  f.controller.formatText(f.sid, [f.id], { letterSpacing: 9 });
  expect(updates).not.toHaveBeenCalled();
  f.controller.dispose();
  remote.dispose();
  f.doc.destroy();
  peer.destroy();
});
it("validates text margins and character spacing and supports one-point font steps", () => {
  const f = fixture();
  for (const value of [
    { top: -1 },
    { right: NaN },
    { bottom: 201 },
    { diagonal: 1 },
  ])
    expect(() =>
      f.controller.patch(f.sid, f.id, { paddingInsets: value }),
    ).toThrow("INVALID_TEXT_PADDING");
  expect(() =>
    f.controller.formatText(f.sid, [f.id], { letterSpacing: 101 }),
  ).toThrow();
  const invalid = structuredClone(f.model),
    text = invalid.slides[f.sid].elements[f.id] as TextElement;
  text.paddingInsets = { top: -1 };
  expect(() => validateDocument(invalid)).toThrow("INVALID_TEXT_PADDING");
  expect(stepFontSize(54, 1, 1)).toBe(55);
  expect(stepFontSize(6, -1, 1)).toBe(6);
  f.controller.dispose();
  f.doc.destroy();
});
it("retains four text margins and character spacing through editable PPTX", async () => {
  const f = fixture();
  f.controller.patch(f.sid, f.id, {
    paddingInsets: { top: 6, right: 12, bottom: 18, left: 24 },
  });
  f.controller.formatText(f.sid, [f.id], { letterSpacing: 2.5 });
  const bytes = await (
    await exportPptx(readDocument(f.doc))
  ).blob.arrayBuffer();
  const xml = await (
    await JSZip.loadAsync(bytes)
  )
    .file("ppt/slides/slide1.xml")!
    .async("string");
  expect(xml).toContain('spc="250"');
  const imported = (await importPptx(bytes)).document,
    slide = imported.slides[imported.slideOrder[0]],
    text = slide.elements[slide.elementOrder[0]] as TextElement;
  expect(textInsets(text)).toEqual({ top: 6, right: 12, bottom: 18, left: 24 });
  expect(text.paragraphs[0].children[0].letterSpacing).toBe(2.5);
  f.controller.dispose();
  f.doc.destroy();
});
