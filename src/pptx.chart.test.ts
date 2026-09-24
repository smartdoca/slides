import { expect, it } from "vitest";
import { createPresentation } from "./model/create";
import { EditorController } from "./model/controller";
import { createYDocument, readDocument } from "./collaboration/yjs-codec";
import { exportPptx, importPptx } from "./pptx";
import { validateDocument } from "./model/validate";
it.each(["bar", "line", "pie", "doughnut"] as const)(
  "roundtrips native editable %s charts and undoable insertion",
  async (kind) => {
    const doc = createYDocument(createPresentation()),
      c = new EditorController(doc),
      s = readDocument(doc).slideOrder[0];
    const id = c.add(s, "chart", kind);
    c.undo();
    expect(readDocument(doc).slides[s].elements[id]).toBeUndefined();
    c.redo();
    const out = await exportPptx(readDocument(doc), async () => "");
    const imported = await importPptx(await out.blob.arrayBuffer());
    const chart = Object.values(
      imported.document.slides[imported.document.slideOrder[0]].elements,
    ).find((el) => el.type === "chart");
    expect(chart).toMatchObject({
      chartType: kind,
      labels: ["第一季", "第二季", "第三季", "第四季"],
      values: [32, 54, 46, 78],
    });
    expect(imported.issues.filter((issue) => issue.slideId)).toEqual([]);
    c.dispose();
  },
);
it("rejects invalid circular data and unknown types without modifying the chart", () => {
  const doc = createYDocument(createPresentation()),
    c = new EditorController(doc),
    s = readDocument(doc).slideOrder[0],
    id = c.add(s, "chart", "pie");
  const initial = readDocument(doc);
  c.patch(s, id, { values: [-1, 2, 3, 4] });
  c.patch(s, id, { chartType: "unknown" });
  c.patch(s, id, { values: [0, 0, 0, 0] });
  expect(readDocument(doc)).toEqual(initial);
  c.setReadOnly(true);
  c.patch(s, id, { chartType: "bar" });
  expect(readDocument(doc)).toEqual(initial);
  validateDocument(initial);
  c.dispose();
});
