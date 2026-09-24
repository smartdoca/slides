// @vitest-environment jsdom
import { act, createRef } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import * as Y from "yjs";
import { createPresentation } from "../model/create";
import { createYDocument, readDocument } from "../collaboration/yjs-codec";
import { EditorController } from "../model/controller";
import { pxToEmu } from "../model/types";
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
    tree = { add() {} };
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
