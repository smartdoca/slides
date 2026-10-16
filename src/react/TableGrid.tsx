import type { CSSProperties, HTMLAttributes, ReactNode } from "react";
import type { TableElement } from "../model/types";
import { mergeAt, tableCellStyle, tableMetrics } from "../model/table";
export function tableCellCss(
  element: TableElement,
  r: number,
  c: number,
): CSSProperties {
  const style = tableCellStyle(element, r, c);
  return {
    background: style.backgroundColor,
    color: style.color,
    fontFamily: style.fontFamily,
    fontSize: (style.fontSize * 96) / 72,
    fontWeight: style.bold ? 700 : 400,
    fontStyle: style.italic ? "italic" : "normal",
    textDecoration: style.underline ? "underline" : undefined,
    textAlign: style.align,
    verticalAlign: style.verticalAlign,
  };
}
export function TableGrid({
  element,
  renderCell,
  cellProps,
  gridLabel,
  metrics = tableMetrics(element),
}: {
  element: TableElement;
  renderCell?(value: string, r: number, c: number): ReactNode;
  cellProps?(r: number, c: number): HTMLAttributes<HTMLTableCellElement>;
  gridLabel?: string;
  metrics?: { columns: number[]; rows: number[] };
}) {
  const width = metrics.columns.reduce((a, b) => a + b, 0),
    height = metrics.rows.reduce((a, b) => a + b, 0);
  return (
    <table
      className="eppt-table-grid"
      role={gridLabel ? "grid" : undefined}
      aria-label={gridLabel}
      aria-rowcount={gridLabel ? element.cells.length : undefined}
      aria-colcount={gridLabel ? element.cells[0].length : undefined}
      style={{
        width: "100%",
        height: "100%",
        tableLayout: "fixed",
        borderCollapse: "collapse",
      }}
    >
      <colgroup>
        {metrics.columns.map((n, i) => (
          <col
            key={element.columnIds?.[i] ?? i}
            style={{ width: `${(n / width) * 100}%` }}
          />
        ))}
      </colgroup>
      <tbody>
        {element.cells.map((row, r) => (
          <tr
            key={element.rowIds?.[r] ?? r}
            style={{ height: `${(metrics.rows[r] / height) * 100}%` }}
          >
            {row.map((value, c) => {
              const merge = mergeAt(element, r, c);
              if (merge && (merge.row !== r || merge.column !== c)) return null;
              return (
                <td
                  key={element.columnIds?.[c] ?? c}
                  rowSpan={merge?.rowSpan}
                  colSpan={merge?.columnSpan}
                  role={gridLabel ? "gridcell" : undefined}
                  aria-rowindex={gridLabel ? r + 1 : undefined}
                  aria-colindex={gridLabel ? c + 1 : undefined}
                  style={{
                    border: "1px solid #cdd5e4",
                    position: "relative",
                    padding: 0,
                    ...tableCellCss(element, r, c),
                  }}
                  {...cellProps?.(r, c)}
                >
                  {renderCell ? (
                    renderCell(value, r, c)
                  ) : (
                    <div
                      className="eppt-table-cell-display"
                      style={{
                        position: "absolute",
                        inset: 0,
                        display: "flex",
                        flexDirection: "column",
                        padding: 8,
                        boxSizing: "border-box",
                        overflow: "hidden",
                        whiteSpace: "pre-wrap",
                        overflowWrap: "anywhere",
                        lineHeight: 1.35,
                        justifyContent: {
                          top: "flex-start",
                          middle: "center",
                          bottom: "flex-end",
                        }[tableCellStyle(element, r, c).verticalAlign],
                      }}
                    >
                      <span style={{ width: "100%" }}>{value || "\u00a0"}</span>
                    </div>
                  )}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
