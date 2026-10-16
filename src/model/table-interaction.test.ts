import { expect, it, vi } from "vitest";
import * as Y from "yjs";
import JSZip from "jszip";
import { createPresentation } from "./create";
import { EditorController } from "./controller";
import {
  createYDocument,
  readDocument,
  elementOf,
} from "../collaboration/yjs-codec";
import {
  tableBounds,
  tableClipboard,
  tableIds,
  parseTableTsv,
  tableTsv,
  validTableClipboard,
  tableMetrics,
  type TableCommand,
} from "./table";
import type { TableElement } from "./types";
import { exportPptx, importPptx } from "../pptx";
function fixture() {
  const doc = createYDocument(createPresentation()),
    c = new EditorController(doc),
    sid = readDocument(doc).slideOrder[0],
    id = c.add(sid, "table");
  c.history.clear();
  const get = () => readDocument(doc).slides[sid].elements[id] as TableElement;
  const command = (cmd: TableCommand) => c.tableCommand(sid, id, cmd);
  return { doc, c, sid, id, get, command };
}
it("pastes a matrix with expansion as one undo step and never mutates the cell baseline", () => {
  const f = fixture(),
    before = structuredClone(f.get()),
    baseline = elementOf(f.doc, f.sid, f.id)!.get("cells"),
    ids = tableIds(before);
  const data = {
    version: 1 as const,
    cells: [
      ["a", "b"],
      ["c", "d"],
    ],
  };
  expect(
    f.command({
      kind: "paste",
      row: ids.rowIds.at(-1)!,
      column: ids.columnIds.at(-1)!,
      payload: data,
    }),
  ).toBe(true);
  data.cells[0][0] = "MUTATED";
  expect(f.get().cells.map((row) => row.slice(2))).toEqual([
    ["目标", ""],
    ["90", ""],
    ["a", "b"],
    ["c", "d"],
  ]);
  expect(elementOf(f.doc, f.sid, f.id)!.get("cells")).toBe(baseline);
  expect(f.c.history.undoStack).toHaveLength(1);
  f.c.undo();
  expect(f.get()).toEqual(before);
  f.c.redo();
  expect(f.get().cells[2][2]).toBe("a");
  f.c.dispose();
  f.doc.destroy();
});
it("merges, expands selection across merges, splits without losing text and restores original cells on undo", () => {
  const f = fixture(),
    before = f.get(),
    ids = tableIds(before);
  f.command({
    kind: "merge",
    rows: ids.rowIds.slice(1),
    columns: ids.columnIds.slice(0, 2),
  });
  expect(f.get().merges?.[0]).toMatchObject({
    row: 1,
    column: 0,
    rowSpan: 2,
    columnSpan: 2,
  });
  expect(f.get().cells[1][0]).toBe("产品\n72\n增长\n46");
  expect(
    tableBounds(f.get(), { row: 2, column: 1 }, { row: 2, column: 2 }),
  ).toEqual({ top: 1, left: 0, bottom: 2, right: 2 });
  f.command({ kind: "split", targets: [f.get().merges![0].id] });
  expect(f.get().merges).toBeUndefined();
  expect(f.get().cells[1][0]).toContain("增长");
  f.c.undo();
  f.c.undo();
  expect(f.get()).toEqual(before);
  f.c.dispose();
  f.doc.destroy();
});
it("deleting a merged anchor moves its content to the surviving cell", () => {
  const f = fixture(),
    ids = tableIds(f.get());
  f.command({
    kind: "merge",
    rows: ids.rowIds.slice(1),
    columns: ids.columnIds.slice(0, 2),
  });
  f.command({ kind: "delete-row", target: ids.rowIds[1] });
  expect(f.get().cells[1][0]).toBe("产品\n72\n增长\n46");
  expect(f.get().merges?.[0]).toMatchObject({
    row: 1,
    rowSpan: 1,
    columnSpan: 2,
  });
  f.c.dispose();
  f.doc.destroy();
});
it("styles and clears a range in one step each, retaining formatting through clear", () => {
  const f = fixture(),
    ids = tableIds(f.get()),
    targets = { rows: ids.rowIds.slice(1), columns: ids.columnIds };
  f.command({
    kind: "style",
    ...targets,
    style: { bold: true, backgroundColor: "#fff3b0", align: "center" },
  });
  expect(f.get().cellStyles?.[2][2]).toMatchObject({
    bold: true,
    align: "center",
  });
  f.command({ kind: "clear", ...targets });
  expect(f.get().cells.slice(1)).toEqual([
    ["", "", ""],
    ["", "", ""],
  ]);
  expect(f.get().cellStyles?.[2][2].bold).toBe(true);
  f.c.undo();
  expect(f.get().cells[1][1]).toBe("72");
  f.c.undo();
  expect(f.get().cellStyles).toBeUndefined();
  f.c.dispose();
  f.doc.destroy();
});
it("concurrent style fields, structural insertion, matrix paste and resize converge and restore", () => {
  const f = fixture(),
    ids = tableIds(f.get()),
    peer = new Y.Doc();
  Y.applyUpdate(peer, Y.encodeStateAsUpdate(f.doc));
  const other = new EditorController(peer);
  f.command({
    kind: "style",
    rows: [ids.rowIds[1]],
    columns: [ids.columnIds[1]],
    style: { bold: true },
  });
  other.tableCommand(f.sid, f.id, {
    kind: "style",
    rows: [ids.rowIds[1]],
    columns: [ids.columnIds[1]],
    style: { color: "#d83931" },
  });
  f.command({
    kind: "paste",
    row: ids.rowIds[2],
    column: ids.columnIds[2],
    payload: { version: 1, cells: [["贴", "尾"]] },
  });
  other.tableCommand(f.sid, f.id, { kind: "insert-row", after: ids.rowIds[0] });
  other.tableCommand(f.sid, f.id, {
    kind: "resize",
    axis: "column",
    sizes: [{ target: ids.columnIds[0], size: 120 }],
  });
  const echo = vi.fn();
  peer.on("update", echo);
  Y.applyUpdate(f.doc, Y.encodeStateAsUpdate(peer));
  Y.applyUpdate(peer, Y.encodeStateAsUpdate(f.doc));
  expect(readDocument(peer)).toEqual(readDocument(f.doc));
  const t = tableIds(f.get());
  expect(
    f.get().cellStyles?.[t.rowIds.indexOf(ids.rowIds[1])][
      t.columnIds.indexOf(ids.columnIds[1])
    ],
  ).toMatchObject({ bold: true, color: "#d83931" });
  expect(f.get().cells[t.rowIds.indexOf(ids.rowIds[2])].slice(2)).toEqual([
    "贴",
    "尾",
  ]);
  const restored = new Y.Doc();
  Y.applyUpdate(restored, Y.encodeStateAsUpdate(f.doc));
  expect(readDocument(restored)).toEqual(readDocument(f.doc));
  f.c.undo();
  Y.applyUpdate(peer, Y.encodeStateAsUpdate(f.doc));
  expect(readDocument(peer)).toEqual(readDocument(f.doc));
  f.c.dispose();
  other.dispose();
  f.doc.destroy();
  peer.destroy();
  restored.destroy();
});
it("conflicting merges and deletion converge independently of update arrival order", () => {
  const f = fixture(),
    ids = tableIds(f.get()),
    peer = new Y.Doc();
  Y.applyUpdate(peer, Y.encodeStateAsUpdate(f.doc));
  const c = new EditorController(peer);
  f.command({
    kind: "merge",
    rows: ids.rowIds.slice(0, 2),
    columns: ids.columnIds.slice(0, 2),
  });
  c.tableCommand(f.sid, f.id, {
    kind: "merge",
    rows: ids.rowIds.slice(1),
    columns: ids.columnIds.slice(1),
  });
  Y.applyUpdate(f.doc, Y.encodeStateAsUpdate(peer));
  Y.applyUpdate(peer, Y.encodeStateAsUpdate(f.doc));
  expect(readDocument(peer)).toEqual(readDocument(f.doc));
  expect(f.get().merges?.[0]).toMatchObject({
    row: 0,
    column: 0,
    rowSpan: 3,
    columnSpan: 3,
  });
  for (const value of [
    "项目",
    "本期",
    "目标",
    "产品",
    "72",
    "90",
    "增长",
    "46",
    "60",
  ])
    expect(f.get().cells[0][0]).toContain(value);
  f.c.dispose();
  c.dispose();
  f.doc.destroy();
  peer.destroy();
});
it("preserves table formatting and merged geometry in independent copies", () => {
  const f = fixture(),
    ids = tableIds(f.get());
  f.command({
    kind: "style",
    rows: ids.rowIds,
    columns: ids.columnIds,
    style: { fontSize: 20, color: "#6425d0" },
  });
  f.command({
    kind: "merge",
    rows: [ids.rowIds[0]],
    columns: ids.columnIds.slice(0, 2),
  });
  const copy = f.c.duplicate(f.sid, [f.id])[0],
    t = readDocument(f.doc).slides[f.sid].elements[copy] as TableElement;
  expect(t.cells).toEqual(f.get().cells);
  expect(t.cellStyles).toEqual(f.get().cellStyles);
  expect(t.merges?.[0]).toMatchObject({ row: 0, column: 0, columnSpan: 2 });
  expect(t.rowIds?.some((id) => ids.rowIds.includes(id))).toBe(false);
  f.c.dispose();
  f.doc.destroy();
});
it("rejects malformed/oversized/readonly commands and no-op clearing without writes", () => {
  const f = fixture(),
    t = tableIds(f.get()),
    writes = vi.fn();
  f.doc.on("update", writes);
  const cmd = {
    kind: "style" as const,
    rows: [t.rowIds[1]],
    columns: [t.columnIds[1]],
    style: { fontSize: NaN },
  };
  expect(f.command(cmd)).toBe(false);
  expect(
    f.command({
      kind: "paste",
      row: t.rowIds[0],
      column: t.columnIds[0],
      payload: { version: 1, cells: Array.from({ length: 101 }, () => ["x"]) },
    }),
  ).toBe(false);
  expect(
    validTableClipboard({ version: 1, cells: [["x"]], cellStyles: "bad" }),
  ).toBe(false);
  f.c.setReadOnly(true);
  expect(f.command({ ...cmd, style: { bold: true } })).toBe(false);
  expect(writes).not.toHaveBeenCalled();
  f.c.dispose();
  f.doc.destroy();
});
it("resizes as one undo operation and preserves effective table dimensions", () => {
  const f = fixture(),
    before = f.get(),
    t = tableIds(before);
  f.command({
    kind: "resize",
    axis: "column",
    sizes: t.columnIds.map((target, i) => ({
      target,
      size: [120, 300, 220][i],
    })),
    extent: 640,
  });
  expect(tableMetrics(f.get()).columns).toEqual([120, 300, 220]);
  expect(f.c.history.undoStack).toHaveLength(1);
  f.c.undo();
  expect(f.get()).toEqual(before);
  f.c.dispose();
  f.doc.destroy();
});
it("roundtrips quoted Excel-style TSV without splitting in-cell line breaks", () => {
  const cells = [
    ["中文\t值", "多\n行", '引"号'],
    ["", "2", ""],
  ];
  expect(parseTableTsv(tableTsv(cells))).toEqual(cells);
  expect(parseTableTsv("a\tb\r\nc\td\r\n")).toEqual([
    ["a", "b"],
    ["c", "d"],
  ]);
});
it("exports and reimports editable merged tables with cell formatting and dimensions", async () => {
  const f = fixture(),
    ids = tableIds(f.get());
  f.command({
    kind: "style",
    rows: ids.rowIds.slice(1),
    columns: ids.columnIds,
    style: {
      bold: true,
      underline: true,
      fontSize: 18,
      color: "#d83931",
      backgroundColor: "#fff3b0",
      align: "center",
      verticalAlign: "bottom",
    },
  });
  f.command({
    kind: "merge",
    rows: ids.rowIds.slice(1),
    columns: ids.columnIds.slice(0, 2),
  });
  f.command({
    kind: "resize",
    axis: "column",
    sizes: ids.columnIds.map((target, i) => ({
      target,
      size: [140, 240, 260][i],
    })),
  });
  const bytes = await (
      await exportPptx(readDocument(f.doc))
    ).blob.arrayBuffer(),
    zip = await JSZip.loadAsync(bytes),
    xml = await zip.file("ppt/slides/slide1.xml")!.async("string");
  expect(xml).toContain('gridSpan="2"');
  expect(xml).toContain('rowSpan="2"');
  const model = (await importPptx(bytes)).document,
    table = Object.values(model.slides[model.slideOrder[0]].elements).find(
      (el) => el.type === "table",
    ) as TableElement;
  expect(table.cells).toEqual(f.get().cells);
  expect(table.merges?.[0]).toMatchObject({
    row: 1,
    column: 0,
    rowSpan: 2,
    columnSpan: 2,
  });
  expect(table.cellStyles?.[1][0]).toMatchObject({
    bold: true,
    underline: true,
    fontSize: 18,
    color: "#d83931",
    backgroundColor: "#fff3b0",
    align: "center",
    verticalAlign: "bottom",
  });
  expect(
    tableMetrics(table).columns[0] / tableMetrics(table).columns[1],
  ).toBeCloseTo(140 / 240, 3);
  f.c.dispose();
  f.doc.destroy();
});
it("rejects an overlong merge without clearing any source content", () => {
  const f = fixture(),
    ids = tableIds(f.get());
  f.command({
    kind: "paste",
    row: ids.rowIds[1],
    column: ids.columnIds[0],
    payload: { version: 1, cells: [["a".repeat(50000), "b".repeat(50000)]] },
  });
  const writes = vi.fn();
  f.doc.on("update", writes);
  expect(
    f.command({
      kind: "merge",
      rows: [ids.rowIds[1]],
      columns: ids.columnIds.slice(0, 2),
    }),
  ).toBe(false);
  expect(writes).not.toHaveBeenCalled();
  expect(f.get().cells[1][0]).toHaveLength(50000);
  f.c.dispose();
  f.doc.destroy();
});
it("roundtrips a table merged across every row and column", async () => {
  const f = fixture(),
    ids = tableIds(f.get());
  f.command({ kind: "merge", rows: ids.rowIds, columns: ids.columnIds });
  const model = (
    await importPptx(
      await (await exportPptx(readDocument(f.doc))).blob.arrayBuffer(),
    )
  ).document;
  const table = Object.values(model.slides[model.slideOrder[0]].elements).find(
    (el) => el.type === "table",
  ) as TableElement;
  expect(table.cells).toEqual(f.get().cells);
  expect(table.merges?.[0]).toMatchObject({ rowSpan: 3, columnSpan: 3 });
  f.c.dispose();
  f.doc.destroy();
});
it("keeps an explicitly transparent cell background through PPTX", async () => {
  const f = fixture(),
    ids = tableIds(f.get());
  f.command({
    kind: "style",
    rows: [ids.rowIds[0]],
    columns: [ids.columnIds[0]],
    style: { backgroundColor: "transparent" },
  });
  const model = (
    await importPptx(
      await (await exportPptx(readDocument(f.doc))).blob.arrayBuffer(),
    )
  ).document;
  const table = Object.values(model.slides[model.slideOrder[0]].elements).find(
    (el) => el.type === "table",
  ) as TableElement;
  expect(table.cellStyles?.[0][0].backgroundColor).toBe("transparent");
  f.c.dispose();
  f.doc.destroy();
});
