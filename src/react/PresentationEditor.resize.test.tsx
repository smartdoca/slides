// @vitest-environment jsdom
import { act, createRef } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import * as Y from "yjs";
import { createPresentation } from "../model/create";
import { createYDocument, readDocument } from "../collaboration/yjs-codec";
import { EditorController } from "../model/controller";
import { pxToEmu, type ImageElement } from "../model/types";
import type { PresentationImagePreviewHandler } from "../model/image-preview";
import { REMOTE_ORIGIN } from "../collaboration/origins";
import {
  PresentationEditor,
  type PresentationEditorHandle,
} from "./PresentationEditor";

const engine = vi.hoisted(() => {
  class Events {
    handlers = new Map<string, () => void>();
    on(name: string, handler: () => void) {
      this.handlers.set(name, handler);
    }
    emit(name: string) {
      this.handlers.get(name)?.();
    }
  }
  class Node extends Events {
    [key: string]: any;
    constructor(data: object) {
      super();
      Object.assign(this, data);
    }
    set(data: object) {
      Object.assign(this, data);
    }
    destroy() {}
  }
  class Editor extends Events {
    target: Node[] = [];
    get list() {
      return this.target;
    }
  }
  let instance: App;
  class App extends Events {
    editor = new Editor();
    nodes: Node[] = [];
    tree = {
      add: (node: Node) => {
        this.nodes.push(node);
      },
    };
    constructor(public config: any) {
      super();
      instance = this;
    }
    destroy() {}
  }
  return { App, Node, get: () => instance };
});
vi.mock("leafer-ui", () => ({
  App: engine.App,
  Rect: engine.Node,
  Ellipse: engine.Node,
  Path: engine.Node,
  Image: class extends engine.Node {},
  PointerEvent: { TAP: "tap", DOUBLE_TAP: "double" },
  DragEvent: { START: "start", END: "end" },
}));
vi.mock("@leafer-in/editor", () => ({
  EditorEvent: { SELECT: "select" },
  EditorMoveEvent: { MOVE: "move" },
  EditorScaleEvent: { SCALE: "scale" },
}));
vi.mock("@leafer-in/resize", () => ({}));
vi.mock("@leafer-in/export", () => ({}));

afterEach(() => {
  vi.unstubAllGlobals();
});

it("reflows live resize at most once per frame, preserves fonts, commits once and survives undo/reload", async () => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  let frame: FrameRequestCallback | undefined;
  const raf = vi.fn((callback: FrameRequestCallback) => {
    frame = callback;
    return 1;
  });
  vi.stubGlobal("requestAnimationFrame", raf);
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  const doc = createYDocument(createPresentation());
  const controller = new EditorController(doc);
  const original = readDocument(doc),
    slideId = original.slideOrder[0];
  const id = original.slides[slideId].elementOrder[0];
  const element = original.slides[slideId].elements[id];
  const updates = vi.fn();
  doc.on("update", updates);
  const host = document.createElement("div"),
    root = createRoot(host);
  const ref = createRef<PresentationEditorHandle>();
  try {
    act(() =>
      root.render(
        <PresentationEditor
          ref={ref}
          document={doc}
          controller={controller}
          slideId={slideId}
          selectedIds={[id]}
        />,
      ),
    );
    const app = engine.get(),
      node = app.editor.list[0];
    expect(app.config.move).toMatchObject({
      disabled: true,
      dragOut: false,
      scroll: false,
    });
    expect(app.config.zoom.disabled).toBe(true);
    expect(app.config.wheel).toEqual({ disabled: true, preventDefault: false });
    expect(host.querySelector<HTMLElement>(".eppt-slide")!.style.overflow).toBe(
      "clip",
    );
    expect(node.editConfig).toEqual({ editSize: "size", flipable: false });
    const initialPaint = node.fill;
    act(() => app.emit("start"));
    node.width = 300;
    app.editor.emit("scale");
    node.width = 180;
    node.height = 170;
    app.editor.emit("scale");
    expect(raf).toHaveBeenCalledTimes(1);
    // Even before reflow, the original paint keeps its intrinsic size, never stretch.
    expect(initialPaint.mode).toBe("clip");
    expect(initialPaint.size).toEqual({ width: 480, height: 96 });
    act(() => frame?.(0));
    expect(node.fill.size).toEqual({ width: 180, height: 170 });
    const svg = decodeURIComponent(node.fill.url.split(",")[1]);
    expect(svg).toContain('width="180" height="170"');
    expect(svg).toContain("font-size:32px");
    expect(svg).toContain("EPPT 协同演示文稿");
    expect(svg).not.toContain("scale(");
    expect(svg).toContain("overflow-wrap:break-word");
    expect(updates).not.toHaveBeenCalled();
    expect(ref.current!.getElementTransform(id)).toMatchObject({
      width: pxToEmu(180),
      height: pxToEmu(170),
    });
    expect(updates).not.toHaveBeenCalled();
    expect(readDocument(doc)).toEqual(original);
    await act(async () => {
      app.emit("end");
      await Promise.resolve();
    });
    expect(updates).toHaveBeenCalledTimes(1);
    const resized = readDocument(doc).slides[slideId].elements[id];
    expect(resized).toEqual({
      ...element,
      transform: {
        ...element.transform,
        width: pxToEmu(180),
        height: pxToEmu(170),
      },
    });
    act(() => controller.undo());
    expect(readDocument(doc)).toEqual(original);
    expect(node.fill.size).toEqual({ width: 480, height: 96 });
    act(() => controller.redo());
    const checkpoint = new Y.Doc();
    Y.applyUpdate(checkpoint, Y.encodeStateAsUpdate(doc));
    expect(readDocument(checkpoint).slides[slideId].elements[id]).toEqual(
      resized,
    );
    checkpoint.destroy();
    // Moving a text box must neither change its dimensions nor rerasterize it.
    const paint = node.fill;
    updates.mockClear();
    act(() => app.emit("start"));
    node.x += 30;
    await act(async () => {
      app.emit("end");
      await Promise.resolve();
    });
    expect(updates).toHaveBeenCalledTimes(1);
    expect(node.fill).toBe(paint);
    expect(node.fill.size).toEqual(paint.size);
    expect(node.fill.url).toBe(paint.url);
    const moved = readDocument(doc).slides[slideId].elements[id];
    expect(moved.transform.width).toBe(resized.transform.width);
    expect(moved.transform.height).toBe(resized.transform.height);
  } finally {
    act(() => root.unmount());
    controller.dispose();
    doc.destroy();
  }
});

