import { expect, it } from "vitest";
import { createPresentation } from "./model/create";
import { createYDocument, readDocument } from "./collaboration/yjs-codec";
import { EditorController } from "./model/controller";
import { SHAPES } from "./model/shapes";
import { exportPptx, importPptx } from "./pptx";
function setup() {
  const d = createYDocument(createPresentation()),
    c = new EditorController(d),
    s = readDocument(d).slideOrder[0];
  return { d, c, s };
}
async function roundtrip(d: ReturnType<typeof createYDocument>) {
  const out = await exportPptx(readDocument(d), async () => "");
  const result = await importPptx(await out.blob.arrayBuffer());
  return {
    out,
    result,
    els: Object.values(
      result.document.slides[result.document.slideOrder[0]].elements,
    ),
  };
}
it("roundtrips all 25 native shape presets", async () => {
  const { d, c, s } = setup();
  for (const shape of SHAPES) c.add(s, shape.id);
  const { els } = await roundtrip(d);
  expect(
    els
      .filter((e) => e.type === "shape")
      .map((e) => e.type === "shape" && e.shape),
  ).toEqual(SHAPES.map((s) => s.id));
  c.dispose();
});
it("roundtrips text foreground, highlight and full-frame background", async () => {
  const { d, c, s } = setup(),
    id = readDocument(d).slides[s].elementOrder[0];
  c.formatText(s, [id], { color: "#ef4444", backgroundColor: "#fde047" });
  c.patch(s, id, { background: "#fef3c7" });
  const { els } = await roundtrip(d);
  expect(els[0]).toMatchObject({
    type: "text",
    background: "#fef3c7",
    paragraphs: [
      { children: [{ color: "#ef4444", backgroundColor: "#fde047" }] },
    ],
  });
  c.dispose();
});
it.each(["none", "stacked", "percent"] as const)(
  "roundtrips named multi-series charts with %s grouping",
  async (stacking) => {
    const { d, c, s } = setup(),
      id = c.add(s, "chart", "bar");
    const series = [
      { name: "收入", values: [32, 54, 46, 78], color: "#527eff" },
      { name: "成本", values: [18, 20, 26, 37], color: "#ff8a24" },
    ];
    c.patch(s, id, {
      series,
      stacking,
      title: "经营对比",
      showLegend: true,
      showLabels: true,
    });
    const { els } = await roundtrip(d);
    expect(els.find((e) => e.type === "chart")).toMatchObject({
      series,
      stacking,
      title: "经营对比",
      showLegend: true,
      showLabels: true,
    });
    c.dispose();
  },
);
it("preserves smooth lines and reports the step-line export downgrade", async () => {
  const { d, c, s } = setup(),
    id = c.add(s, "chart", "line");
  c.patch(s, id, { curve: "smooth" });
  expect(
    (await roundtrip(d)).els.find((e) => e.type === "chart"),
  ).toMatchObject({ curve: "smooth" });
  c.patch(s, id, { curve: "step" });
  expect(
    (await roundtrip(d)).out.issues.some((i) => i.message.includes("阶梯")),
  ).toBe(true);
  c.dispose();
});
