import { mkdirSync, writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import {
  createPresentation,
  createTextElement,
  createYDocument,
  readDocument,
  EditorController,
  SlidePreviewStore,
  pxToEmu,
} from "../dist/core.js";
import { exportPptx, importPptx } from "../dist/pptx.js";
import JSZip from "jszip";
const out = new URL("../docs/fixtures/", import.meta.url);
mkdirSync(out, { recursive: true });
function crc(b) {
  let c = 0xffffffff;
  for (const n of b) {
    c ^= n;
    for (let i = 0; i < 8; i++) c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
  }
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(name, data) {
  const type = Buffer.from(name),
    size = Buffer.alloc(4),
    sum = Buffer.alloc(4);
  size.writeUInt32BE(data.length);
  sum.writeUInt32BE(crc(Buffer.concat([type, data])));
  return Buffer.concat([size, type, data, sum]);
}
const header = Buffer.alloc(13);
header.writeUInt32BE(64, 0);
header.writeUInt32BE(32, 4);
header[8] = 8;
header[9] = 2;
const pixels = Buffer.alloc(32 * (1 + 64 * 3));
for (let y = 0; y < 32; y++)
  for (let x = 0; x < 64; x++) {
    const i = y * 193 + 1 + x * 3;
    pixels.set(x < 32 ? [54, 93, 234] : [255, 180, 60], i);
  }
const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk("IHDR", header),
  chunk("IDAT", deflateSync(pixels)),
  chunk("IEND", Buffer.alloc(0)),
]);
writeFileSync(new URL("sample.png", out), png);
const model = createPresentation();
model.title = "交付夹具 · 中文与 4比3";
model.size = { width: pxToEmu(960), height: pxToEmu(720) };
const doc = createYDocument(model),
  c = new EditorController(doc),
  s = readDocument(doc).slideOrder[0],
  title = readDocument(doc).slides[s].elementOrder[0];
c.patch(s, title, {
  transform: {
    x: pxToEmu(70),
    y: pxToEmu(65),
    width: pxToEmu(810),
    height: pxToEmu(80),
  },
});
c.formatText(s, [title], { fontSize: 32, color: "#365dea" });
const text = createTextElement("不同字号与中文换行\n第二行内容需要保留");
text.transform = {
  x: pxToEmu(70),
  y: pxToEmu(165),
  width: pxToEmu(600),
  height: pxToEmu(95),
  rotation: 0,
};
text.paragraphs[0].children = [
  { text: "不同字号与中文换行\n", fontSize: 24, bold: true },
  { text: "第二行内容需要保留", fontSize: 16 },
];
c.insert(s, text);
const a = c.add(s, "rect"),
  b = c.add(s, "ellipse");
c.patch(s, a, {
  transform: {
    x: pxToEmu(70),
    y: pxToEmu(350),
    width: pxToEmu(180),
    height: pxToEmu(150),
  },
});
c.patch(s, b, {
  transform: {
    x: pxToEmu(285),
    y: pxToEmu(350),
    width: pxToEmu(150),
    height: pxToEmu(150),
  },
  fill: "#ffb43c",
});
c.group(s, [a, b]);
c.insert(s, {
  id: "fixture-image",
  type: "image",
  assetId: "fixture-stable-asset",
  alt: "蓝黄双色测试图片",
  transform: {
    x: pxToEmu(535),
    y: pxToEmu(350),
    width: pxToEmu(320),
    height: pxToEmu(160),
    rotation: 0,
  },
});
c.slideProperty(s, "notes", "备注与资源 ID 往返");
const second = c.addSlide(s, readDocument(doc).slides[s]);
c.slideProperty(second, "background", "#eef2ff");
const asset = async () => `data:image/png;base64,${png.toString("base64")}`;
const exported = await exportPptx(readDocument(doc), asset);
writeFileSync(
  new URL("basic-4x3.pptx", out),
  Buffer.from(await exported.blob.arrayBuffer()),
);
const parsed = await importPptx(await exported.blob.arrayBuffer());
const again = await exportPptx(parsed.document, async (id) => {
  const r = parsed.assets.find((a) => a.id === id);
  return `data:${r.mime};base64,${Buffer.from(r.bytes).toString("base64")}`;
});
writeFileSync(
  new URL("basic-4x3-roundtrip.pptx", out),
  Buffer.from(await again.blob.arrayBuffer()),
);
// Add a genuine DrawingML group to a separate negative/degradation fixture.
const zip = await JSZip.loadAsync(await exported.blob.arrayBuffer());
const name = "ppt/slides/slide1.xml";
let xml = await zip.file(name).async("string");
const shapes = [...xml.matchAll(/<p:sp>.*?<\/p:sp>/gs)]
  .map((m) => m[0])
  .filter((x) => !x.includes("<p:txBody>"))
  .slice(0, 2);
if (shapes.length !== 2) throw Error("group fixture shapes");
const group = `<p:grpSp><p:nvGrpSpPr><p:cNvPr id="990" name="native group"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="9144000" cy="6858000"/><a:chOff x="0" y="0"/><a:chExt cx="9144000" cy="6858000"/></a:xfrm></p:grpSpPr>${shapes.join("")}</p:grpSp>`;
for (const shape of shapes) xml = xml.replace(shape, "");
zip.file(name, xml.replace("</p:spTree>", group + "</p:spTree>"));
writeFileSync(
  new URL("native-group-unsupported.pptx", out),
  await zip.generateAsync({ type: "nodebuffer" }),
);
console.log("Fixture result:", {
  slides: parsed.document.slideOrder.length,
  assets: parsed.assets.length,
  warnings: exported.warnings.map((w) => w.message),
});
c.dispose();
doc.destroy();
for (const pages of [10, 100]) {
  const value = createPresentation(),
    template = value.slides[value.slideOrder[0]];
  value.slideOrder = [];
  value.slides = {};
  for (let i = 0; i < pages; i++) {
    const id = "bench-slide-" + i,
      slide = {
        ...structuredClone(template),
        id,
        elementOrder: [],
        elements: {},
      };
    for (let j = 0; j < 20; j++) {
      const text = createTextElement("中文基准测试 " + i + " / " + j);
      slide.elementOrder.push(text.id);
      slide.elements[text.id] = text;
    }
    value.slideOrder.push(id);
    value.slides[id] = slide;
  }
  const before = process.memoryUsage().heapUsed,
    t = performance.now(),
    doc = createYDocument(value),
    loaded = performance.now(),
    store = new SlidePreviewStore(doc),
    cached = performance.now();
  for (const id of value.slideOrder) store.getSnapshot(id);
  const end = performance.now();
  console.log(
    "Node benchmark (not browser):",
    JSON.stringify({
      pages,
      elements: pages * 20,
      initializeMs: Math.round(loaded - t),
      cacheBuildMs: Math.round(cached - loaded),
      allSnapshotsMs: Math.round(end - cached),
      heapDeltaMiB: +(
        (process.memoryUsage().heapUsed - before) /
        1048576
      ).toFixed(1),
    }),
  );
  store.dispose();
  doc.destroy();
}
