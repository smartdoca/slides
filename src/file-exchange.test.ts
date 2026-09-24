import { expect, it } from "vitest";
import * as Y from "yjs";
import {
  validatePptxFile,
  pptxFilename,
  PPTX_MAX_BYTES,
} from "./file-exchange";
import { exportPptx, importPptx } from "./pptx";
import { createYDocument, readDocument } from "./collaboration/yjs-codec";
import { createPresentation } from "./model/create";
import JSZip from "jszip";
import { EditorController } from "./model/controller";
it("accepts pptx filenames, refuses empty/oversized/wrong types and sanitizes download names", () => {
  expect(() =>
    validatePptxFile({ name: "季度报告.PPTX", size: 128 }),
  ).not.toThrow();
  for (const f of [
    { name: "a.ppt", size: 128 },
    { name: "a.json", size: 128 },
    { name: "a.pptx", size: 0 },
    { name: "a.pptx", size: PPTX_MAX_BYTES + 1 },
  ])
    expect(() => validatePptxFile(f)).toThrow();
  expect(pptxFilename("季度/汇报.pptx")).toBe("季度_汇报.pptx");
  expect(pptxFilename("   ")).toBe("演示文稿.pptx");
});
it("reports corrupt and oversized real file input without initializing a document", async () => {
  await expect(importPptx(new Uint8Array([1, 2, 3]))).rejects.toThrow(
    "文件损坏",
  );
  await expect(importPptx(new Uint8Array(PPTX_MAX_BYTES + 1))).rejects.toThrow(
    "30 MB",
  );
});
it("exports without document transactions and reopens as independently editable content", async () => {
  const doc = createYDocument(createPresentation()),
    before = Y.encodeStateAsUpdate(doc);
  let writes = 0;
  doc.on("update", () => writes++);
  const output = await exportPptx(readDocument(doc));
  expect(output.blob.type).toContain("presentationml.presentation");
  const imported = await importPptx(await output.blob.arrayBuffer());
  expect(imported.document.slideOrder).toHaveLength(1);
  expect(imported.document.id).not.toBe(readDocument(doc).id);
  expect(writes).toBe(0);
  expect(Y.encodeStateAsUpdate(doc)).toEqual(before);
  doc.destroy();
});
it("captures export before asynchronous asset reads and returns named structured output", async () => {
  const doc = createYDocument(createPresentation()),
    c = new EditorController(doc),
    s = readDocument(doc).slideOrder[0];
  c.insert(s, {
    id: "test-image",
    type: "image",
    assetId: "stable-image",
    transform: { x: 0, y: 0, width: 914400, height: 914400, rotation: 0 },
  });
  c.addSlide();
  const model = readDocument(doc),
    original = model.title;
  let release!: () => void;
  const wait = new Promise<void>((r) => (release = r));
  const task = exportPptx(model, async () => {
    await wait;
    return "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j6hkAAAAASUVORK5CYII=";
  });
  model.title = "不得混入";
  model.slideOrder.pop();
  release();
  const result = await task,
    reopened = await importPptx(await result.blob.arrayBuffer());
  expect(result.filename).toBe(original + ".pptx");
  expect(result.mime).toBe(result.blob.type);
  expect(result.warnings).toBe(result.issues);
  expect(reopened.document.slideOrder).toHaveLength(2);
  c.dispose();
  doc.destroy();
});
it("rejects oversized declared decompression before reading payload", async () => {
  const zip = new JSZip();
  zip.file("ppt/presentation.xml", "<presentation/>");
  const bytes = await zip.generateAsync({ type: "uint8array" }),
    v = new DataView(bytes.buffer);
  for (let i = 0; i < bytes.length - 46; i++)
    if (v.getUint32(i, true) === 0x02014b50) {
      v.setUint32(i + 24, 61 * 1024 * 1024, true);
      break;
    }
  await expect(importPptx(bytes)).rejects.toThrow("60 MB");
});
