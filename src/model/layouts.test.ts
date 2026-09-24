import { expect, it } from "vitest";
import * as Y from "yjs";
import { createPresentation } from "./create";
import { createSlideLayout, type LayoutKind } from "./layouts";
import { EditorController } from "./controller";
import {
  createYDocument,
  readDocument,
  textOf,
} from "../collaboration/yjs-codec";
import { validateDocument } from "./validate";
it("creates independent editable layouts within 16:9 and 4:3 page bounds", () => {
  for (const size of [
    createPresentation().size,
    { width: 9144000, height: 6858000 },
  ]) {
    for (const kind of [
      "blank",
      "cover",
      "agenda",
      "columns",
    ] as LayoutKind[]) {
      for (const dark of [false, true]) {
        const layout = createSlideLayout(kind, size, dark);
        for (const el of Object.values(layout.elements)) {
          expect(el.transform.x).toBeGreaterThanOrEqual(0);
          expect(el.transform.y).toBeGreaterThanOrEqual(0);
          expect(el.transform.x + el.transform.width).toBeLessThanOrEqual(
            size.width,
          );
          expect(el.transform.y + el.transform.height).toBeLessThanOrEqual(
            size.height,
          );
        }
        const p = createPresentation();
        p.size = size;
        p.slideOrder = [layout.id];
        p.slides = { [layout.id]: layout };
        expect(() => validateDocument(p)).not.toThrow();
      }
    }
  }
});
it("inserts, renames, copies and undoes without replacing existing collaborative text", () => {
  const a = createYDocument(createPresentation()),
    c = new EditorController(a),
    original = readDocument(a),
    first = original.slideOrder[0];
  const text = textOf(a, first, original.slides[first].elementOrder[0]);
  const id = c.addSlide(
    first,
    createSlideLayout("agenda", original.size, true),
  );
  expect(readDocument(a).slides[id].name).toBe("目录");
  expect(readDocument(a).slides[first]).toEqual(original.slides[first]);
  expect(textOf(a, first, original.slides[first].elementOrder[0])).toBe(text);
  c.undo();
  expect(readDocument(a).slideOrder).toEqual([first]);
  c.redo();
  c.slideProperty(id, "name", "新目录");
  const copy = c.addSlide(id, readDocument(a).slides[id]);
  expect(readDocument(a).slides[copy].name).toBe("新目录");
  expect(
    readDocument(a).slides[copy].elementOrder.every(
      (x) => !readDocument(a).slides[id].elements[x],
    ),
  ).toBe(true);
  const b = new Y.Doc();
  Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
  const cb = new EditorController(b);
  cb.slideProperty(id, "name", "远端名称");
  c.slideProperty(id, "notes", "本地备注");
  Y.applyUpdate(a, Y.encodeStateAsUpdate(b));
  Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
  expect(readDocument(a)).toEqual(readDocument(b));
  expect(readDocument(a).slides[id].name).toBe("远端名称");
  expect(readDocument(a).slides[id].notes).toBe("本地备注");
  const checkpoint = new Y.Doc();
  Y.applyUpdate(checkpoint, Y.encodeStateAsUpdate(a));
  expect(readDocument(checkpoint)).toEqual(readDocument(a));
  c.setReadOnly(true);
  const before = Y.encodeStateVector(a);
  c.slideProperty(id, "name", "forbidden");
  c.addSlide(id, createSlideLayout("cover", original.size, true));
  expect(Y.encodeStateVector(a)).toEqual(before);
  c.dispose();
  cb.dispose();
});
