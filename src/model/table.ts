import { emuToPx } from "./types";
import type { TableCellStyle, TableElement, TableMerge } from "./types";
export const TABLE_OP = "table-op:";
export const TABLE_CLIPBOARD_MIME = "application/x-eppt-table+json";
export interface TableClipboard {
  version: 1;
  cells: string[][];
  cellStyles?: TableCellStyle[][];
  merges?: TableMerge[];
}
export type TableAction =
  | { kind: "insert-row" | "insert-column"; after: string | null }
  | { kind: "delete-row" | "delete-column"; target: string }
  | { kind: "delete-rows" | "delete-columns"; targets: string[] }
  | { kind: "cell"; row: string; column: string; value: string }
  | { kind: "clear"; rows: string[]; columns: string[] }
  | { kind: "merge"; rows: string[]; columns: string[] }
  | { kind: "style"; rows: string[]; columns: string[]; style: TableCellStyle }
  | { kind: "split"; targets: string[] }
  | {
      kind: "resize";
      axis: "row" | "column";
      sizes: { target: string; size: number }[];
    }
  | { kind: "paste"; row: string; column: string; payload: TableClipboard };
export type TableOperation = { id: string; clock: number } & TableAction;
export type TableCommand = TableAction & { expected?: string; extent?: number };
export interface TableProjection {
  rowIds: string[];
  columnIds: string[];
  cells: string[][];
  cellStyles?: TableCellStyle[][];
  merges?: TableMerge[];
  columnWidths?: number[];
  rowHeights?: number[];
}
export type CellPoint = { row: number; column: number };
export type CellBounds = {
  top: number;
  left: number;
  bottom: number;
  right: number;
};
const validId = (v: unknown): v is string =>
  typeof v === "string" && v.length > 0 && v.length <= 500;
const ids = (v: unknown): v is string[] =>
  Array.isArray(v) &&
  v.length > 0 &&
  v.length <= 100 &&
  v.every(validId) &&
  new Set(v).size === v.length;
