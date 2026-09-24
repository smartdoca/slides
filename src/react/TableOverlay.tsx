import { useEffect, useRef, useState, type ReactNode } from "react";
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
  const t = tableIds(element),
    root = useRef<HTMLDivElement>(null);
  const [cell, setCell] = useState({
      row: t.rowIds[0],
      column: t.columnIds[0],
    }),
    [editing, setEditing] = useState(false),
    [draft, setDraft] = useState(""),
    [message, setMessage] = useState("");
  const baseline = useRef("");
  const editingRef = useRef(false);
  const dragging = useRef<{ x: number; y: number } | null>(null),
    [offset, setOffset] = useState({ x: 0, y: 0 });
  useEffect(() => {
    if (!t.rowIds.includes(cell.row) || !t.columnIds.includes(cell.column)) {
      editingRef.current = false;
      setEditing(false);
      setCell({ row: t.rowIds[0], column: t.columnIds[0] });
    }
  }, [t.rowIds.join(), t.columnIds.join()]);
  const row = t.rowIds.indexOf(cell.row),
    column = t.columnIds.indexOf(cell.column);
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
      setMessage("此单元格已变化或不再可编辑，未覆盖协作者内容。请重新编辑。");
  };
  const insert = (axis: "row" | "column", before = false) => {
    commit();
    const ids = axis === "row" ? t.rowIds : t.columnIds,
      index = axis === "row" ? row : column;
    controller.tableCommand(slideId, element.id, {
      kind: axis === "row" ? "insert-row" : "insert-column",
      after: before ? (ids[index - 1] ?? null) : ids[index],
    });
  };
  const focusCell = (r: number, c: number) => {
    setCell({ row: t.rowIds[r], column: t.columnIds[c] });
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
                t.rowIds.length - 1,
                row +
                  (e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0),
              ),
            ),
            c = Math.max(
              0,
              Math.min(
                t.columnIds.length - 1,
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
        aria-label="表格行列操作"
      >
        <button
          aria-label="移动表格"
          title="拖动移动表格"
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
          disabled={t.rowIds.length >= 100}
        >
          上方插行
        </button>
        <button
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => insert("row")}
          disabled={t.rowIds.length >= 100}
        >
          下方插行
        </button>
        <button
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => insert("column", true)}
          disabled={t.columnIds.length >= 100}
        >
          左侧插列
        </button>
        <button
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => insert("column")}
          disabled={t.columnIds.length >= 100}
        >
          右侧插列
        </button>
        <button
          disabled={t.rowIds.length <= 1}
          onClick={() => {
            setEditing(false);
            controller.tableCommand(slideId, element.id, {
              kind: "delete-row",
              target: cell.row,
            });
          }}
        >
          删除行
        </button>
        <button
          disabled={t.columnIds.length <= 1}
          onClick={() => {
            setEditing(false);
            controller.tableCommand(slideId, element.id, {
              kind: "delete-column",
              target: cell.column,
            });
          }}
        >
          删除列
        </button>
        {actions}
      </div>
      <table role="grid" aria-label="幻灯片表格">
        <tbody>
          {element.cells.map((cells, r) => (
            <tr key={t.rowIds[r]}>
              {cells.map((value, c) => {
                const active =
                  cell.row === t.rowIds[r] && cell.column === t.columnIds[c];
                return (
                  <td
                    key={t.columnIds[c]}
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
                        aria-label={`第 ${r + 1} 行第 ${c + 1} 列内容`}
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
                                  t.rowIds.length - 1,
                                  r +
                                    (next >= t.columnIds.length
                                      ? 1
                                      : next < 0
                                        ? -1
                                        : 0),
                                ),
                              ),
                              (next + t.columnIds.length) % t.columnIds.length,
                            );
                          }
                        }}
                      />
                    ) : (
                      <button
                        data-r={r}
                        data-c={c}
                        aria-label={`第 ${r + 1} 行第 ${c + 1} 列：${value || "空白"}`}
                        aria-selected={active}
                        tabIndex={active ? 0 : -1}
                        onClick={() => {
                          commit();
                          setCell({ row: t.rowIds[r], column: t.columnIds[c] });
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
        aria-label="在表格末尾增加一行"
        disabled={t.rowIds.length >= 100}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => {
          commit();
          controller.tableCommand(slideId, element.id, {
            kind: "insert-row",
            after: t.rowIds.at(-1)!,
          });
        }}
      >
        ＋
      </button>
      <button
        className="eppt-table-add-column"
        aria-label="在表格末尾增加一列"
        disabled={t.columnIds.length >= 100}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => {
          commit();
          controller.tableCommand(slideId, element.id, {
            kind: "insert-column",
            after: t.columnIds.at(-1)!,
          });
        }}
      >
        ＋
      </button>
      {message && (
        <div className="eppt-table-message" role="alert">
          {message}
        </div>
      )}
    </div>
  );
}
