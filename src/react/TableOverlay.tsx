import {
  Fragment,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ClipboardEvent as ReactClipboardEvent,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createPortal } from "react-dom";
import { displayMessage, useT } from "../i18n";
import {
  emuToPx,
  pxToEmu,
  type TableCellStyle,
  type TableElement,
} from "../model/types";
import type { EditorController } from "../model/controller";
import { readSlide } from "../collaboration/yjs-codec";
import {
  cellAnchor,
  mergeAt,
  tableBounds,
  tableClipboard,
  tableIds,
  tableCellStyle,
  tableMetrics,
  tableTsv,
  TABLE_CLIPBOARD_MIME,
  type CellPoint,
  type TableClipboard,
  type TableCommand,
} from "../model/table";
import { commonStyle } from "../model/styles";
import { ColorPicker } from "./ColorPicker";
import { CommitInput } from "./CommitInput";
import {
  FontMenu,
  FormatIcon,
  FormatMenuItem,
  FormatPopover,
} from "./FormatControls";
import { ElementMenu } from "./ElementMenu";
import { TableGrid } from "./TableGrid";
import {
  parseTableClipboard,
  rememberedTableClipboard,
  rememberTableClipboard,
  tableClipboardHtml,
} from "./table-clipboard";

type StablePoint = { row: string; column: string };
type TableAxis = "row" | "column";
type TableMenuAction = {
  label: string;
  run(): void;
  disabled?: boolean;
  separator?: boolean;
};
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
  onDone(): void;
  viewScale?: number;
  actions?: ReactNode;
}) {
  const t = useT(),
    ids = tableIds(element),
    root = useRef<HTMLDivElement>(null),
    toolbar = useRef<HTMLDivElement>(null);
  const first = { row: ids.rowIds[0], column: ids.columnIds[0] };
  const [range, setRange] = useState({ anchor: first, focus: first }),
    [editing, setEditing] = useState(false),
    [draft, setDraft] = useState("");
  const [message, setMessage] = useState(""),
    [orphanDraft, setOrphanDraft] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null),
    [portal, setPortal] = useState<HTMLElement | null>(null);
  const editingRef = useRef(false),
    draftRef = useRef(""),
    baseline = useRef(""),
    editTarget = useRef<StablePoint>(first);
  const mounted = useRef(true),
    clipboardRequest = useRef(0),
    selectionSignature = useRef("");
  selectionSignature.current = JSON.stringify(range);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      clipboardRequest.current++;
    };
  }, []);
  const selecting = useRef(false),
    dragged = useRef(false);
  const move = useRef<{ x: number; y: number } | null>(null),
    [offset, setOffset] = useState({ x: 0, y: 0 });
  const resize = useRef<{
    axis: TableAxis;
    index: number;
    x: number;
    y: number;
    sizes: number[];
    original: number[];
  } | null>(null);
  const [preview, setPreview] = useState<{
    columns: number[];
    rows: number[];
  } | null>(null);
  const point = (value: StablePoint): CellPoint => ({
    row: Math.max(0, ids.rowIds.indexOf(value.row)),
    column: Math.max(0, ids.columnIds.indexOf(value.column)),
  });
  const stable = (p: CellPoint): StablePoint => ({
    row: ids.rowIds[p.row],
    column: ids.columnIds[p.column],
  });
  const focus = point(range.focus),
    bounds = tableBounds(element, point(range.anchor), focus);
  const selectedRows = ids.rowIds.slice(bounds.top, bounds.bottom + 1),
    selectedColumns = ids.columnIds.slice(bounds.left, bounds.right + 1);
  const count = selectedRows.length * selectedColumns.length;
  const metrics = preview ?? tableMetrics(element),
    angle = (-element.transform.rotation * Math.PI) / 180;
  const selectedStyles: Required<TableCellStyle>[] = [];
  for (let r = bounds.top; r <= bounds.bottom; r++)
    for (let c = bounds.left; c <= bounds.right; c++)
      selectedStyles.push(tableCellStyle(element, r, c));
  const style = commonStyle(selectedStyles),
    selectedMerges = (element.merges ?? []).filter(
      (m) =>
        m.row <= bounds.bottom &&
        m.row + m.rowSpan > bounds.top &&
        m.column <= bounds.right &&
        m.column + m.columnSpan > bounds.left,
    );
  const current = () =>
    readSlide(controller.doc, slideId)?.elements[element.id] as
      TableElement | undefined;
  const updateDraft = (value: string) => {
    draftRef.current = value;
    setDraft(value);
  };
  const focusButton = (p: CellPoint) =>
    requestAnimationFrame(() =>
      root.current
        ?.querySelector<HTMLButtonElement>(
          `button[data-r="${p.row}"][data-c="${p.column}"]`,
        )
        ?.focus(),
    );
  const commit = () => {
    if (!editingRef.current) return true;
    const ok = controller.tableCommand(slideId, element.id, {
      kind: "cell",
      ...editTarget.current,
      value: draftRef.current,
      expected: baseline.current,
    });
    if (!ok) {
      setMessage("table.conflict");
      return false;
    }
    editingRef.current = false;
    setEditing(false);
    setMessage("");
    return true;
  };
  const run = (command: TableCommand) => {
    if (!commit()) return false;
    const ok = controller.tableCommand(slideId, element.id, command);
    if (!ok) setMessage("table.actionUnavailable");
    else {
      setMessage("");
      focusButton(focus);
    }
    return ok;
  };
  const setFocus = (p: CellPoint, extend = false, table = element) => {
    const anchor = cellAnchor(table, p),
      tableAxes = tableIds(table),
      value = {
        row: tableAxes.rowIds[anchor.row],
        column: tableAxes.columnIds[anchor.column],
      };
    setRange((old) => ({ anchor: extend ? old.anchor : value, focus: value }));
    setEditing(false);
    focusButton(anchor);
  };
  const beginEdit = (p: CellPoint, replacement?: string) => {
    if (!commit()) return;
    const anchored = cellAnchor(element, p),
      target = stable(anchored),
      value = element.cells[anchored.row][anchored.column];
    setRange({ anchor: target, focus: target });
    editTarget.current = target;
    baseline.current = value;
    updateDraft(replacement ?? value);
    editingRef.current = true;
    setEditing(true);
    setMessage("");
  };
  const cancelEdit = () => {
    editingRef.current = false;
    setEditing(false);
    setMessage("");
    focusButton(focus);
  };
  const insert = (axis: TableAxis, before = false) => {
    const axisIds = axis === "row" ? ids.rowIds : ids.columnIds,
      index =
        axis === "row"
          ? before
            ? bounds.top
            : bounds.bottom
          : before
            ? bounds.left
            : bounds.right;
    run({
      kind: axis === "row" ? "insert-row" : "insert-column",
      after: before ? (axisIds[index - 1] ?? null) : axisIds[index],
    });
  };
  const clear = () =>
    run({ kind: "clear", rows: selectedRows, columns: selectedColumns });
  const format = (patch: TableCellStyle) =>
    run({
      kind: "style",
      rows: selectedRows,
      columns: selectedColumns,
      style: patch,
    });
  const merge = () => {
    if (run({ kind: "merge", rows: selectedRows, columns: selectedColumns }))
      setFocus({ row: bounds.top, column: bounds.left });
  };
  const split = () =>
    run({ kind: "split", targets: selectedMerges.map((m) => m.id) });
  const payload = () => tableClipboard(current() ?? element, bounds);
  const copySelection = (event: ReactClipboardEvent, cut = false) => {
    if (editing) return;
    event.preventDefault();
    event.stopPropagation();
    const value = payload();
    rememberTableClipboard(value);
    event.clipboardData.setData(TABLE_CLIPBOARD_MIME, JSON.stringify(value));
    event.clipboardData.setData("text/plain", tableTsv(value.cells));
    event.clipboardData.setData("text/html", tableClipboardHtml(value));
    if (cut) clear();
  };
  const copy = async () => {
    if (!commit()) return;
    const value = payload();
    rememberTableClipboard(value);
    try {
      if (typeof ClipboardItem !== "undefined" && navigator.clipboard.write)
        await navigator.clipboard.write([
          new ClipboardItem({
            "text/plain": new Blob([tableTsv(value.cells)], {
              type: "text/plain",
            }),
            "text/html": new Blob([tableClipboardHtml(value)], {
              type: "text/html",
            }),
          }),
        ]);
      else await navigator.clipboard.writeText(tableTsv(value.cells));
    } catch {
      setMessage("table.localClipboard");
    }
  };
  const paste = (value: TableClipboard) => {
    if (!commit()) return;
    if (value.cells.length === 1 && value.cells[0].length === 1 && count > 1)
      value = {
        ...value,
        cells: selectedRows.map(() =>
          selectedColumns.map(() => value.cells[0][0]),
        ),
        cellStyles: value.cellStyles
          ? selectedRows.map(() =>
              selectedColumns.map(() => value.cellStyles![0][0]),
            )
          : undefined,
        merges: [],
      };
    const ok = controller.tableCommand(slideId, element.id, {
      kind: "paste",
      row: ids.rowIds[bounds.top],
      column: ids.columnIds[bounds.left],
      payload: value,
    });
    if (!ok) {
      setMessage("table.pasteLimit");
      return;
    }
    const next = current()!,
      nextIds = tableIds(next),
      startRow = nextIds.rowIds.indexOf(ids.rowIds[bounds.top]),
      startColumn = nextIds.columnIds.indexOf(ids.columnIds[bounds.left]);
    setRange({
      anchor: {
        row: nextIds.rowIds[startRow],
        column: nextIds.columnIds[startColumn],
      },
      focus: {
        row: nextIds.rowIds[startRow + value.cells.length - 1],
        column: nextIds.columnIds[startColumn + value.cells[0].length - 1],
      },
    });
    setMessage("");
    focusButton({ row: bounds.top, column: bounds.left });
  };
  const pasteRemembered = async () => {
    const request = ++clipboardRequest.current,
      selection = selectionSignature.current;
    const validTarget = () =>
      mounted.current &&
      request === clipboardRequest.current &&
      selection === selectionSignature.current;
    const cached = rememberedTableClipboard();
    try {
      const types: Record<string, string> = {};
      if (navigator.clipboard.read) {
        for (const item of await navigator.clipboard.read())
          for (const type of ["text/html", "text/plain"])
            if (item.types.includes(type))
              types[type] = await (await item.getType(type)).text();
      } else types["text/plain"] = await navigator.clipboard.readText();
      if (!types["text/plain"] && !types["text/html"])
        throw new Error("EMPTY_CLIPBOARD");
      const value =
        cached && types["text/plain"] === tableTsv(cached.cells)
          ? cached
          : parseTableClipboard({ getData: (type) => types[type] ?? "" });
      if (validTarget()) paste(value);
    } catch {
      if (!validTarget()) return;
      if (cached) paste(cached);
      else setMessage("table.pasteShortcut");
    }
  };
  const tab = (direction: 1 | -1) => {
    if (!commit()) return;
    const table = current() ?? element,
      visible: CellPoint[] = [];
    table.cells.forEach((row, r) =>
      row.forEach((_, c) => {
        const a = cellAnchor(table, { row: r, column: c });
        if (a.row === r && a.column === c) visible.push(a);
      }),
    );
    const anchor = cellAnchor(table, focus),
      index = visible.findIndex(
        (p) => p.row === anchor.row && p.column === anchor.column,
      ),
      next = visible[index + direction];
    if (next) setFocus(next, false, table);
    else if (direction === 1 && table.cells.length < 100) {
      const nextIds = tableIds(table);
      if (
        controller.tableCommand(slideId, element.id, {
          kind: "insert-row",
          after: nextIds.rowIds.at(-1)!,
        })
      ) {
        const added = current()!;
        setFocus({ row: added.cells.length - 1, column: 0 }, false, added);
      }
    } else focusButton(anchor);
  };
  const navigate = (key: string, extend: boolean, modifier: boolean) => {
    const m = mergeAt(element, focus.row, focus.column),
      next = { ...focus };
    if (key === "ArrowLeft") next.column--;
    if (key === "ArrowRight") next.column += m?.columnSpan ?? 1;
    if (key === "ArrowUp") next.row--;
    if (key === "ArrowDown") next.row += m?.rowSpan ?? 1;
    if (key === "Home") {
      next.column = 0;
      if (modifier) next.row = 0;
    }
    if (key === "End") {
      next.column = ids.columnIds.length - 1;
      if (modifier) next.row = ids.rowIds.length - 1;
    }
    next.row = Math.max(0, Math.min(ids.rowIds.length - 1, next.row));
    next.column = Math.max(0, Math.min(ids.columnIds.length - 1, next.column));
    setFocus(next, extend);
  };
  const selectAxis = (axis: TableAxis, index: number, extend: boolean) => {
    if (!commit()) return;
    const start =
      axis === "row"
        ? { row: extend ? bounds.top : index, column: 0 }
        : { row: 0, column: extend ? bounds.left : index };
    const end =
      axis === "row"
        ? { row: index, column: ids.columnIds.length - 1 }
        : { row: ids.rowIds.length - 1, column: index };
    setRange({ anchor: stable(start), focus: stable(end) });
    focusButton(cellAnchor(element, start));
  };
  const selectAll = () => {
    if (!commit()) return;
    setRange({
      anchor: first,
      focus: { row: ids.rowIds.at(-1)!, column: ids.columnIds.at(-1)! },
    });
    focusButton({ row: 0, column: 0 });
  };
  // Both menu surfaces use the same commands and availability checks.
  const clipboardActions: TableMenuAction[] = [
    { label: t("table.copyCells"), run: copy },
    { label: t("table.pasteCells"), run: pasteRemembered },
    { label: t("table.clearCells"), run: clear },
    { label: t("table.selectAll"), run: selectAll },
  ];
  const mergeActions: TableMenuAction[] = [
    { label: t("table.merge"), run: merge, disabled: count < 2 },
    { label: t("table.split"), run: split, disabled: !selectedMerges.length },
  ];
  const structureActions: TableMenuAction[] = [
    {
      label: t("table.insertRowAbove"),
      run: () => insert("row", true),
      disabled: ids.rowIds.length >= 100,
    },
    {
      label: t("table.insertRowBelow"),
      run: () => insert("row"),
      disabled: ids.rowIds.length >= 100,
    },
    {
      label: t("table.insertColLeft"),
      run: () => insert("column", true),
      disabled: ids.columnIds.length >= 100,
    },
    {
      label: t("table.insertColRight"),
      run: () => insert("column"),
      disabled: ids.columnIds.length >= 100,
    },
    {
      label: t("table.deleteRow"),
      run: () => run({ kind: "delete-rows", targets: selectedRows }),
      disabled: selectedRows.length >= ids.rowIds.length,
      separator: true,
    },
    {
      label: t("table.deleteCol"),
      run: () => run({ kind: "delete-columns", targets: selectedColumns }),
      disabled: selectedColumns.length >= ids.columnIds.length,
    },
  ];
  const menuItems = (items: TableMenuAction[], close: () => void) =>
    items.map((action) => (
      <Fragment key={action.label}>
        {action.separator && <hr />}
        <FormatMenuItem
          disabled={action.disabled}
          onClick={() => {
            action.run();
            close();
          }}
        >
          {action.label}
        </FormatMenuItem>
      </Fragment>
    ));
  const resizeAxis = (axis: TableAxis, sizes: number[], extent?: number) => {
    const axisIds = axis === "row" ? ids.rowIds : ids.columnIds;
    return run({
      kind: "resize",
      axis,
      sizes: sizes.map((size, i) => ({ target: axisIds[i], size })),
      ...(extent === undefined ? {} : { extent }),
    });
  };
  useLayoutEffect(() => {
    setPortal(
      root.current?.closest<HTMLElement>(".eppt-workspace") ?? document.body,
    );
  }, []);
  useLayoutEffect(() => {
    const place = () => {
      const bar = toolbar.current,
        table = root.current,
        area = table?.closest(".eppt-canvas-area")?.getBoundingClientRect();
      if (!bar || !table) return;
      const rect = table.getBoundingClientRect(),
        left = area?.left ?? 0,
        right = area?.right ?? window.innerWidth,
        top = area?.top ?? 0;
      bar.style.maxWidth = `${Math.max(180, right - left - 16)}px`;
      bar.style.left = `${Math.max(left + 8, Math.min(rect.left, right - bar.offsetWidth - 8))}px`;
      bar.style.top = `${Math.max(top + 8, rect.top - bar.offsetHeight - 28)}px`;
    };
    place();
    const observer = new ResizeObserver(place);
    if (root.current) observer.observe(root.current);
    if (toolbar.current) observer.observe(toolbar.current);
    const area = root.current?.closest(".eppt-canvas-area");
    if (area) observer.observe(area);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [portal, element.transform, offset, viewScale]);
  useEffect(() => {
    const valid = (p: StablePoint) =>
      ids.rowIds.includes(p.row) && ids.columnIds.includes(p.column);
    if (editingRef.current && !valid(editTarget.current)) {
      setOrphanDraft(draftRef.current);
      editingRef.current = false;
      setEditing(false);
      setMessage("table.targetDeleted");
    }
    if (!valid(range.anchor) || !valid(range.focus)) {
      setRange({ anchor: first, focus: first });
    }
  }, [ids.rowIds.join(), ids.columnIds.join()]);
  useEffect(() => {
    const end = () => {
      selecting.current = false;
    };
    window.addEventListener("pointerup", end);
    return () => window.removeEventListener("pointerup", end);
  }, []);
  const startResize = (
    event: ReactPointerEvent<HTMLDivElement>,
    axis: TableAxis,
    index: number,
  ) => {
    if (!commit()) return;
    event.preventDefault();
    event.stopPropagation();
    const sizes = axis === "row" ? metrics.rows : metrics.columns;
    resize.current = {
      axis,
      index,
      x: event.clientX,
      y: event.clientY,
      sizes: [...sizes],
      original: [...sizes],
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const resizeMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const value = resize.current;
    if (!value) return;
    const dx = (event.clientX - value.x) / viewScale,
      dy = (event.clientY - value.y) / viewScale;
    const delta =
      value.axis === "column"
        ? dx * Math.cos(angle) - dy * Math.sin(angle)
        : dx * Math.sin(angle) + dy * Math.cos(angle);
    const { index, original } = value,
      min = Math.min(value.axis === "column" ? 48 : 24, original[index]);
    let change = Math.max(min - original[index], delta);
    if (index < original.length - 1)
      change = Math.min(
        change,
        original[index + 1] - Math.min(min, original[index + 1]),
      );
    const sizes = [...original];
    sizes[index] += change;
    if (index < sizes.length - 1) sizes[index + 1] -= change;
    value.sizes = sizes;
    setPreview({
      ...tableMetrics(element),
      [value.axis === "row" ? "rows" : "columns"]: sizes,
    });
  };
  const endResize = () => {
    const value = resize.current;
    resize.current = null;
    setPreview(null);
    if (!value || value.sizes.every((size, i) => size === value.original[i]))
      return;
    resizeAxis(
      value.axis,
      value.sizes,
      value.sizes.reduce((a, b) => a + b, 0),
    );
  };
  const button = (
    label: string,
    content: ReactNode,
    action: () => void,
    pressed?: boolean,
    disabled = false,
  ) => (
    <button
      type="button"
      key={label}
      title={label}
      aria-label={label}
      aria-pressed={pressed}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={action}
    >
      {content}
    </button>
  );
  const commandBar = (
    <div
      ref={toolbar}
      className="eppt-table-commands eppt-selection-format"
      role="toolbar"
      aria-label={t("table.commands")}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        aria-label={t("table.move")}
        title={t("table.moveHint")}
        className="eppt-table-move"
        onPointerDown={(e) => {
          if (!commit()) return;
          move.current = { x: e.clientX, y: e.clientY };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (move.current)
            setOffset({
              x: (e.clientX - move.current.x) / viewScale,
              y: (e.clientY - move.current.y) / viewScale,
            });
        }}
        onPointerUp={(e) => {
          if (move.current) {
            const x = (e.clientX - move.current.x) / viewScale,
              y = (e.clientY - move.current.y) / viewScale;
            if (x || y)
              controller.patch(slideId, element.id, {
                transform: {
                  x: element.transform.x + pxToEmu(x),
                  y: element.transform.y + pxToEmu(y),
                },
              });
          }
          move.current = null;
          setOffset({ x: 0, y: 0 });
        }}
        onPointerCancel={() => {
          move.current = null;
          setOffset({ x: 0, y: 0 });
        }}
      >
        ✥
      </button>
      <span className="eppt-format-divider" />
      {(["bold", "italic", "underline"] as const).map((mark) =>
        button(
          t(`toolbar.${mark}`),
          <span
            style={{
              fontWeight: mark === "bold" ? 700 : undefined,
              fontStyle: mark === "italic" ? "italic" : undefined,
              textDecoration: mark === "underline" ? "underline" : undefined,
            }}
          >
            {{ bold: "B", italic: "I", underline: "U" }[mark]}
          </span>,
          () => format({ [mark]: !style[mark] }),
          style[mark],
        ),
      )}
      <CommitInput
        aria-label={t("toolbar.fontSize")}
        className="eppt-table-font-size"
        value={style.fontSize === undefined ? "" : String(style.fontSize)}
        placeholder="—"
        inputMode="decimal"
        onCommit={(value) => {
          const n = Number(value);
          if (value.trim() && n >= 6 && n <= 200) format({ fontSize: n });
        }}
      />
      <ColorPicker
        label={t("toolbar.textColor")}
        mixed={style.color === undefined}
        value={style.color}
        mark="text"
        onChange={(color) => format({ color })}
      />
      <ColorPicker
        circle
        label={t("table.fill")}
        mixed={style.backgroundColor === undefined}
        value={style.backgroundColor}
        clearable
        onChange={(backgroundColor) =>
          format({ backgroundColor: backgroundColor ?? "transparent" })
        }
      />
      <FormatPopover
        label={t("float.align")}
        trigger={
          <>
            <FormatIcon
              name={
                style.align === "center"
                  ? "alignCenter"
                  : style.align === "right"
                    ? "alignRight"
                    : "alignLeft"
              }
            />
            <span className="eppt-chevron">⌄</span>
          </>
        }
      >
        {(close) =>
          (["left", "center", "right"] as const).map((align) => (
            <FormatMenuItem
              key={align}
              checked={style.align === align}
              onClick={() => {
                format({ align });
                close();
              }}
            >
              {t(`style.align.${align}`)}
            </FormatMenuItem>
          ))
        }
      </FormatPopover>
      <span className="eppt-format-divider" />
      {button(
        t("table.merge"),
        t("table.mergeShort"),
        merge,
        undefined,
        count < 2,
      )}
      {button(
        t("table.split"),
        t("table.splitShort"),
        split,
        undefined,
        !selectedMerges.length,
      )}
      <FormatPopover
        label={t("table.rowsColumns")}
        trigger={
          <>
            {t("table.rowsColumns")}
            <span className="eppt-chevron">⌄</span>
          </>
        }
        width={192}
      >
        {(close) => menuItems(structureActions, close)}
      </FormatPopover>
      <FormatPopover
        label={t("table.settings")}
        role="dialog"
        width={246}
        trigger={<FormatIcon name="more" />}
      >
        {(close) => (
          <div className="eppt-table-options">
            <FontMenu
              value={style.fontFamily}
              onChange={(fontFamily) => format({ fontFamily })}
            />
            <div className="eppt-panel-segments">
              {(["top", "middle", "bottom"] as const).map((verticalAlign) =>
                button(
                  t(`props.${verticalAlign}`),
                  <FormatIcon name={verticalAlign} />,
                  () => format({ verticalAlign }),
                  style.verticalAlign === verticalAlign,
                ),
              )}
            </div>
            {(["column", "row"] as const).map((axis) => (
              <FormatMenuItem
                key={axis}
                onClick={() => {
                  const axisIds = axis === "row" ? ids.rowIds : ids.columnIds,
                    extent = emuToPx(
                      axis === "row"
                        ? element.transform.height
                        : element.transform.width,
                    );
                  resizeAxis(
                    axis,
                    axisIds.map(() => extent / axisIds.length),
                  );
                  close();
                }}
              >
                {t(axis === "row" ? "table.equalRows" : "table.equalColumns")}
              </FormatMenuItem>
            ))}
            <hr />
            {menuItems(clipboardActions, close)}
            <p className="eppt-menu-caption">{t("table.keyboardHint")}</p>
          </div>
        )}
      </FormatPopover>
      <span className="eppt-table-selection-count" aria-live="polite">
        {t("table.selectionCount", { count })}
      </span>
      {actions}
    </div>
  );
  const resizeSegments = (axis: TableAxis, index: number) => {
    const sizes = axis === "row" ? metrics.columns : metrics.rows;
    const total = sizes.reduce((a, b) => a + b, 0),
      segments: { start: number; end: number }[] = [];
    let at = 0;
    sizes.forEach((size, i) => {
      const merge = mergeAt(
        element,
        axis === "row" ? index : i,
        axis === "row" ? i : index,
      );
      const blocked =
        merge &&
        (axis === "row"
          ? merge.row + merge.rowSpan - 1 > index
          : merge.column + merge.columnSpan - 1 > index);
      if (!blocked) {
        const previous = segments.at(-1);
        if (previous && previous.end === at) previous.end = at + size;
        else segments.push({ start: at, end: at + size });
      }
      at += size;
    });
    return segments.map((s) => ({
      start: (s.start / total) * 100,
      length: ((s.end - s.start) / total) * 100,
    }));
  };
  const totalWidth = metrics.columns.reduce((a, b) => a + b, 0),
    totalHeight = metrics.rows.reduce((a, b) => a + b, 0);
  return (
    <div
      ref={root}
      className="eppt-table-overlay"
      style={{
        width: preview ? totalWidth : undefined,
        height: preview ? totalHeight : undefined,
        transform: `translate(${offset.x * Math.cos(angle) - offset.y * Math.sin(angle)}px, ${offset.x * Math.sin(angle) + offset.y * Math.cos(angle)}px)`,
      }}
      onPointerDown={(e) => e.stopPropagation()}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        const hit = (e.target as HTMLElement).closest<HTMLElement>(
          "[data-r][data-c]",
        );
        if (hit) {
          const r = Number(hit.dataset.r),
            c = Number(hit.dataset.c);
          if (
            r < bounds.top ||
            r > bounds.bottom ||
            c < bounds.left ||
            c > bounds.right
          ) {
            if (!commit()) return;
            setFocus({ row: r, column: c });
          }
        }
        setMenu({ x: e.clientX, y: e.clientY });
      }}
      onCopy={copySelection}
      onCut={(event) => copySelection(event, true)}
      onPaste={(e) => {
        e.stopPropagation();
        if (
          editing &&
          !/<table[\s>]/i.test(e.clipboardData.getData("text/html")) &&
          !e.clipboardData.getData("text/plain").includes("\t") &&
          !e.clipboardData.getData(TABLE_CLIPBOARD_MIME)
        )
          return;
        e.preventDefault();
        try {
          paste(parseTableClipboard(e.clipboardData));
        } catch {
          setMessage("table.pasteLimit");
        }
      }}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.nativeEvent.isComposing || editing) return;
        const modifier = e.metaKey || e.ctrlKey,
          key = e.key.toLowerCase();
        if (modifier && key === "a") {
          e.preventDefault();
          selectAll();
          return;
        }
        if (modifier && (key === "z" || key === "y")) {
          e.preventDefault();
          key === "y" || e.shiftKey ? controller.redo() : controller.undo();
          return;
        }
        if (e.key === "Escape") {
          e.preventDefault();
          onDone();
          return;
        }
        if (e.key === "Tab") {
          e.preventDefault();
          tab(e.shiftKey ? -1 : 1);
          return;
        }
        if (
          [
            "ArrowUp",
            "ArrowDown",
            "ArrowLeft",
            "ArrowRight",
            "Home",
            "End",
          ].includes(e.key)
        ) {
          e.preventDefault();
          navigate(e.key, e.shiftKey, modifier);
          return;
        }
        if (e.key === "Enter" || e.key === "F2") {
          e.preventDefault();
          beginEdit(focus);
          return;
        }
        if (e.key === "Delete" || e.key === "Backspace") {
          e.preventDefault();
          clear();
          return;
        }
        if (
          !modifier &&
          !e.altKey &&
          (e.key.length === 1 || e.key === "Process")
        ) {
          e.preventDefault();
          beginEdit(
            { row: bounds.top, column: bounds.left },
            e.key === "Process" ? "" : e.key,
          );
        }
      }}
    >
      {portal && createPortal(commandBar, portal)}
      <div
        className="eppt-table-column-heads"
        aria-label={t("table.columnSelection")}
      >
        {metrics.columns.map((width, c) => (
          <button
            key={ids.columnIds[c]}
            type="button"
            style={{ width: `${(width / totalWidth) * 100}%` }}
            aria-label={t("table.selectColumn", { column: c + 1 })}
            aria-pressed={
              bounds.top === 0 &&
              bounds.bottom === ids.rowIds.length - 1 &&
              c >= bounds.left &&
              c <= bounds.right
            }
            onMouseDown={(e) => e.preventDefault()}
            onClick={(e) => selectAxis("column", c, e.shiftKey)}
          >
            {String.fromCharCode(65 + Math.floor(c / 26) - 1).replace("@", "")}
            {String.fromCharCode(65 + (c % 26))}
          </button>
        ))}
      </div>
      <div
        className="eppt-table-row-heads"
        aria-label={t("table.rowSelection")}
      >
        {metrics.rows.map((height, r) => (
          <button
            key={ids.rowIds[r]}
            type="button"
            style={{ height: `${(height / totalHeight) * 100}%` }}
            aria-label={t("table.selectRow", { row: r + 1 })}
            aria-pressed={
              bounds.left === 0 &&
              bounds.right === ids.columnIds.length - 1 &&
              r >= bounds.top &&
              r <= bounds.bottom
            }
            onMouseDown={(e) => e.preventDefault()}
            onClick={(e) => selectAxis("row", r, e.shiftKey)}
          >
            {r + 1}
          </button>
        ))}
      </div>
      <button
        type="button"
        className="eppt-table-corner"
        aria-label={t("table.selectAll")}
        onMouseDown={(e) => e.preventDefault()}
        onClick={selectAll}
      >
        ▦
      </button>
      <TableGrid
        element={element}
        metrics={metrics}
        gridLabel={t("table.grid")}
        cellProps={(r, c) => ({
          className:
            r >= bounds.top &&
            r <= bounds.bottom &&
            c >= bounds.left &&
            c <= bounds.right
              ? "eppt-table-cell-selected"
              : "",
          "aria-selected":
            r >= bounds.top &&
            r <= bounds.bottom &&
            c >= bounds.left &&
            c <= bounds.right,
        })}
        renderCell={(value, r, c) => {
          const active =
            ids.rowIds[r] === range.focus.row &&
            ids.columnIds[c] === range.focus.column;
          return active && editing ? (
            <textarea
              data-r={r}
              data-c={c}
              autoFocus
              maxLength={100000}
              aria-label={t("table.cellEdit", { row: r + 1, column: c + 1 })}
              value={draft}
              onChange={(e) => updateDraft(e.target.value)}
              onBlur={() => {
                commit();
              }}
              onPointerDown={(e) => {
                e.stopPropagation();
                selecting.current = true;
                dragged.current = false;
              }}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.nativeEvent.isComposing) return;
                if (e.key === "Escape") {
                  e.preventDefault();
                  cancelEdit();
                } else if (e.key === "Tab") {
                  e.preventDefault();
                  tab(e.shiftKey ? -1 : 1);
                } else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault();
                  if (commit())
                    setFocus({
                      row: Math.min(ids.rowIds.length - 1, r + 1),
                      column: c,
                    });
                }
              }}
            />
          ) : (
            <button
              type="button"
              style={{
                textAlign: "inherit",
                alignItems: {
                  top: "flex-start",
                  middle: "center",
                  bottom: "flex-end",
                }[tableCellStyle(element, r, c).verticalAlign],
              }}
              data-r={r}
              data-c={c}
              aria-label={t("table.cell", {
                row: r + 1,
                column: c + 1,
                value: value || t("table.empty"),
              })}
              tabIndex={active ? 0 : -1}
              onPointerDown={(e) => {
                if (e.button !== 0) return;
                if (!commit()) return;
                dragged.current = false;
                selecting.current = true;
                const p = cellAnchor(element, { row: r, column: c }),
                  target = stable(p);
                setRange((old) => ({
                  anchor: e.shiftKey ? old.anchor : target,
                  focus: target,
                }));
                if (e.shiftKey) {
                  dragged.current = true;
                  e.preventDefault();
                }
              }}
              onPointerEnter={(e) => {
                if (selecting.current && e.buttons === 1) {
                  if (!commit()) return;
                  dragged.current = true;
                  editingRef.current = false;
                  setEditing(false);
                  setRange((old) => ({
                    ...old,
                    focus: stable(cellAnchor(element, { row: r, column: c })),
                  }));
                }
              }}
              onClick={(e) => {
                selecting.current = false;
                if (dragged.current || e.shiftKey) return;
                beginEdit({ row: r, column: c });
              }}
              onDoubleClick={() => beginEdit({ row: r, column: c })}
            >
              <span>{value || "\u00a0"}</span>
            </button>
          );
        }}
      />
      <div
        className="eppt-table-range"
        aria-hidden="true"
        style={{
          left: `${(metrics.columns.slice(0, bounds.left).reduce((a, b) => a + b, 0) / totalWidth) * 100}%`,
          top: `${(metrics.rows.slice(0, bounds.top).reduce((a, b) => a + b, 0) / totalHeight) * 100}%`,
          width: `${(metrics.columns.slice(bounds.left, bounds.right + 1).reduce((a, b) => a + b, 0) / totalWidth) * 100}%`,
          height: `${(metrics.rows.slice(bounds.top, bounds.bottom + 1).reduce((a, b) => a + b, 0) / totalHeight) * 100}%`,
        }}
      />
      <div className="eppt-table-resizers">
        {(["column", "row"] as const).flatMap((axis) => {
          const vertical = axis === "column",
            sizes = vertical ? metrics.columns : metrics.rows,
            total = vertical ? totalWidth : totalHeight,
            keys = vertical
              ? ["ArrowLeft", "ArrowRight"]
              : ["ArrowUp", "ArrowDown"];
          let offset = 0;
          return sizes.map((size, index) => {
            offset += size;
            return (
              <div
                key={`${axis}${index}`}
                role="separator"
                aria-orientation={vertical ? "vertical" : "horizontal"}
                aria-valuenow={Math.round(size)}
                aria-valuemin={1}
                aria-valuemax={100000}
                aria-label={
                  vertical
                    ? t("table.resizeColumn", { column: index + 1 })
                    : t("table.resizeRow", { row: index + 1 })
                }
                tabIndex={0}
                style={{
                  [vertical ? "left" : "top"]: `${(offset / total) * 100}%`,
                }}
                className={`eppt-table-resize-${axis}`}
                onPointerDown={(event) => startResize(event, axis, index)}
                onPointerMove={resizeMove}
                onPointerUp={endResize}
                onPointerCancel={() => {
                  resize.current = null;
                  setPreview(null);
                }}
                onKeyDown={(event) => {
                  if (!keys.includes(event.key)) return;
                  event.preventDefault();
                  event.stopPropagation();
                  const next = [...sizes];
                  next[index] = Math.max(
                    vertical ? 48 : 24,
                    size + (event.key === keys[1] ? 8 : -8),
                  );
                  resizeAxis(
                    axis,
                    next,
                    next.reduce((a, b) => a + b, 0),
                  );
                }}
              >
                {resizeSegments(axis, index).map((segment, i) => (
                  <i
                    key={i}
                    style={{
                      position: "absolute",
                      [vertical ? "left" : "top"]: 0,
                      [vertical ? "width" : "height"]: "100%",
                      [vertical ? "top" : "left"]: `${segment.start}%`,
                      [vertical ? "height" : "width"]: `${segment.length}%`,
                      pointerEvents: "auto",
                    }}
                  />
                ))}
              </div>
            );
          });
        })}
      </div>
      <button
        type="button"
        className="eppt-table-add-row"
        aria-label={t("table.addRow")}
        disabled={ids.rowIds.length >= 100}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => run({ kind: "insert-row", after: ids.rowIds.at(-1)! })}
      >
        ＋
      </button>
      <button
        type="button"
        className="eppt-table-add-column"
        aria-label={t("table.addColumn")}
        disabled={ids.columnIds.length >= 100}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() =>
          run({ kind: "insert-column", after: ids.columnIds.at(-1)! })
        }
      >
        ＋
      </button>
      {message && (
        <div className="eppt-table-message" role="alert">
          {displayMessage(t, message)}
          {orphanDraft !== null && (
            <textarea
              aria-label={t("table.retainedDraft")}
              readOnly
              value={orphanDraft}
            />
          )}
          <button
            type="button"
            onClick={() => {
              const live = current(),
                target = editTarget.current,
                axes = live && tableIds(live),
                r = axes?.rowIds.indexOf(target.row) ?? -1,
                c = axes?.columnIds.indexOf(target.column) ?? -1;
              if (live && r >= 0 && c >= 0) {
                baseline.current = live.cells[r][c];
                updateDraft(baseline.current);
              } else cancelEdit();
              setOrphanDraft(null);
              setMessage("");
            }}
          >
            {t("table.reloadCell")}
          </button>
        </div>
      )}
      {portal &&
        menu &&
        createPortal(
          <ElementMenu
            x={menu.x}
            y={menu.y}
            onClose={() => {
              setMenu(null);
              focusButton(focus);
            }}
            actions={[
              ...clipboardActions.slice(0, 3),
              ...mergeActions.map((action, index) => ({
                ...action,
                separator: index === 0,
              })),
              ...structureActions.map((action, index) => ({
                ...action,
                separator: index === 0,
              })),
            ]}
          />,
          portal,
        )}
    </div>
  );
}