it("cancels pending resize paints when the editor is disposed", () => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal(
    "requestAnimationFrame",
    vi.fn(() => 42),
  );
  const cancel = vi.fn();
  vi.stubGlobal("cancelAnimationFrame", cancel);
  const doc = createYDocument(createPresentation()),
    root = createRoot(document.createElement("div"));
  act(() => root.render(<PresentationEditor document={doc} />));
  engine.get().editor.emit("scale");
  act(() => root.unmount());
  expect(cancel).toHaveBeenCalledWith(42);
  doc.destroy();
});

it("keeps a fixed page for off-page content and local zoom without rewriting the document", () => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  const doc = createYDocument(createPresentation()),
    controller = new EditorController(doc);
  const slideId = readDocument(doc).slideOrder[0],
    id = readDocument(doc).slides[slideId].elementOrder[0];
  controller.patch(slideId, id, {
    transform: { x: pxToEmu(5000), y: pxToEmu(-400) },
  });
  const original = readDocument(doc),
    updates = vi.fn();
  doc.on("update", updates);
  const host = document.createElement("div"),
    root = createRoot(host);
  try {
    for (const scale of [0.5, 1, 2]) {
      act(() =>
        root.render(
          <PresentationEditor
            document={doc}
            controller={controller}
            viewScale={scale}
          />,
        ),
      );
      const slide = host.querySelector<HTMLElement>(".eppt-slide")!;
      expect(slide.style.width).toBe("1280px");
      expect(slide.style.height).toBe("720px");
      expect(slide.style.overflow).toBe("clip");
    }
    expect(readDocument(doc)).toEqual(original);
    expect(updates).not.toHaveBeenCalled();
  } finally {
    act(() => root.unmount());
    controller.dispose();
    doc.destroy();
  }
});

