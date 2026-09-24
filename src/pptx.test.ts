import { it, expect } from "vitest";
import JSZip from "jszip";
import { createPresentation } from "./model/create";
import { createYDocument, readDocument } from "./collaboration/yjs-codec";
import { EditorController } from "./model/controller";
import { exportPptx, importPptx } from "./pptx";

it("exports editable text, shapes, tables, charts and notes in real OOXML parts", async () => {
  const doc = createYDocument(createPresentation()),
    controller = new EditorController(doc),
    slide = readDocument(doc).slideOrder[0];
  controller.add(slide, "rect");
  controller.add(slide, "ellipse");
  controller.add(slide, "line");
  controller.add(slide, "table");
  controller.add(slide, "chart");
  controller.add(slide, "triangle");
  controller.slideProperty(slide, "notes", "演讲者备注测试");
  const exported = await exportPptx(readDocument(doc)),
    zip = await JSZip.loadAsync(await exported.blob.arrayBuffer());
  const slideXml = await zip.file("ppt/slides/slide1.xml")!.async("string");
  expect(slideXml).toContain("EPPT 协同演示文稿");
  expect(slideXml).toContain("<a:tbl>");
  expect(slideXml).toContain("c:chart");
  expect(zip.file("ppt/charts/chart1.xml")).not.toBeNull();
  expect(
    await zip.file("ppt/notesSlides/notesSlide1.xml")!.async("string"),
  ).toContain("演讲者备注测试");
  const result = await importPptx(await exported.blob.arrayBuffer());
  expect(result.document.slideOrder).toHaveLength(1);
  const imported = result.document.slides[result.document.slideOrder[0]];
  const original = readDocument(doc).slides[slide];
  expect(imported.elementOrder.map(id => imported.elements[id].type)).toEqual(
    original.elementOrder.map(id => original.elements[id].type),
  );
  expect(
    Object.values(imported.elements).some(
      (e) =>
        e.type === "text" &&
        JSON.stringify(e.paragraphs).includes("EPPT 协同演示文稿"),
    ),
  ).toBe(true);
  expect(imported.notes).toContain("演讲者备注测试");
  expect(
    Object.values(imported.elements).find((e) => e.type === "chart"),
  ).toMatchObject({
    chartType: "bar",
    labels: ["第一季", "第二季", "第三季", "第四季"],
    values: [32, 54, 46, 78],
  });
  expect(result.issues.some((i) => i.message.includes("图表"))).toBe(true);
});
it("maps rotation origins between Canvas and OOXML without drifting on roundtrip", async () => {
  const model = createPresentation(),
    slide = model.slides[model.slideOrder[0]],
    el = slide.elements[slide.elementOrder[0]];
  el.transform.rotation = 32;
  const result = await importPptx(
    await (await exportPptx(model)).blob.arrayBuffer(),
  );
  const actual = Object.values(
    result.document.slides[result.document.slideOrder[0]].elements,
  )[0].transform;
  expect(Math.abs(actual.x - el.transform.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(actual.y - el.transform.y)).toBeLessThanOrEqual(1);
  expect(actual.rotation).toBe(32);
});
it("retains text formatting and dimensions through export/import", async () => {
  const model = createPresentation(),
    slide = model.slides[model.slideOrder[0]],
    text = slide.elements[slide.elementOrder[0]];
  if (text.type !== "text") throw new Error("fixture");
  text.paragraphs = [
    {
      type: "paragraph",
      children: [
        {
          text: "Hello 中文",
          bold: true,
          italic: true,
          color: "#ab1234",
          fontSize: 36,
        },
      ],
    },
  ];
  const exported = await exportPptx(model),
    imported = await importPptx(await exported.blob.arrayBuffer());
  expect(imported.document.size).toEqual(model.size);
  const view = imported.document.slides[imported.document.slideOrder[0]],
    el = Object.values(view.elements)[0];
  expect(el.type).toBe("text");
  if (el.type === "text") {
    expect(el.paragraphs[0].children[0]).toMatchObject({
      text: "Hello 中文",
      bold: true,
      italic: true,
      color: "#ab1234",
      fontSize: 36,
    });
    expect(el.transform.x).toBe(text.transform.x);
  }
});
