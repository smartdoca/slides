import { expect, it } from "vitest";
import * as Y from "yjs";
import { createPresentation } from "./create";
import { EditorController } from "./controller";
import {
  createYDocument,
  readDocument,
  textOf,
} from "../collaboration/yjs-codec";
import { tableIds, projectTable } from "./table";
import type { TableElement } from "./types";
it("rejects malformed operations and preserves a cell after concurrent last-row deletions", () => {
  expect(() =>
    projectTable(
      "t",
      [["a"]],
      [{ id: "x", clock: NaN, kind: "insert-row", after: null }],
    ),
  ).toThrow();
  expect(() =>
    projectTable("t", [["a"]], [{ id: "x", clock: 1, kind: "unknown" } as any]),
  ).toThrow();
  const result = projectTable(
    "t",
    [["a"], ["b"]],
    [
      { id: "a", clock: 1, kind: "delete-row", target: "t:r0" },
      { id: "b", clock: 1, kind: "delete-row", target: "t:r1" },
    ],
  );
  expect(result).toEqual({
    rowIds: ["t:empty-row"],
    columnIds: ["t:c0"],
    cells: [[""]],
  });
});
function setup() {
  const a = createYDocument(createPresentation()),
    ca = new EditorController(a),
    s = readDocument(a).slideOrder[0],
    id = ca.add(s, "table");
  ca.history.clear();
  const b = new Y.Doc();
  Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
  const cb = new EditorController(b);
  return {
    a,
    b,
    ca,
    cb,
    s,
    id,
    view: (d = a) =>
      tableIds(readDocument(d).slides[s].elements[id] as TableElement),
    sync: () => {
      Y.applyUpdate(a, Y.encodeStateAsUpdate(b));
      Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
    },
  };
}
it("direct cell edit and row/column insert/delete each undo as one action", () => {
  const f = setup(),
    original = f.view();
  for (const command of [
    {
      kind: "cell",
      row: original.rowIds[1],
      column: original.columnIds[1],
      value: "新内容",
    },
    { kind: "insert-row", after: original.rowIds[0] },
    { kind: "insert-column", after: original.columnIds[0] },
    { kind: "delete-row", target: original.rowIds[1] },
    { kind: "delete-column", target: original.columnIds[1] },
  ] as const) {
    expect(f.ca.tableCommand(f.s, f.id, command)).toBe(true);
    expect(f.view()).not.toEqual(original);
    f.ca.undo();
    expect(f.view()).toEqual(original);
    f.ca.redo();
    expect(f.view()).not.toEqual(original);
    f.ca.undo();
  }
  f.ca.dispose();
  f.cb.dispose();
});
it("concurrent structural edits and independent cell edits preserve stable targets", () => {
  const f = setup(),
    t = f.view();
  f.ca.tableCommand(f.s, f.id, { kind: "insert-row", after: t.rowIds[0] });
  f.cb.tableCommand(f.s, f.id, {
    kind: "cell",
    row: t.rowIds[1],
    column: t.columnIds[1],
    value: "远端编辑",
  });
  f.cb.tableCommand(f.s, f.id, {
    kind: "insert-column",
    after: t.columnIds[0],
  });
  f.ca.tableCommand(f.s, f.id, {
    kind: "cell",
    row: t.rowIds[2],
    column: t.columnIds[2],
    value: "本地编辑",
  });
  f.sync();
  expect(readDocument(f.a)).toEqual(readDocument(f.b));
  const next = f.view();
  expect(
    next.cells[next.rowIds.indexOf(t.rowIds[1])][
      next.columnIds.indexOf(t.columnIds[1])
    ],
  ).toBe("远端编辑");
  expect(
    next.cells[next.rowIds.indexOf(t.rowIds[2])][
      next.columnIds.indexOf(t.columnIds[2])
    ],
  ).toBe("本地编辑");
  const restored = new Y.Doc();
  Y.applyUpdate(restored, Y.encodeStateAsUpdate(f.a));
  expect(readDocument(restored)).toEqual(readDocument(f.a));
  f.ca.dispose();
  f.cb.dispose();
});
it("concurrent same-position insertions, deletions and undo converge", () => {
  const f = setup(),
    t = f.view();
  for (const c of [f.ca, f.cb])
    c.tableCommand(f.s, f.id, { kind: "insert-row", after: t.rowIds[0] });
  f.sync();
  expect(f.view().rowIds.length).toBe(5);
  f.ca.tableCommand(f.s, f.id, {
    kind: "delete-column",
    target: t.columnIds[1],
  });
  f.cb.tableCommand(f.s, f.id, {
    kind: "cell",
    row: t.rowIds[1],
    column: t.columnIds[1],
    value: "hidden",
  });
  f.sync();
  expect(readDocument(f.a)).toEqual(readDocument(f.b));
  f.ca.undo();
  f.sync();
  expect(f.view().cells[3][1]).toBe("hidden");
  f.ca.dispose();
  f.cb.dispose();
});
it("readonly and stale drafts never write; copies get independent stable IDs", () => {
  const f = setup(),
    t = f.view();
  let updates = 0;
  f.a.on("update", () => updates++);
  expect(
    f.ca.tableCommand(f.s, f.id, {
      kind: "cell",
      row: t.rowIds[0],
      column: t.columnIds[0],
      expected: "stale",
      value: "bad",
    }),
  ).toBe(false);
  f.ca.setReadOnly(true);
  f.ca.tableCommand(f.s, f.id, { kind: "insert-row", after: null });
  expect(updates).toBe(0);
  f.ca.setReadOnly(false);
  const id = f.ca.duplicate(f.s, [f.id])[0],
    copy = tableIds(readDocument(f.a).slides[f.s].elements[id] as TableElement);
  expect(copy.cells).toEqual(t.cells);
  expect(copy.rowIds.some((x) => t.rowIds.includes(x))).toBe(false);
  f.ca.dispose();
  f.cb.dispose();
});