it("selects an image first, previews the next click with all-slide stable references, and uses the latest host callback", async () => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  const doc = createYDocument(createPresentation()),
    controller = new EditorController(doc),
    sid = readDocument(doc).slideOrder[0],
    nextSlide = controller.addSlide();
  const image = (id: string): ImageElement => ({
    id,
    type: "image",
    assetId: "asset-" + id,
    transform: {
      x: 0,
      y: 0,
      width: pxToEmu(300),
      height: pxToEmu(200),
      rotation: 0,
    },
  });
  controller.insert(sid, image("first"));
  controller.insert(nextSlide, image("next"));
  controller.history.clear();
  const original = readDocument(doc),
    writes = vi.fn(),
    selection = vi.fn(),
    first = vi.fn(),
    second = vi.fn(),
    error = vi.fn();
  doc.on("update", writes);
  const host = document.createElement("div"),
    root = createRoot(host);
  document.body.append(host);
  const render = (
    ids: string[],
    callback: PresentationImagePreviewHandler = first,
    mode: "edit" | "readonly" = "edit",
  ) =>
    act(() =>
      root.render(
        <PresentationEditor
          document={doc}
          controller={controller}
          slideId={sid}
          selectedIds={ids}
          mode={mode}
          onImagePreview={callback}
          onSelectionChange={selection}
          onError={error}
        />,
      ),
    );
  const down = (shiftKey = false) =>
    act(() =>
      host
        .querySelector(".eppt-slide")!
        .dispatchEvent(
          new MouseEvent("pointerdown", { bubbles: true, shiftKey }),
        ),
    );
  try {
    render([]);
    const app = engine.get(),
      node = app.nodes.find((node) => node.id === "first")!;
    down();
    app.editor.target = [node];
    render(["first"]); // Native selection happens before the tap callback.
    act(() => node.emit("tap"));
    expect(first).not.toHaveBeenCalled();
    down();
    act(() => node.emit("tap"));
    expect(first).toHaveBeenCalledTimes(1);
    expect(first.mock.calls[0][0]).toEqual({
      currentId: JSON.stringify([sid, "first"]),
      gallery: [
        {
          id: JSON.stringify([sid, "first"]),
          slideId: sid,
          elementId: "first",
          assetId: "asset-first",
        },
        {
          id: JSON.stringify([nextSlide, "next"]),
          slideId: nextSlide,
          elementId: "next",
          assetId: "asset-next",
        },
      ],
    });
    expect(document.body.querySelector(".eppt-image-preview")).toBeNull();
    act(() => node.emit("double"));
    expect(first).toHaveBeenCalledTimes(1); // A tap and double-tap for one pointer dispatch once.
    down();
    act(() => node.emit("double"));
    expect(first).toHaveBeenCalledTimes(2); // Fast repeated clicks use the engine's double-tap path.
    down(true);
    act(() => node.emit("tap"));
    act(() => node.emit("double"));
    expect(first).toHaveBeenCalledTimes(2);
    render(["first"], second);
    down();
    act(() =>
      host.querySelector<HTMLButtonElement>('[aria-label="预览图片"]')!.click(),
    );
    expect(second).toHaveBeenCalledTimes(1);
    act(() => node.emit("double"));
    expect(second).toHaveBeenCalledTimes(1);
    render([], second, "readonly");
    down();
    act(() => node.emit("tap"));
    expect(second).toHaveBeenCalledTimes(2);
    render(
      [],
      () => Promise.reject(new Error("host preview denied")),
      "readonly",
    );
    down();
    await act(async () => {
      node.emit("tap");
      await Promise.resolve();
    });
    expect(error).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ message: "host preview denied" }),
    );
    expect(engine.get()).toBe(app);
    expect(readDocument(doc)).toEqual(original);
    expect(writes).not.toHaveBeenCalled();
    expect(controller.history.undoStack).toHaveLength(0);
  } finally {
    act(() => root.unmount());
    host.remove();
    controller.dispose();
    doc.destroy();
  }
});

it("opens the standalone viewer in readonly, navigates across slides, and closes on image deletion without extra writes", () => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  const doc = createYDocument(createPresentation()),
    controller = new EditorController(doc),
    sid = readDocument(doc).slideOrder[0],
    other = controller.addSlide();
  for (const [slideId, id] of [
    [sid, "one"],
    [other, "two"],
  ])
    controller.insert(slideId, {
      id,
      type: "image",
      assetId: id,
      alt: id,
      transform: { x: 0, y: 0, width: 1, height: 1, rotation: 0 },
    });
  const host = document.createElement("div"),
    root = createRoot(host),
    writes = vi.fn();
  document.body.append(host);
  doc.on("update", writes);
  try {
    act(() =>
      root.render(
        <PresentationEditor
          document={doc}
          controller={controller}
          slideId={sid}
          mode="readonly"
          resolveAsset={(id) => "/allowed/" + id}
        />,
      ),
    );
    act(() =>
      engine
        .get()
        .nodes.find((node) => node.id === "one")!
        .emit("tap"),
    );
    expect(
      document.body
        .querySelector<HTMLImageElement>(".eppt-image-preview img")!
        .getAttribute("src"),
    ).toBe("/allowed/one");
    act(() =>
      document.body
        .querySelector<HTMLButtonElement>('[aria-label="下一张图片"]')!
        .click(),
    );
    expect(
      document.body.querySelector<HTMLImageElement>(".eppt-image-preview img")!
        .alt,
    ).toBe("two");
    expect(writes).not.toHaveBeenCalled();
    const remote = new Y.Doc();
    Y.applyUpdate(remote, Y.encodeStateAsUpdate(doc));
    const peer = new EditorController(remote);
    controller.history.clear();
    peer.remove(other, ["two"]);
    act(() => Y.applyUpdate(doc, Y.encodeStateAsUpdate(remote), REMOTE_ORIGIN));
    expect(document.body.querySelector(".eppt-image-preview")).toBeNull();
    expect(writes).toHaveBeenCalledTimes(1);
    expect(readDocument(doc)).toEqual(readDocument(remote));
    expect(controller.history.undoStack).toHaveLength(0);
    peer.dispose();
    remote.destroy();
  } finally {
    act(() => root.unmount());
    host.remove();
    controller.dispose();
    doc.destroy();
  }
});
