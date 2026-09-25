import { useEffect, useRef, useState, type ReactNode } from "react";
import { displayMessage, useT } from "../i18n";
import { pxToEmu, type TableElement } from "../model/types";
import type { EditorController } from "../model/controller";
import { tableIds } from "../model/table";
export function TableOverlay({
  element,
  controller,
  slideId,
  onDone,
  viewScale = 1,
  actions,
}: {
  element: TableElement;
  controller: EditorController;
  slideId: string;
  onDone: () => void;
  viewScale?: number;
  actions?: ReactNode;
}) {
  const t = useT();
  const ids = tableIds(element),
    root = useRef<HTMLDivElement>(null);
  const [cell, setCell] = useState({
      row: ids.rowIds[0],
      column: ids.columnIds[0],
    }),
    [editing, setEditing] = useState(false),
    [draft, setDraft] = useState(""),
    [message, setMessage] = useState("");
  const baseline = useRef("");
  const editingRef = useRef(false);
  const dragging = useRef<{ x: number; y: number } | null>(null),
    [offset, setOffset] = useState({ x: 0, y: 0 });
  useEffect(() => {
    if (!ids.rowIds.includes(cell.row) || !ids.columnIds.includes(cell.column)) {
      editingRef.current = false;
      setEditing(false);
      setCell({ row: ids.rowIds[0], column: ids.columnIds[0] });
    }
  }, [ids.rowIds.join(), ids.columnIds.join()]);
  const row = ids.rowIds.indexOf(cell.row),
    column = ids.columnIds.indexOf(cell.column);
  const commit = () => {
    if (!editingRef.current) return;
    editingRef.current = false;
    const ok = controller.tableCommand(slideId, element.id, {
      kind: "cell",
      ...cell,
      value: draft,
      expected: baseline.current,
    });
    setEditing(false);
    if (!ok)
      setMessage("table.conflict");
  };
  const insert = (axis: "row" | "column", before = false) => {
    commit();
    const axisIds = axis === "row" ? ids.rowIds : ids.columnIds,
      index = axis === "row" ? row : column;
    controller.tableCommand(slideId, element.id, {
      kind: axis === "row" ? "insert-row" : "insert-column",
      after: before ? (axisIds[index - 1] ?? null) : axisIds[index],
    });
  };
  const focusCell = (r: number, c: number) => {
    setCell({ row: ids.rowIds[r], column: ids.columnIds[c] });
    setEditing(false);
    requestAnimationFrame(() =>
      root.current
        ?.querySelector<HTMLButtonElement>(`[data-r="${r}"][data-c="${c}"]`)
        ?.focus(),
    );
  };
  const a = (-element.transform.rotation * Math.PI) / 180;
  return (
    <div
      ref={root}
      className="eppt-table-overlay"
      style={{
        transform: `translate(${offset.x * Math.cos(a) - offset.y * Math.sin(a)}px, ${offset.x * Math.sin(a) + offset.y * Math.cos(a)}px)`,
      }}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (editing) return;
        if (e.key === "Escape") {
          onDone();
          return;
        }
        if (
          [
            "ArrowUp",
            "ArrowDown",
            "ArrowLeft",
            "ArrowRight",
            "Tab",
            "Enter",
          ].includes(e.key)
        ) {
          e.preventDefault();
          const r = Math.max(
              0,
              Math.min(
                ids.rowIds.length - 1,
                row +
                  (e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0),
              ),
            ),
            c = Math.max(
              0,
              Math.min(
                ids.columnIds.length - 1,
                column +
                  (e.key === "ArrowRight" || e.key === "Tab"
                    ? 1
                    : e.key === "ArrowLeft"
                      ? -1
                      : 0),
              ),
            );
          if (e.key === "Enter") {
            if (row < 0 || column < 0) return;
            baseline.current = element.cells[row][column];
            setDraft(baseline.current);
            editingRef.current = true;
            setEditing(true);
          } else focusCell(r, c);
        }
      }}
    >
      <div
        className="eppt-table-commands"
        role="toolbar"
        aria-label={t("table.commands")}
      >
        <button
          aria-label={t("table.move")}
          title={t("table.moveHint")}
          style={{ cursor: "move", touchAction: "none" }}
          onPointerDown={(e) => {
            commit();
            dragging.current = { x: e.clientX, y: e.clientY };
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            if (dragging.current)
              setOffset({
                x: (e.clientX - dragging.current.x) / viewScale,
                y: (e.clientY - dragging.current.y) / viewScale,
              });
          }}
          onPointerUp={(e) => {
            if (dragging.current) {
              const x = (e.clientX - dragging.current.x) / viewScale,
                y = (e.clientY - dragging.current.y) / viewScale;
              controller.patch(slideId, element.id, {
                transform: {
                  x: element.transform.x + pxToEmu(x),
                  y: element.transform.y + pxToEmu(y),
                },
              });
            }
            dragging.current = null;
            setOffset({ x: 0, y: 0 });
          }}
          onPointerCancel={() => {
            dragging.current = null;
            setOffset({ x: 0, y: 0 });
          }}
        >
          ✥
        </button>
        <button
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => insert("row", true)}
          disabled={ids.rowIds.length >= 100}
        >
          {t("table.insertRowAbove")}
        </button>
        <button
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => insert("row")}
          disabled={ids.rowIds.length >= 100}
        >
          {t("table.insertRowBelow")}
        </button>
        <button
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => insert("column", true)}
          disabled={ids.columnIds.length >= 100}
        >
          {t("table.insertColLeft")}
        </button>
        <button
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => insert("column")}
          disabled={ids.columnIds.length >= 100}
        >
          {t("table.insertColRight")}
        </button>
        <button
          disabled={ids.rowIds.length <= 1}
          onClick={() => {
            setEditing(false);
            controller.tableCommand(slideId, element.id, {
              kind: "delete-row",
              target: cell.row,
            });
          }}
        >
          {t("table.deleteRow")}
        </button>
        <button
          disabled={ids.columnIds.length <= 1}
          onClick={() => {
            setEditing(false);
            controller.tableCommand(slideId, element.id, {
              kind: "delete-column",
              target: cell.column,
            });
          }}
        >
          {t("table.deleteCol")}
        </button>
        {actions}
      </div>
      <table role="grid" aria-label={t("table.grid")}>
        <tbody>
          {element.cells.map((cells, r) => (
            <tr key={ids.rowIds[r]}>
              {cells.map((value, c) => {
                const active =
                  cell.row === ids.rowIds[r] && cell.column === ids.columnIds[c];
                return (
                  <td
                    key={ids.columnIds[c]}
                    style={{
                      background:
                        r === 0
                          ? element.headerFill
                          : r % 2
                            ? "#f1f4fa"
                            : "#ffffff",
                      color: r === 0 ? "#ffffff" : "#24314b",
                    }}
                    className={active ? "active" : ""}
                  >
                    {active && editing ? (
                      <textarea
                        autoFocus
                        aria-label={t("table.cellEdit", {
                          row: r + 1,
                          column: c + 1,
                        })}
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        onBlur={commit}
                        onKeyDown={(e) => {
                          if (e.key === "Escape") {
                            e.preventDefault();
                            editingRef.current = false;
                            setEditing(false);
                          }
                          if (
                            e.key === "Tab" ||
                            (e.key === "Enter" && !e.shiftKey)
                          ) {
                            e.preventDefault();
                            commit();
                            const next = c + (e.shiftKey ? -1 : 1);
                            focusCell(
                              Math.max(
                                0,
                                Math.min(
                                  ids.rowIds.length - 1,
                                  r +
                                    (next >= ids.columnIds.length
                                      ? 1
                                      : next < 0
                                        ? -1
                                        : 0),
                                ),
                              ),
                              (next + ids.columnIds.length) % ids.columnIds.length,
                            );
                          }
                        }}
                      />
                    ) : (
                      <button
                        data-r={r}
                        data-c={c}
                        aria-label={t("table.cell", {
                          row: r + 1,
                          column: c + 1,
                          value: value || t("table.empty"),
                        })}
                        aria-selected={active}
                        tabIndex={active ? 0 : -1}
                        onClick={() => {
                          commit();
                          setCell({ row: ids.rowIds[r], column: ids.columnIds[c] });
                          baseline.current = value;
                          setDraft(value);
                          editingRef.current = true;
                          setEditing(true);
                        }}
                      >
                        {value || "\u00a0"}
                      </button>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <button
        className="eppt-table-add-row"
        aria-label={t("table.addRow")}
        disabled={ids.rowIds.length >= 100}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => {
          commit();
          controller.tableCommand(slideId, element.id, {
            kind: "insert-row",
            after: ids.rowIds.at(-1)!,
          });
        }}
      >
        ＋
      </button>
      <button
        className="eppt-table-add-column"
        aria-label={t("table.addColumn")}
        disabled={ids.columnIds.length >= 100}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => {
          commit();
          controller.tableCommand(slideId, element.id, {
            kind: "insert-column",
            after: ids.columnIds.at(-1)!,
          });
        }}
      >
        ＋
      </button>
      {message && (
        <div className="eppt-table-message" role="alert">
          {displayMessage(t, message)}
        </div>
      )}
    </div>
  );
}
