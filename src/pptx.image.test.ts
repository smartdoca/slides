import { expect, it } from "vitest";
import JSZip from "jszip";
import { createPresentation } from "./model/create";
import { exportPptx, importPptx } from "./pptx";
import { pxToEmu, type ImageElement } from "./model/types";
const png =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jC1EAAAAASUVORK5CYII=";
it("writes native image crop, mirror and opacity and retains them on reimport", async () => {
  const model = createPresentation(),
    slide = model.slides[model.slideOrder[0]];
  const pic: ImageElement = {
    id: "image",
    type: "image",
    assetId: "asset",
    crop: [0.2, 0.1, 0.3, 0.15],
    opacity: 0.6,
    transform: {
      x: pxToEmu(180),
      y: pxToEmu(160),
      width: pxToEmu(400),
      height: pxToEmu(240),
      rotation: 28,
      flipH: true,
      flipV: true,
    },
  };
  slide.elements[pic.id] = pic;
  slide.elementOrder.push(pic.id);
  const out = await exportPptx(model, async () => png),
    zip = await JSZip.loadAsync(await out.blob.arrayBuffer());
  const xml = await zip.file("ppt/slides/slide1.xml")!.async("string");
  expect(xml).toContain('l="20000" r="30000" t="10000" b="15000"');
  const result = await importPptx(await out.blob.arrayBuffer()),
    view = result.document.slides[result.document.slideOrder[0]];
  const actual = Object.values(view.elements).find(
    (e) => e.type === "image",
  ) as ImageElement;
  expect(actual.crop).toEqual(pic.crop);
  expect(actual.opacity).toBe(0.6);
  expect(actual.transform).toMatchObject({
    width: pic.transform.width,
    height: pic.transform.height,
    rotation: 28,
    flipH: true,
    flipV: true,
  });
  expect(Math.abs(actual.transform.x - pic.transform.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(actual.transform.y - pic.transform.y)).toBeLessThanOrEqual(1);
  expect(
    result.issues.some(
      (i) => i.message.includes("图片裁剪") || i.message.includes("镜像"),
    ),
  ).toBe(false);
});
it("preserves text-box vertical alignment through OOXML", async () => {
  for (const align of ["top", "middle", "bottom"] as const) {
    const model = createPresentation(),
      s = model.slides[model.slideOrder[0]],
      el = s.elements[s.elementOrder[0]];
    if (el.type !== "text") throw Error("fixture");
    el.verticalAlign = align;
    const result = await importPptx(
      await (await exportPptx(model)).blob.arrayBuffer(),
    );
    const view = result.document.slides[result.document.slideOrder[0]];
    expect(view.elements[view.elementOrder[0]]).toMatchObject({
      verticalAlign: align,
    });
  }
});
