import type { TableCellStyle } from "../model/types";
import {
  TABLE_CLIPBOARD_MIME,
  parseTableTsv,
  validTableClipboard,
  type TableClipboard,
} from "../model/table";
let local: TableClipboard | undefined;
export const rememberTableClipboard = (payload: TableClipboard) => {
  local = structuredClone(payload);
};
export const rememberedTableClipboard = () => local && structuredClone(local);
const escape = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
const color = (value: string) => {
  if (/^#[\da-f]{6}$/i.test(value) || value === "transparent") return value;
  if (/^#[\da-f]{3}$/i.test(value))
    return (
      "#" +
      value
        .slice(1)
        .split("")
        .map((c) => c + c)
        .join("")
    );
  const rgb = /^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/.exec(value);
  return rgb
    ? "#" +
        rgb
          .slice(1)
          .map((n) => Math.min(255, Number(n)).toString(16).padStart(2, "0"))
          .join("")
    : undefined;
};
function htmlStyle(cell: HTMLTableCellElement): TableCellStyle {
  const leaf = cell.querySelector<HTMLElement>("[style]"),
    css = cell.style;
  const value = (key: string) =>
    css.getPropertyValue(key) || leaf?.style.getPropertyValue(key) || "";
  const size = /^(\d+(?:\.\d+)?)(px|pt)$/.exec(value("font-size")),
    align = value("text-align"),
    verticalAlign = value("vertical-align");
  const fg = color(value("color")),
    bg = color(value("background-color"));
  return {
    ...(fg ? { color: fg } : {}),
    ...(bg ? { backgroundColor: bg } : {}),
    ...(size
      ? {
          fontSize: Math.max(
            6,
            Math.min(200, Number(size[1]) * (size[2] === "px" ? 0.75 : 1)),
          ),
        }
      : {}),
    ...(value("font-family")
      ? {
          fontFamily: value("font-family")
            .replace(/^(['"])(.*)\1$/, "$2")
            .slice(0, 200),
        }
      : {}),
    ...(value("font-weight") || cell.querySelector("b,strong")
      ? {
          bold:
            value("font-weight") === "bold" ||
            Number(value("font-weight")) >= 600 ||
            !!cell.querySelector("b,strong"),
        }
      : {}),
    ...(value("font-style") || cell.querySelector("i,em")
      ? {
          italic:
            value("font-style") === "italic" || !!cell.querySelector("i,em"),
        }
      : {}),
    ...(value("text-decoration") || cell.querySelector("u")
      ? {
          underline:
            value("text-decoration").includes("underline") ||
            !!cell.querySelector("u"),
        }
      : {}),
    ...(["left", "center", "right"].includes(align)
      ? { align: align as TableCellStyle["align"] }
      : {}),
    ...(["top", "middle", "bottom"].includes(verticalAlign)
      ? { verticalAlign: verticalAlign as TableCellStyle["verticalAlign"] }
      : {}),
  };
}
export function tableClipboardHtml(payload: TableClipboard) {
  return `<table><tbody>${payload.cells
    .map(
      (row, r) =>
        `<tr>${row
          .map((value, c) => {
            const merge = payload.merges?.find(
              (m) =>
                r >= m.row &&
                r < m.row + m.rowSpan &&
                c >= m.column &&
                c < m.column + m.columnSpan,
            );
            if (merge && (r !== merge.row || c !== merge.column)) return "";
            const style = payload.cellStyles?.[r]?.[c],
              css = style
                ? [
                    style.color && `color:${style.color}`,
                    style.backgroundColor &&
                      `background-color:${style.backgroundColor}`,
                    style.fontFamily &&
                      `font-family:${JSON.stringify(style.fontFamily)}`,
                    style.fontSize && `font-size:${style.fontSize}pt`,
                    style.bold && "font-weight:700",
                    style.italic && "font-style:italic",
                    style.underline && "text-decoration:underline",
                    style.align && `text-align:${style.align}`,
                    style.verticalAlign &&
                      `vertical-align:${style.verticalAlign}`,
                  ]
                    .filter(Boolean)
                    .join(";")
                : "";
            return `<td${css ? ` style="${escape(css)}"` : ""}${merge ? ` rowspan="${merge.rowSpan}" colspan="${merge.columnSpan}"` : ""}>${escape(value).replaceAll("\n", "<br>")}</td>`;
          })
          .join("")}</tr>`,
    )
    .join("")}</tbody></table>`;
}
export function parseTableClipboard(
  data: Pick<DataTransfer, "getData">,
): TableClipboard {
  const native = data.getData(TABLE_CLIPBOARD_MIME);
  if (native) {
    if (native.length > 3000000) throw new Error("TABLE_PASTE_TOO_LARGE");
    const payload = JSON.parse(native);
    if (!validTableClipboard(payload))
      throw new Error("INVALID_TABLE_CLIPBOARD");
    return payload;
  }
  const html = data.getData("text/html");
  if (html && html.length <= 3000000 && typeof document !== "undefined") {
    // Template contents stay inert, including image/media sources from foreign clipboard HTML.
    const template = document.createElement("template");
    template.innerHTML = html;
    const table = template.content.querySelector("table");
    if (table) {
      const cells: string[][] = [],
        cellStyles: TableCellStyle[][] = [],
        merges: NonNullable<TableClipboard["merges"]> = [],
        occupied = new Set<string>();
      const rows = [...table.rows];
      if (rows.length > 100) throw new Error("TABLE_PASTE_TOO_LARGE");
      rows.forEach((row, r) => {
        cells[r] ??= [];
        cellStyles[r] ??= [];
        let c = 0;
        for (const cell of row.cells) {
          while (occupied.has(`${r}:${c}`)) c++;
          const rs = Math.max(1, cell.rowSpan),
            cs = Math.max(1, cell.colSpan);
          if (r + rs > 100 || c + cs > 100)
            throw new Error("TABLE_PASTE_TOO_LARGE");
          cell
            .querySelectorAll("script,style,iframe,object")
            .forEach((el) => el.remove());
          cell
            .querySelectorAll("img")
            .forEach((img) => img.replaceWith(img.getAttribute("alt") ?? ""));
          cell.querySelectorAll("br").forEach((br) => br.replaceWith("\n"));
          cells[r][c] = cell.textContent ?? "";
          cellStyles[r][c] = htmlStyle(cell);
          if (rs * cs > 1)
            merges.push({
              id: `html:${r}:${c}`,
              row: r,
              column: c,
              rowSpan: rs,
              columnSpan: cs,
            });
          for (let rr = r; rr < r + rs; rr++) {
            cells[rr] ??= [];
            cellStyles[rr] ??= [];
            for (let cc = c; cc < c + cs; cc++) {
              occupied.add(`${rr}:${cc}`);
              cells[rr][cc] ??= "";
              cellStyles[rr][cc] ??= {};
            }
          }
          c += cs;
        }
      });
      const width = Math.max(1, ...cells.map((row) => row.length));
      const payload = {
        version: 1 as const,
        cells: cells.map((row) =>
          Array.from({ length: width }, (_, c) => row[c] ?? ""),
        ),
        merges,
        cellStyles: cells.map((row, r) =>
          Array.from({ length: width }, (_, c) => cellStyles[r]?.[c] ?? {}),
        ),
      };
      if (!validTableClipboard(payload))
        throw new Error("INVALID_TABLE_CLIPBOARD");
      return payload;
    }
  }
  return { version: 1, cells: parseTableTsv(data.getData("text/plain")) };
}
