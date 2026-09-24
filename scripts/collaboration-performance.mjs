// Run against a built or installed core entry, never against a user's document.
import { pathToFileURL } from "node:url";
import { performance } from "node:perf_hooks";
import { createRequire } from "node:module";
const entry = pathToFileURL(process.argv[2] ?? `${process.cwd()}/dist/core.js`);
const Y = await import(
  pathToFileURL(
    createRequire(entry)
      .resolve("yjs")
      .replace(/\.cjs$/, ".mjs"),
  )
);
const core = await import(entry);
const {
  createPresentation,
  createTextElement,
  createYDocument,
  SlidePreviewStore,
  EditorController,
  readDocument,
} = core;
const percentile = (values, p) =>
  +[...values]
    .sort((a, b) => a - b)
    [Math.floor((values.length - 1) * p)].toFixed(2);
for (const [pages, perPage] of [
  [100, 100],
  [500, 20],
]) {
  const model = createPresentation();
  model.slideOrder = [];
  model.slides = {};
  for (let i = 0; i < pages; i++) {
    const id = `perf-slide-${i}`,
      slide = { id, background: "#fff", elementOrder: [], elements: {} };
    for (let j = 0; j < perPage; j++) {
      const el = createTextElement(
        `中文协同测试 第 ${i} 页 第 ${j} 个文本框\n连续编辑保留对象身份`,
      );
      slide.elementOrder.push(el.id);
      slide.elements[el.id] = el;
    }
    model.slideOrder.push(id);
    model.slides[id] = slide;
  }
  const heap = process.memoryUsage().heapUsed,
    start = performance.now();
  const a = createYDocument(model),
    b = new Y.Doc();
  Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
  const stores = [new SlidePreviewStore(a), new SlidePreviewStore(b)];
  const load = performance.now() - start;
  const ca = new EditorController(a),
    cb = new EditorController(b);
  let updates = 0,
    bytes = 0;
  a.on("update", (update, origin) => {
    if (origin === "remote") return;
    updates++;
    bytes += update.byteLength;
    Y.applyUpdate(b, update, "remote");
  });
  b.on("update", (update, origin) => {
    if (origin === "remote") return;
    updates++;
    bytes += update.byteLength;
    Y.applyUpdate(a, update, "remote");
  });
  const durations = [];
  for (let i = 0; i < 80; i++) {
    const slide = model.slideOrder[i % 2 ? pages - 1 : 0],
      id = model.slides[slide].elementOrder[0];
    const t = performance.now();
    (i % 2 ? ca : cb).patch(slide, id, {
      fill: `#${(0x123400 + i).toString(16)}`,
    });
    durations.push(performance.now() - t);
  }
  if (JSON.stringify(readDocument(a)) !== JSON.stringify(readDocument(b)))
    throw Error("Diverged");
  console.log(
    JSON.stringify({
      pages,
      elements: pages * perPage,
      loadMs: +load.toFixed(1),
      editMedianMs: percentile(durations, 0.5),
      editP95Ms: percentile(durations, 0.95),
      editMaxMs: Math.max(...durations).toFixed(2),
      updates,
      bytes,
      heapDeltaMiB: +(
        (process.memoryUsage().heapUsed - heap) /
        1048576
      ).toFixed(1),
      scope:
        "Node two Y.Doc peers, synchronous in-memory transport, not durable server ACK or browser paint",
    }),
  );
  stores.forEach((s) => s.dispose());
  ca.dispose();
  cb.dispose();
  a.destroy();
  b.destroy();
}
