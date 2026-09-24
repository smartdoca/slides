import { expect, it } from "vitest";
import JSZip from "jszip";
import { importPptx } from "./pptx";

// Hand-authored OOXML: do not rely only on our own exporter as the oracle.
async function fixture(objects: string) {
  const zip = new JSZip();
  zip.file(
    "ppt/presentation.xml",
    '<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:sldIdLst><p:sldId id="256" r:id="rId1"/></p:sldIdLst></p:presentation>',
  );
  zip.file(
    "ppt/_rels/presentation.xml.rels",
    '<Relationships><Relationship Id="rId1" Target="slides/slide1.xml"/></Relationships>',
  );
  zip.file(
    "ppt/slides/slide1.xml",
    `<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:cSld><p:spTree>${objects}</p:spTree></p:cSld></p:sld>`,
  );
  return importPptx(await zip.generateAsync({ type: "uint8array" }));
}
const xfrm =
  '<a:xfrm><a:off x="100" y="200"/><a:ext cx="900000" cy="600000"/></a:xfrm>';
const shape = (id: number, name: string) =>
  `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${name}"/></p:nvSpPr><p:spPr>${xfrm}<a:prstGeom prst="rect"/></p:spPr></p:sp>`;
const line = `<p:cxnSp><p:nvCxnSpPr><p:cNvPr id="2" name="middle-line"/></p:nvCxnSpPr><p:spPr>${xfrm}<a:prstGeom prst="line"/><a:ln w="19050"><a:tailEnd type="triangle"/></a:ln></p:spPr></p:cxnSp>`;

it("preserves interleaved source stacking order rather than regrouping object types", async () => {
  const { document } = await fixture(
    shape(1, "back") + line + shape(3, "front"),
  );
  const slide = document.slides[document.slideOrder[0]];
  expect(slide.elementOrder.map((id) => slide.elements[id].type)).toEqual([
    "shape",
    "line",
    "shape",
  ]);
  expect(slide.elementOrder.map((id) => slide.elements[id].name)).toEqual([
    "back",
    "middle-line",
    "front",
  ]);
});

it("reads preset lines as lines and preserves supported end arrows", async () => {
  const { document } = await fixture(
    line + shape(3, "preset-line").replace('prst="rect"', 'prst="line"'),
  );
  const slide = document.slides[document.slideOrder[0]];
  expect(slide.elements[slide.elementOrder[0]]).toMatchObject({
    type: "line",
    arrow: true,
  });
  expect(slide.elements[slide.elementOrder[1]]).toMatchObject({ type: "line" });
});

it("retains run, soft-break and field order inside one paragraph", async () => {
  const xml = shape(1, "text").replace(
    "</p:sp>",
    '<p:txBody><a:bodyPr/><a:p><a:pPr><a:defRPr b="1" sz="3200"/></a:pPr><a:r><a:t>Before</a:t></a:r><a:br/><a:fld id="field-1" type="slidenum"><a:t>3</a:t></a:fld><a:r><a:rPr b="0"/><a:t>After</a:t></a:r></a:p></p:txBody></p:sp>',
  );
  const { document, issues } = await fixture(xml);
  const slide = document.slides[document.slideOrder[0]],
    text = slide.elements[slide.elementOrder[0]];
  if (text.type !== "text") throw new Error("Expected text");
  expect(text.paragraphs[0].children.map((leaf) => leaf.text).join("")).toBe(
    "Before\n3After",
  );
  expect(text.paragraphs[0].children[0]).toMatchObject({
    bold: true,
    fontSize: 32,
  });
  expect(text.paragraphs[0].children.at(-1)?.bold).not.toBe(true);
  expect(issues.some((issue) => issue.message.includes("动态文本域"))).toBe(
    true,
  );
});
