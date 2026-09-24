import type { TableElement } from "./types";

/** Immutable operations over the original cell baseline. Stable IDs survive insert/delete. */
export type TableOperation = { id: string; clock: number } & (
  | { kind: "insert-row" | "insert-column"; after: string | null }
  | { kind: "delete-row" | "delete-column"; target: string }
  | { kind: "cell"; row: string; column: string; value: string }
);
export const TABLE_OP = "table-op:";
export interface TableProjection {
  rowIds: string[];
  columnIds: string[];
  cells: string[][];
}
function validateOperation(op: TableOperation) {
  const validId = (v: unknown) =>
    typeof v === "string" && v.length > 0 && v.length <= 500;
  if (!op || !validId(op.id) || !Number.isSafeInteger(op.clock) || op.clock < 1)
    throw new Error("Invalid table operation identity");
  if (op.kind === "cell") {
    if (
      !validId(op.row) ||
      !validId(op.column) ||
      typeof op.value !== "string" ||
      op.value.length > 100000
    )
      throw new Error("Invalid table cell operation");
  } else if (op.kind === "insert-row" || op.kind === "insert-column") {
    if (op.after !== null && !validId(op.after))
      throw new Error("Invalid table insertion anchor");
  } else if (op.kind === "delete-row" || op.kind === "delete-column") {
    if (!validId(op.target)) throw new Error("Invalid table deletion target");
  } else throw new Error("Unknown table operation kind");
}
export function projectTable(
  id: string,
  baseline: string[][],
  operations: TableOperation[],
): TableProjection {
  operations.forEach(validateOperation);
  const rows = baseline.map((_, i) => `${id}:r${i}`),
    columns = Array.from(
      { length: Math.max(1, ...baseline.map((r) => r.length)) },
      (_, i) => `${id}:c${i}`,
    );
  const deletedRows = new Set<string>(),
    deletedColumns = new Set<string>(),
    values = new Map<string, string>();
  const key = (r: string, c: string) => JSON.stringify([r, c]);
  baseline.forEach((row, i) =>
    row.forEach((value, j) => values.set(key(rows[i], columns[j]), value)),
  );
  for (const op of [...operations].sort(
    (a, b) => a.clock - b.clock || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  )) {
    if (op.kind === "cell") values.set(key(op.row, op.column), op.value);
    else if (op.kind.startsWith("insert")) {
      const list = op.kind === "insert-row" ? rows : columns;
      const after = (op as Extract<TableOperation, { after: string | null }>)
        .after;
      if (!list.includes(op.id))
        list.splice(
          after === null ? 0 : Math.max(0, list.indexOf(after) + 1),
          0,
          op.id,
        );
    } else
      (op.kind === "delete-row" ? deletedRows : deletedColumns).add(
        (op as Extract<TableOperation, { target: string }>).target,
      );
  }
  const rowIds = rows.filter((id) => !deletedRows.has(id)),
    columnIds = columns.filter((id) => !deletedColumns.has(id));
  // Concurrent deletions may remove the last two rows/columns. Keep one deterministic blank cell.
  if (!rowIds.length) rowIds.push(`${id}:empty-row`);
  if (!columnIds.length) columnIds.push(`${id}:empty-column`);
  return {
    rowIds,
    columnIds,
    cells: rowIds.map((r) => columnIds.map((c) => values.get(key(r, c)) ?? "")),
  };
}
export function tableIds(element: TableElement): TableProjection {
  return element.rowIds && element.columnIds
    ? {
        rowIds: element.rowIds,
        columnIds: element.columnIds,
        cells: element.cells,
      }
    : projectTable(element.id, element.cells, []);
}