export const cellKey = (r: string, c: string) => JSON.stringify([r, c]);
export function validCellStyle(style: unknown): style is TableCellStyle {
  if (!style || typeof style !== "object" || Array.isArray(style)) return false;
  return Object.entries(style).every(([key, value]) => {
    if (["bold", "italic", "underline"].includes(key))
      return typeof value === "boolean";
    if (key === "fontFamily")
      return (
        typeof value === "string" && value.length > 0 && value.length <= 200
      );
    if (key === "fontSize")
      return (
        typeof value === "number" &&
        Number.isFinite(value) &&
        value >= 6 &&
        value <= 200
      );
    if (key === "color" || key === "backgroundColor")
      return (
        typeof value === "string" &&
        (/^#[\da-f]{6}$/i.test(value) || value === "transparent")
      );
    if (key === "align")
      return ["left", "center", "right"].includes(value as string);
    if (key === "verticalAlign")
      return ["top", "middle", "bottom"].includes(value as string);
    return false;
  });
}
export function validTableClipboard(
  payload: unknown,
): payload is TableClipboard {
  const p = payload as TableClipboard;
  if (
    !p ||
    p.version !== 1 ||
    !Array.isArray(p.cells) ||
    !p.cells.length ||
    p.cells.length > 100
  )
    return false;
  const count = p.cells[0]?.length;
  if (
    !count ||
    count > 100 ||
    p.cells.some(
      (row) =>
        !Array.isArray(row) ||
        row.length !== count ||
        row.some((value) => typeof value !== "string" || value.length > 100000),
    )
  )
    return false;
  if (
    p.cells.reduce((n, row) => n + row.reduce((m, v) => m + v.length, 0), 0) >
    1000000
  )
    return false;
  if (
    p.cellStyles &&
    (!Array.isArray(p.cellStyles) ||
      p.cellStyles.length !== p.cells.length ||
      p.cellStyles.some(
        (row) =>
          !Array.isArray(row) ||
          row.length !== count ||
          row.some((style) => !validCellStyle(style)),
      ))
  )
    return false;
  const occupied = new Set<string>();
  if (
    p.merges &&
    (!Array.isArray(p.merges) ||
      p.merges.length > 10000 ||
      p.merges.some((m) => {
        if (
          !m ||
          !validId(m.id) ||
          ![m.row, m.column, m.rowSpan, m.columnSpan].every(
            Number.isSafeInteger,
          ) ||
          m.row < 0 ||
          m.column < 0 ||
          m.rowSpan < 1 ||
          m.columnSpan < 1 ||
          m.row + m.rowSpan > p.cells.length ||
          m.column + m.columnSpan > count
        )
          return true;
        for (let r = m.row; r < m.row + m.rowSpan; r++)
          for (let c = m.column; c < m.column + m.columnSpan; c++) {
            const key = `${r}:${c}`;
            if (occupied.has(key)) return true;
            occupied.add(key);
          }
        return false;
      }))
  )
    return false;
  return true;
}
export function validateTableAction(op: TableAction) {
  let valid = false;
  switch (op?.kind) {
    case "cell":
      valid =
        validId(op.row) &&
        validId(op.column) &&
        typeof op.value === "string" &&
        op.value.length <= 100000;
      break;
    case "insert-row":
    case "insert-column":
      valid = op.after === null || validId(op.after);
      break;
    case "delete-row":
    case "delete-column":
      valid = validId(op.target);
      break;
    case "delete-rows":
    case "delete-columns":
    case "split":
      valid = ids(op.targets);
      break;
    case "clear":
    case "merge":
    case "style":
      valid =
        ids(op.rows) &&
        ids(op.columns) &&
        (op.kind !== "style" || validCellStyle(op.style));
      break;
    case "resize":
      valid =
        ["row", "column"].includes(op.axis) &&
        Array.isArray(op.sizes) &&
        op.sizes.length > 0 &&
        op.sizes.length <= 100 &&
        op.sizes.every(
          (item) =>
            validId(item.target) &&
            Number.isFinite(item.size) &&
            item.size >= 1 &&
            item.size <= 100000,
        );
      break;
    case "paste":
      valid =
        validId(op.row) &&
        validId(op.column) &&
        validTableClipboard(op.payload);
      break;
  }
  if (!valid) throw new Error("INVALID_TABLE_OPERATION");
}
/** Replay uses immutable baseline cells and stable axes; view/selection never creates operations. */
export function projectTable(
  id: string,
  baseline: string[][],
  operations: TableOperation[],
  seed: Partial<TableProjection> = {},
): TableProjection {
  const rows = seed.rowIds
    ? [...seed.rowIds]
    : baseline.map((_, i) => `${id}:r${i}`);
  const columns = seed.columnIds
    ? [...seed.columnIds]
    : Array.from(
        { length: Math.max(1, ...baseline.map((r) => r.length)) },
        (_, i) => `${id}:c${i}`,
      );
  const deletedRows = new Set<string>(),
    deletedColumns = new Set<string>();
  const values = new Map<string, string>(),
    styles = new Map<string, TableCellStyle>(),
    widths = new Map<string, number>(),
    heights = new Map<string, number>();
  type Merge = { id: string; rows: string[]; columns: string[] };
  let merges: Merge[] = (seed.merges ?? []).map((m, i) => ({
    id: `${id}:m${i}`,
    rows: rows.slice(m.row, m.row + m.rowSpan),
    columns: columns.slice(m.column, m.column + m.columnSpan),
  }));
  baseline.forEach((row, r) =>
    row.forEach((value, c) => {
      values.set(cellKey(rows[r], columns[c]), value);
      if (seed.cellStyles?.[r]?.[c])
        styles.set(cellKey(rows[r], columns[c]), { ...seed.cellStyles[r][c] });
    }),
  );
  seed.columnWidths?.forEach((size, c) => widths.set(columns[c], size));
  seed.rowHeights?.forEach((size, r) => heights.set(rows[r], size));
  const activeRows = () => rows.filter((r) => !deletedRows.has(r)),
    activeColumns = () => columns.filter((c) => !deletedColumns.has(c));
  const insert = (axis: string[], after: string | null, newId: string) => {
    if (!axis.includes(newId))
      axis.splice(
        after === null ? 0 : Math.max(0, axis.indexOf(after) + 1),
        0,
        newId,
      );
  };
  const removeAxis = (axis: "row" | "column", targets: string[]) => {
    const removed = axis === "row" ? deletedRows : deletedColumns;
    targets.forEach((target) => removed.add(target));
    merges = merges.flatMap((m) => {
      const rs = m.rows.filter((r) => !deletedRows.has(r)),
        cs = m.columns.filter((c) => !deletedColumns.has(c));
      if (!rs.length || !cs.length) return [];
      if (rs[0] !== m.rows[0] || cs[0] !== m.columns[0]) {
        values.set(
          cellKey(rs[0], cs[0]),
          values.get(cellKey(m.rows[0], m.columns[0])) ?? "",
        );
        styles.set(
          cellKey(rs[0], cs[0]),
          styles.get(cellKey(m.rows[0], m.columns[0])) ?? {},
        );
      }
      return rs.length * cs.length > 1 ? [{ ...m, rows: rs, columns: cs }] : [];
    });
  };
  for (const op of [...operations].sort(
    (a, b) => a.clock - b.clock || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  )) {
    if (!validId(op.id) || !Number.isSafeInteger(op.clock) || op.clock < 1)
      throw new Error("INVALID_TABLE_OPERATION");
    validateTableAction(op);
    if (op.kind === "cell") values.set(cellKey(op.row, op.column), op.value);
    else if (op.kind === "insert-row" || op.kind === "insert-column") {
      const axis = op.kind === "insert-row" ? rows : columns;
      insert(axis, op.after, op.id);
      merges.forEach((m) => {
        const list = op.kind === "insert-row" ? m.rows : m.columns,
          index = axis.indexOf(op.id);
        if (list.includes(axis[index - 1]) && list.includes(axis[index + 1]))
          list.splice(list.indexOf(axis[index + 1]), 0, op.id);
      });
    } else if (op.kind === "delete-row" || op.kind === "delete-column")
      removeAxis(op.kind === "delete-row" ? "row" : "column", [op.target]);
    else if (op.kind === "delete-rows" || op.kind === "delete-columns")
      removeAxis(op.kind === "delete-rows" ? "row" : "column", op.targets);
    else if (op.kind === "resize")
      op.sizes.forEach((item) =>
        (op.axis === "row" ? heights : widths).set(item.target, item.size),
      );
    else if (op.kind === "split")
      merges = merges.filter((m) => !op.targets.includes(m.id));
    else if (op.kind === "paste") {
      const rs = activeRows(),
        cs = activeColumns(),
        r = rs.indexOf(op.row),
        c = cs.indexOf(op.column);
      if (r < 0 || c < 0) continue;
      while (rs.length < Math.min(100, r + op.payload.cells.length)) {
        const next = `${op.id}:r${rs.length}`;
        rows.push(next);
        rs.push(next);
      }
      while (cs.length < Math.min(100, c + op.payload.cells[0].length)) {
        const next = `${op.id}:c${cs.length}`;
        columns.push(next);
        cs.push(next);
      }
      const targetRows = rs.slice(r, r + op.payload.cells.length),
        targetColumns = cs.slice(c, c + op.payload.cells[0].length);
      merges = merges.filter(
        (m) =>
          !m.rows.some((id) => targetRows.includes(id)) ||
          !m.columns.some((id) => targetColumns.includes(id)),
      );
      op.payload.cells.forEach((row, ri) =>
        row.forEach((value, ci) => {
          if (!targetRows[ri] || !targetColumns[ci]) return;
          const key = cellKey(targetRows[ri], targetColumns[ci]);
          values.set(key, value);
          if (op.payload.cellStyles)
            styles.set(key, { ...op.payload.cellStyles[ri][ci] });
        }),
      );
      (op.payload.merges ?? []).forEach((m, i) => {
        const mergeRows = targetRows.slice(m.row, m.row + m.rowSpan),
          mergeColumns = targetColumns.slice(m.column, m.column + m.columnSpan);
        if (
          mergeRows.length === m.rowSpan &&
          mergeColumns.length === m.columnSpan
        )
          merges.push({
            id: `${op.id}:m${i}`,
            rows: mergeRows,
            columns: mergeColumns,
          });
      });
    } else if (op.kind === "clear" || op.kind === "style") {
      op.rows.forEach((r) =>
        op.columns.forEach((c) => {
          const key = cellKey(r, c);
          if (op.kind === "clear") values.set(key, "");
          else styles.set(key, { ...styles.get(key), ...op.style });
        }),
      );
    } else if (op.kind === "merge") {
      const rs = activeRows(),
        cs = activeColumns();
      let r1 = Math.min(...op.rows.map((r) => rs.indexOf(r))),
        r2 = Math.max(...op.rows.map((r) => rs.indexOf(r))),
        c1 = Math.min(...op.columns.map((c) => cs.indexOf(c))),
        c2 = Math.max(...op.columns.map((c) => cs.indexOf(c)));
      if (r1 < 0 || c1 < 0) continue;
      let changed = true;
      while (changed) {
        changed = false;
        for (const m of merges) {
          const mr1 = rs.indexOf(m.rows[0]),
            mr2 = rs.indexOf(m.rows.at(-1)!),
            mc1 = cs.indexOf(m.columns[0]),
            mc2 = cs.indexOf(m.columns.at(-1)!);
          if (
            mr1 <= r2 &&
            mr2 >= r1 &&
            mc1 <= c2 &&
            mc2 >= c1 &&
            (mr1 < r1 || mr2 > r2 || mc1 < c1 || mc2 > c2)
          ) {
            r1 = Math.min(r1, mr1);
            r2 = Math.max(r2, mr2);
            c1 = Math.min(c1, mc1);
            c2 = Math.max(c2, mc2);
            changed = true;
          }
        }
      }
      const mergeRows = rs.slice(r1, r2 + 1),
        mergeColumns = cs.slice(c1, c2 + 1),
        content: string[] = [];
      mergeRows.forEach((r) =>
        mergeColumns.forEach((c) => {
          const key = cellKey(r, c),
            value = values.get(key);
          if (value) content.push(value);
        }),
      );
      const mergedContent = content.join("\n");
      if (mergedContent.length > 100000) continue;
      mergeRows.forEach((r) =>
        mergeColumns.forEach((c) => values.set(cellKey(r, c), "")),
      );
      values.set(cellKey(mergeRows[0], mergeColumns[0]), mergedContent);
      merges = merges.filter(
        (m) =>
          !m.rows.some((id) => mergeRows.includes(id)) ||
          !m.columns.some((id) => mergeColumns.includes(id)),
      );
      if (mergeRows.length * mergeColumns.length > 1)
        merges.push({ id: op.id, rows: mergeRows, columns: mergeColumns });
    }
  }
  const rowIds = activeRows(),
    columnIds = activeColumns();
  if (!rowIds.length) rowIds.push(`${id}:empty-row`);
  if (!columnIds.length) columnIds.push(`${id}:empty-column`);
  const regions = merges.flatMap((m) => {
    const rs = m.rows.filter((r) => rowIds.includes(r)),
      cs = m.columns.filter((c) => columnIds.includes(c));
    return rs.length * cs.length > 1
      ? [
          {
            id: m.id,
            row: rowIds.indexOf(rs[0]),
            column: columnIds.indexOf(cs[0]),
            rowSpan: rs.length,
            columnSpan: cs.length,
          },
        ]
      : [];
  });
  return {
    rowIds,
    columnIds,
    cells: rowIds.map((r) =>
      columnIds.map((c) => values.get(cellKey(r, c)) ?? ""),
    ),
    ...(styles.size
      ? {
          cellStyles: rowIds.map((r) =>
            columnIds.map((c) => styles.get(cellKey(r, c)) ?? {}),
          ),
        }
      : {}),
    ...(regions.length ? { merges: regions } : {}),
    ...(widths.size
      ? { columnWidths: columnIds.map((c) => widths.get(c) ?? 0) }
      : {}),
    ...(heights.size
      ? { rowHeights: rowIds.map((r) => heights.get(r) ?? 0) }
      : {}),
  };
}
export function tableIds(element: TableElement): TableProjection {
  return element.rowIds && element.columnIds
    ? (element as Required<Pick<TableElement, "rowIds" | "columnIds">> &
        TableProjection)
    : projectTable(element.id, element.cells, [], element);
}
export function mergeAt(
  table: Pick<TableElement, "merges">,
  row: number,
  column: number,
) {
  return table.merges?.find(
    (m) =>
      row >= m.row &&
      row < m.row + m.rowSpan &&
      column >= m.column &&
      column < m.column + m.columnSpan,
  );
}
export function cellAnchor(
  table: Pick<TableElement, "merges">,
  point: CellPoint,
): CellPoint {
  const m = mergeAt(table, point.row, point.column);
  return m ? { row: m.row, column: m.column } : point;
}
export function tableBounds(
  table: TableElement,
  anchor: CellPoint,
  focus: CellPoint,
): CellBounds {
  const bounds = {
    top: Math.min(anchor.row, focus.row),
    bottom: Math.max(anchor.row, focus.row),
    left: Math.min(anchor.column, focus.column),
    right: Math.max(anchor.column, focus.column),
  };
  let changed = true;
  while (changed) {
    changed = false;
    for (const m of table.merges ?? []) {
      const bottom = m.row + m.rowSpan - 1,
        right = m.column + m.columnSpan - 1;
      if (
        m.row <= bounds.bottom &&
        bottom >= bounds.top &&
        m.column <= bounds.right &&
        right >= bounds.left &&
        (m.row < bounds.top ||
          bottom > bounds.bottom ||
          m.column < bounds.left ||
          right > bounds.right)
      ) {
        bounds.top = Math.min(bounds.top, m.row);
        bounds.bottom = Math.max(bounds.bottom, bottom);
        bounds.left = Math.min(bounds.left, m.column);
        bounds.right = Math.max(bounds.right, right);
        changed = true;
      }
    }
  }
  return bounds;
}
export function tableClipboard(
  table: TableElement,
  bounds: CellBounds,
): TableClipboard {
  return {
    version: 1,
    cells: table.cells
      .slice(bounds.top, bounds.bottom + 1)
      .map((row) => row.slice(bounds.left, bounds.right + 1)),
    cellStyles: table.cells
      .slice(bounds.top, bounds.bottom + 1)
      .map((row, r) =>
        row
          .slice(bounds.left, bounds.right + 1)
          .map((_, c) =>
            tableCellStyle(table, r + bounds.top, c + bounds.left),
          ),
      ),
    merges: (table.merges ?? [])
      .filter(
        (m) =>
          m.row >= bounds.top &&
          m.column >= bounds.left &&
          m.row + m.rowSpan - 1 <= bounds.bottom &&
          m.column + m.columnSpan - 1 <= bounds.right,
      )
      .map((m) => ({
        ...m,
        row: m.row - bounds.top,
        column: m.column - bounds.left,
      })),
  };
}
export function tableTsv(cells: string[][]) {
  return cells
    .map((row) =>
      row
        .map((value) =>
          /[\t\n\r"]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value,
        )
        .join("\t"),
    )
    .join("\n");
}
export function parseTableTsv(text: string): string[][] {
  if (text.length > 1000000) throw new Error("TABLE_PASTE_TOO_LARGE");
  const rows: string[][] = [];
  let row: string[] = [],
    value = "",
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"' && (!value || quoted)) {
      if (quoted && text[i + 1] === '"') {
        value += '"';
        i++;
      } else quoted = !quoted;
    } else if (!quoted && (c === "\t" || c === "\n" || c === "\r")) {
      row.push(value);
      value = "";
      if (c !== "\t") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        rows.push(row);
        row = [];
      }
    } else value += c;
  }
  if (row.length || value || !rows.length || text.endsWith("\t")) {
    row.push(value);
    rows.push(row);
  }
  const width = Math.max(...rows.map((row) => row.length));
  const cells = rows.map((row) => [
    ...row,
    ...Array(width - row.length).fill(""),
  ]);
  if (!validTableClipboard({ version: 1, cells }))
    throw new Error("TABLE_PASTE_TOO_LARGE");
  return cells;
}

export function normalizedTableSizes(
  values: number[] | undefined,
  count: number,
  extent: number,
) {
  const weights = Array.from(
      { length: count },
      (_, i) => values?.[i] || extent / count,
    ),
    sum = weights.reduce((a, b) => a + b, 0);
  return weights.map((n) => (n / sum) * extent);
}
export function tableMetrics(element: TableElement) {
  return {
    columns: normalizedTableSizes(
      element.columnWidths,
      element.cells[0].length,
      emuToPx(element.transform.width),
    ),
    rows: normalizedTableSizes(
      element.rowHeights,
      element.cells.length,
      emuToPx(element.transform.height),
    ),
  };
}
export function tableCellStyle(
  element: TableElement,
  row: number,
  column: number,
): Required<TableCellStyle> {
  return {
    bold: false,
    italic: false,
    underline: false,
    fontFamily: "Arial",
    fontSize: 13.5,
    align: "left",
    verticalAlign: "middle",
    backgroundColor:
      row === 0
        ? (element.headerFill ?? "#325af0")
        : row % 2
          ? "#f1f4fa"
          : "#ffffff",
    color: row === 0 ? "#ffffff" : "#24314b",
    ...element.cellStyles?.[row]?.[column],
  };
}
