// @vitest-environment jsdom
import { expect, it } from "vitest";
import { parseTableClipboard, tableClipboardHtml } from "./table-clipboard";
import { tableTsv, type TableClipboard } from "../model/table";
const data = (values: Record<string, string>) => ({
  getData: (key: string) => values[key] ?? "",
});
it("imports merged HTML, text safely, and rectangular blank cells", () => {
  const payload = parseTableClipboard(
    data({
      "text/html":
        '<table><tr><td rowspan="2">甲<br>乙<script>bad()</script></td><td>丙</td></tr><tr><td>丁</td></tr></table>',
    }),
  );
  expect(payload.cells).toEqual([
    ["甲\n乙", "丙"],
    ["", "丁"],
  ]);
  expect(payload.merges?.[0]).toMatchObject({
    row: 0,
    column: 0,
    rowSpan: 2,
    columnSpan: 1,
  });
});
it("exports an escaped table fragment and reimports merge geometry and readable content", () => {
  const value: TableClipboard = {
    version: 1,
    cells: [
      ["<甲>\n乙", "", "c"],
      ["", "", "d"],
    ],
    merges: [{ id: "m", row: 0, column: 0, rowSpan: 2, columnSpan: 2 }],
  };
  const html = tableClipboardHtml(value);
  expect(html).toContain("&lt;甲&gt;");
  expect(html).not.toContain("<甲>");
  const parsed = parseTableClipboard(
    data({ "text/html": html, "text/plain": tableTsv(value.cells) }),
  );
  expect(parsed.cells).toEqual(value.cells);
  expect(parsed.merges?.[0]).toMatchObject({ rowSpan: 2, columnSpan: 2 });
});
it("rejects invalid native payloads rather than accepting a lossy fallback", () => {
  expect(() =>
    parseTableClipboard(
      data({
        "application/x-eppt-table+json": JSON.stringify({
          version: 2,
          cells: [["x"]],
        }),
      }),
    ),
  ).toThrow();
  expect(() =>
    parseTableClipboard(
      data({ "text/html": '<table><tr><td colspan="101">a</td></tr></table>' }),
    ),
  ).toThrow();
});
it('keeps whitelisted whole-cell HTML styles across clipboard exchange',()=>{
  const value:TableClipboard={version:1,cells:[['样式']],cellStyles:[[{bold:true,underline:true,fontSize:20,color:'#d83931',backgroundColor:'#fff3b0',align:'center',verticalAlign:'bottom'}]]};
  const parsed=parseTableClipboard(data({'text/html':tableClipboardHtml(value)}));
  expect(parsed.cellStyles?.[0][0]).toMatchObject(value.cellStyles![0][0]);
});
