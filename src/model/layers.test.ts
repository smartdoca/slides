import { expect, it } from "vitest";
import { createPresentation } from "./create";
import {
  createYDocument,
  readDocument,
  textOf,
} from "../collaboration/yjs-codec";
import { EditorController } from "./controller";
it("right-click layer commands preserve relative order, text identity, undo and readonly", () => {
  const d = createYDocument(createPresentation()),
    c = new EditorController(d),
    s = readDocument(d).slideOrder[0];
  const t = readDocument(d).slides[s].elementOrder[0],
    a = c.add(s, "rect"),
    b = c.add(s, "ellipse"),
    e = c.add(s, "triangle");
  const text = textOf(d, s, t),
    order = () => readDocument(d).slides[s].elementOrder;
  for (const [action, ids, expected] of [
    ["front", [t, a], [b, e, t, a]],
    ["back", [b, e], [b, e, t, a]],
    ["forward", [t, a], [b, t, a, e]],
    ["backward", [b, e], [t, b, e, a]],
  ] as const) {
    c.arrange(s, [...ids], action);
    expect(order()).toEqual(expected);
    expect(textOf(d, s, t)).toBe(text);
    c.undo();
    expect(order()).toEqual([t, a, b, e]);
    c.redo();
    expect(order()).toEqual(expected);
    c.undo();
  }
  c.setReadOnly(true);
  c.arrange(s, [t], "front");
  expect(order()).toEqual([t, a, b, e]);
  c.dispose();
});
