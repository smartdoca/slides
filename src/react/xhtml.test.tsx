// @vitest-environment jsdom
import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { foreignObjectHtml } from "./xhtml";
import { TableGrid } from "./TableGrid";
import { createPresentation } from "../model/create";
import { createYDocument, readDocument } from "../collaboration/yjs-codec";
import { EditorController } from "../model/controller";
import type { TableElement } from "../model/types";
it("preserves merged geometry when canvas markup is parsed as XHTML and leaves user text untouched", () => {
  const doc = createYDocument(createPresentation()),
    c = new EditorController(doc),
    sid = readDocument(doc).slideOrder[0],
    id = c.add(sid, "table");
  const table = readDocument(doc).slides[sid].elements[id] as TableElement;
  table.merges = [{ id: "m", row: 1, column: 0, rowSpan: 2, columnSpan: 2 }];
  table.cells[1][0] = 'rowSpan="2" colSpan="3"';
  const markup = foreignObjectHtml(
    renderToStaticMarkup(<TableGrid element={table} />),
  );
  const xml = new DOMParser().parseFromString(
    `<div xmlns="http://www.w3.org/1999/xhtml">${markup}</div>`,
    "application/xml",
  );
  expect(xml.querySelector("parsererror")).toBeNull();
  expect(xml.querySelector('td[rowspan="2"]')?.getAttribute("colspan")).toBe(
    "2",
  );
  expect(xml.documentElement.textContent).toContain('rowSpan="2" colSpan="3"');
  c.dispose();
  doc.destroy();
});
