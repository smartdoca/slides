import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  App,
  Ellipse,
  Rect,
  Path,
  Image as LeaferImage,
  PointerEvent,
  DragEvent,
  type UI,
} from "leafer-ui";
import { renderToStaticMarkup } from "react-dom/server";
import {
  EditorEvent,
  EditorMoveEvent,
  EditorScaleEvent,
} from "@leafer-in/editor";
import type { IEditor } from "@leafer-in/interface";
import { selectionBounds } from "../model/viewport";
import { snapBox, type SnapGuide } from "../model/snapping";
import { shapePath } from "../model/shapes";
import "@leafer-in/resize";
import "@leafer-in/export";
import type * as Y from "yjs";
import type { Editor as SlateEditor } from "slate";
import {
  emuToPx,
  pxToEmu,
  type EditorSelection,
  type PresentationDocument,
  type SlideElement,
  type Transform,
} from "../model/types";
import { EditorController } from "../model/controller";
import { readDocument, textOf, patchElement } from "../collaboration/yjs-codec";
import { SlateTextOverlay } from "./SlateTextOverlay";
import { TableOverlay } from "./TableOverlay";
import { RichTextView } from "./text";
import { linePath } from "../model/line";
import { ChartView } from "./ChartView";
import { ResourceImage, resolveImageUrl } from "./ResourceImage";
import { presentationStore } from "../model/projection-store";
import { chartSvg } from "./chart-renderer";
import { createTextPainter } from "./text-paint";
import {
  imageFrame,
  imageNodeTransform,
  imageModelTransform,
} from "../model/image";

export interface PresentationEditorHandle {
  /** View-only transform, including an in-progress drag/resize. Does not commit. */
  getElementTransform(id: string): Transform | null;
  getDocument(): PresentationDocument;
  setReadOnly(value: boolean): void;
  dispose(): void;
  exportPng(): Promise<Blob>;
  finishTextEdit(): void;
}
export interface PresentationEditorProps {
  /** Host actions share the selected table's toolbar rather than overlap it. */
  tableActions?: ReactNode;
  document: Y.Doc;
  controller?: EditorController;
  slideId?: string;
  mode?: "edit" | "readonly";
  selectedIds?: string[];
  resolveAsset?: (id: string) => string;
  onReady?: (editor: PresentationEditorHandle) => void;
  onSelectionChange?: (selection: EditorSelection) => void;
  onError?: (error: Error) => void;
  onTextEditor?: (editor: SlateEditor | null) => void;
  /** Transient pointer interaction; not a content or save event. */
  onInteractionChange?: (active: boolean) => void;
  viewScale?: number;
  snapping?: boolean;
  onContextMenu?: (target: { elementId: string; x: number; y: number }) => void;
}
export function usePresentation(document: Y.Doc) {
  const store = presentationStore(document);
  return useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot,
  );
}

export const PresentationEditor = forwardRef<
  PresentationEditorHandle,
  PresentationEditorProps
>(function PresentationEditor(props, ref) {
  const { document } = props;
  const value = usePresentation(document);
  const slideId = props.slideId ?? value.slideOrder[0];
  const slide = value.slides[slideId];
  const host = useRef<HTMLDivElement>(null);
  const app = useRef<App | null>(null);
  const nodes = useRef(new Map<string, UI>());
  const renderedContent = useRef(new WeakMap<UI, SlideElement>());
  const paintText = useRef(
    createTextPainter((element, width, height) =>
      renderToStaticMarkup(
        <div
          style={{
            width,
            height,
            overflow: "hidden",
            color: element.fill ?? "#202124",
          }}
        >
          <ElementContent element={element} />
        </div>,
      ),
    ),
  );
  const textResizeFrame = useRef<number | null>(null);
  const [forcedReadonly, forceReadonly] = useState(false);
  const [resourceRevision, retryResources] = useState(0);
  const [editing, setEditing] = useState<string | null>(null);
  const ownedController = useRef<EditorController | null>(null);
  const current = useRef({ props, value, slideId, editing, readOnly: false });
  current.current = {
    props,
    value,
    slideId,
    editing,
    readOnly: forcedReadonly || props.mode === "readonly",
  };
  const syncing = useRef(false);
  const pendingCharts = useRef(new Map<string, Promise<void>>());
  const [guides, setGuides] = useState<SnapGuide[]>([]);
  const moving = useRef(false),
    alt = useRef(false);
  const dispose = () => {
    if (textResizeFrame.current !== null)
      cancelAnimationFrame(textResizeFrame.current);
    textResizeFrame.current = null;
    app.current?.destroy();
    app.current = null;
    nodes.current.clear();
    pendingCharts.current.clear();
  };
  const handle = {
    getElementTransform: (id: string): Transform | null => {
      const state = current.current;
      const element = state.value.slides[state.slideId]?.elements[id];
      const node = nodes.current.get(id);
      if (!element) return null;
      if (!moving.current || !node) return element.transform;
      return element.type === "image" ? imageModelTransform(node) : {
        x: pxToEmu(node.x ?? 0), y: pxToEmu(node.y ?? 0),
        width: pxToEmu((node.width ?? 1) * (node.scaleX ?? 1)),
        height: pxToEmu((node.height ?? 1) * (node.scaleY ?? 1)),
        rotation: node.rotation ?? 0,
      };
    },
    finishTextEdit: () => setEditing(null),
    getDocument: () => readDocument(document),
    setReadOnly: forceReadonly,
    dispose,
    async exportPng(): Promise<Blob> {
      const instance = app.current;
      if (!instance) throw new Error("编辑器尚未就绪");
      await Promise.all(pendingCharts.current.values());
      const state = current.current;
      const editingNode = state.editing
          ? nodes.current.get(state.editing)
          : undefined,
        previousOpacity = editingNode?.opacity;
      if (editingNode)
        editingNode.opacity =
          state.value.slides[state.slideId]?.elements[state.editing!]
            ?.opacity ?? 1;
      try {
        const result = await instance.tree.export("png", {
          blob: true,
          screenshot: {
            x: 0,
            y: 0,
            width: emuToPx(state.value.size.width),
            height: emuToPx(state.value.size.height),
          },
          fill: state.value.slides[state.slideId]?.background ?? "#ffffff",
          pixelRatio: 2,
        });
        if (result.error || !(result.data instanceof Blob))
          throw new Error("PNG 导出失败，请检查图片资源是否有权限访问");
        return result.data;
      } finally {
        if (editingNode && nodes.current.get(state.editing!) === editingNode)
          editingNode.opacity = previousOpacity;
      }
    },
  };
  useImperativeHandle(ref, () => handle, [document]);

  useEffect(() => {
    if (!host.current) return;
    const instance = new App({
      view: host.current,
      // The host viewport owns zoom/scroll. Never pan the contents independently
      // of the fixed slide background and DOM editing overlays.
      move: { disabled: true, drag: false, dragEmpty: false, dragOut: false, scroll: false, holdSpaceKey: false, holdMiddleKey: false, holdRightKey: false },
      zoom: { disabled: true },
      wheel: { disabled: true, preventDefault: false },
      editor: {
        skewable: false,
        stroke: "#3366ff",
        strokeWidth: 1.5,
        pointSize: 8,
        pointRadius: 2,
        pointFill: "#ffffff",
      },
      pointer: { tapTime: 220 },
    });
    app.current = instance;
    if (!props.controller)
      ownedController.current = new EditorController(document);
    instance.editor.on(EditorEvent.SELECT, () => {
      if (syncing.current) return;
      const state = current.current;
      const ids = instance.editor.list.map((node) => node.id!).filter(Boolean);
      if (!ids.includes(state.editing ?? "")) setEditing(null);
      state.props.onSelectionChange?.(
        ids.length
          ? { type: "elements", slideId: state.slideId, elementIds: ids }
          : null,
      );
    });
    instance.on(DragEvent.START, () => {
      moving.current = true;
      current.current.props.onInteractionChange?.(true);
    });
    instance.editor.on(EditorScaleEvent.SCALE, () => {
      if (current.current.readOnly || textResizeFrame.current !== null) return;
      textResizeFrame.current = requestAnimationFrame(() => {
        textResizeFrame.current = null;
        const state = current.current;
        if (state.readOnly || app.current !== instance) return;
        for (const node of instance.editor.list) {
          const element = state.value.slides[state.slideId]?.elements[node.id!];
          if (element?.type === "text" && !element.locked)
            paintText.current(node, element);
        }
      });
    });
    const modifier = (e: KeyboardEvent) => {
      alt.current = e.altKey;
    };
    window.addEventListener("keydown", modifier);
    window.addEventListener("keyup", modifier);
    instance.editor.on(EditorMoveEvent.MOVE, () => {
      const state = current.current;
      if (
        !moving.current ||
        state.readOnly ||
        state.props.snapping === false ||
        alt.current
      ) {
        setGuides([]);
        return;
      }
      const selected = instance.editor.list;
      if (!selected.length) return;
      const ids = new Set(selected.map((n) => n.id));
      const bounds = selectionBounds(
        selected.map((n) => {
          const el = state.value.slides[state.slideId]?.elements[n.id!];
          const t = el?.type === "image" ? imageModelTransform(n) : null;
          return t
            ? {
                x: emuToPx(t.x),
                y: emuToPx(t.y),
                width: emuToPx(t.width),
                height: emuToPx(t.height),
                rotation: t.rotation,
              }
            : {
                x: n.x ?? 0,
                y: n.y ?? 0,
                width: (n.width ?? 0) * (n.scaleX ?? 1),
                height: (n.height ?? 0) * (n.scaleY ?? 1),
                rotation: n.rotation ?? 0,
              };
        }),
      );
      const others = Object.values(
        state.value.slides[state.slideId]?.elements ?? {},
      )
        .filter((el) => !ids.has(el.id) && el.visible !== false)
        .map((el) =>
          selectionBounds([
            {
              x: emuToPx(el.transform.x),
              y: emuToPx(el.transform.y),
              width: emuToPx(el.transform.width),
              height: emuToPx(el.transform.height),
              rotation: el.transform.rotation,
            },
          ]),
        );
      const snap = snapBox(
        bounds,
        others,
        {
          width: emuToPx(state.value.size.width),
          height: emuToPx(state.value.size.height),
        },
        6 / (state.props.viewScale ?? 1),
      );
      if (snap.dx || snap.dy) {
        selected.forEach((n) => n.moveWorld(snap.dx, snap.dy));
        const editor = instance.editor as IEditor;
        if (selected.length > 1)
          editor.simulateTarget.safeChange(() =>
            editor.simulateTarget.moveWorld(snap.dx, snap.dy),
          );
      }
      setGuides(snap.guides);
    });
    instance.on(DragEvent.END, () =>
      queueMicrotask(() => {
        const state = current.current;
        moving.current = false;
        setGuides([]);
        state.props.onInteractionChange?.(false);
        if (state.readOnly) return;
        const controller = state.props.controller ?? ownedController.current;
        controller?.run(() => {
          const slide = readDocument(document).slides[state.slideId];
          for (const node of instance.editor.list) {
            const id = node.id!;
            const el = slide?.elements[id];
            if (!el || el.locked) continue;
            const transform: Transform =
              el.type === "image"
                ? imageModelTransform(node)
                : {
                    x: pxToEmu(node.x ?? 0),
                    y: pxToEmu(node.y ?? 0),
                    width: pxToEmu((node.width ?? 1) * (node.scaleX ?? 1)),
                    height: pxToEmu((node.height ?? 1) * (node.scaleY ?? 1)),
                    rotation: node.rotation ?? 0,
                  };
            if (el.type === "image") {
              if (!!el.transform.flipH === transform.flipH)
                delete transform.flipH;
              if (!!el.transform.flipV === transform.flipV)
                delete transform.flipV;
            }
            patchElement(document, state.slideId, id, { transform });
          }
        });
      }),
    );
    current.current.props.onReady?.(handle);
    return () => {
      dispose();
      window.removeEventListener("keydown", modifier);
      window.removeEventListener("keyup", modifier);
      ownedController.current?.dispose();
      ownedController.current = null;
    };
  }, [document]);

  useEffect(() => {
    const instance = app.current;
    if (!instance) return;
    syncing.current = true;
    try {
      const ids = slide?.elementOrder ?? [];
      const liveIds = new Set(ids);
      for (const [id, node] of nodes.current)
        if (!liveIds.has(id)) {
          node.destroy();
          nodes.current.delete(id);
          pendingCharts.current.delete(id);
        }
      ids.forEach((id, index) => {
        const element = slide!.elements[id];
        let node = nodes.current.get(id);
        if (!node) {
          node = makeNode(element);
          node.on(PointerEvent.TAP, () => {
            const state = current.current;
            if (state.readOnly)
              state.props.onSelectionChange?.({
                type: "elements",
                slideId: state.slideId,
                elementIds: [id],
              });
          });
          node.on(PointerEvent.DOUBLE_TAP, () => {
            const state = current.current;
            const fresh = state.value.slides[state.slideId]?.elements[id];
            if (!state.readOnly && fresh?.type === "text" && !fresh.locked)
              setEditing(id);
          });
          instance.tree.add(node);
          nodes.current.set(id, node);
        }
        const t = element.transform;
        node.set({
          x: emuToPx(t.x),
          y: emuToPx(t.y),
          width: Math.max(1, emuToPx(t.width)),
          height: Math.max(1, emuToPx(t.height)),
          rotation: t.rotation,
          scaleX: 1,
          scaleY: 1,
          opacity: element.opacity ?? 1,
          visible: element.visible !== false,
          zIndex: index,
          editable: !current.current.readOnly && !element.locked,
          ...(element.type === "image" ? imageNodeTransform(t) : {}),
          ...(element.type === "shape" || element.type === "line"
            ? {
                fill:
                  element.type === "shape"
                    ? element.fill
                    : element.arrow
                      ? element.stroke
                      : undefined,
                stroke: element.stroke,
                strokeWidth: element.strokeWidth,
              }
            : {}),
        });
        if (element.type === "image") {
          const frame = imageFrame(
            emuToPx(t.width),
            emuToPx(t.height),
            element.crop,
          );
          node.fill = {
            type: "image",
            url: resolveImageUrl(props.resolveAsset, element.assetId),
            mode: "clip",
            size: { width: frame.width, height: frame.height },
            offset: { x: frame.x, y: frame.y },
          };
        }
        if (node instanceof LeaferImage && element.type === "chart") {
          const chartNode = node;
          const task = chartSvg(element).then((url) => {
            if (
              pendingCharts.current.get(id) === task &&
              nodes.current.get(id) === chartNode
            )
              chartNode.url = url;
          });
          pendingCharts.current.set(id, task);
          task.catch((error) =>
            props.onError?.(
              error instanceof Error ? error : new Error(String(error)),
            ),
          );
        }
        if (element.type === "text") {
          node.opacity = editing === id ? 0 : (element.opacity ?? 1);
          paintText.current(node, element);
        }
        if (
          node instanceof LeaferImage &&
          element.type !== "chart" &&
          element.type !== "text"
        ) {
          node.opacity =
            editing === id ||
            (element.type === "table" &&
              props.selectedIds?.includes(id) &&
              !current.current.readOnly &&
              !element.locked)
              ? 0
              : (element.opacity ?? 1);
          if (renderedContent.current.get(node) !== element) {
            const width = emuToPx(t.width),
              height = emuToPx(t.height);
            const markup = renderToStaticMarkup(
              <div
                style={{
                  width,
                  height,
                  overflow: "hidden",
                  color: "#24314b",
                }}
              >
                <ElementContent element={element} />
              </div>,
            );
            const url =
              element.type === "image"
                ? props.resolveAsset?.(element.assetId)
                : "data:image/svg+xml," +
                  encodeURIComponent(
                    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><foreignObject width="100%" height="100%"><div xmlns="http://www.w3.org/1999/xhtml">${markup}</div></foreignObject></svg>`,
                  );
            if (node.url !== url) node.url = url ?? "";
            renderedContent.current.set(node, element);
          }
        }
        if (element.type === "line") (node as Path).path = linePath(element);
        if (element.type === "shape" && node instanceof Path) {
          const w = emuToPx(t.width),
            h = emuToPx(t.height);
          node.path = shapePath(element.shape, w, h);
        }
      });
      instance.editor.target = current.current.readOnly
        ? []
        : (props.selectedIds ?? [])
            .filter((id) => !slide?.elements[id]?.locked)
            .map((id) => nodes.current.get(id)!)
            .filter(Boolean);
      if (current.current.readOnly) {
        setEditing(null);
        instance.editor.target = [];
      }
    } catch (error) {
      props.onError?.(
        error instanceof Error ? error : new Error(String(error)),
      );
    } finally {
      syncing.current = false;
    }
  }, [
    slide,
    value.size,
    slideId,
    props.mode,
    props.selectedIds,
    props.resolveAsset,
    forcedReadonly,
    editing,
    resourceRevision,
  ]);

  useEffect(() => {
    setEditing(null);
  }, [slideId]);
  if (!value.size) return <div role="status">正在加载文档…</div>;
  const controller = props.controller ?? ownedController.current;
  return (
    <div
      className="eppt-slide"
      onContextMenu={(e) => {
        if (
          (e.target as HTMLElement).closest(
            'textarea,input,[contenteditable="true"]',
          )
        )
          return;
        const box = e.currentTarget.getBoundingClientRect(),
          x = ((e.clientX - box.left) * emuToPx(value.size.width)) / box.width,
          y = ((e.clientY - box.top) * emuToPx(value.size.height)) / box.height;
        const target = [...(slide?.elementOrder ?? [])].reverse().find((id) => {
          const el = slide.elements[id],
            t = el.transform,
            a = (-t.rotation * Math.PI) / 180,
            dx = x - emuToPx(t.x),
            dy = y - emuToPx(t.y),
            rx = dx * Math.cos(a) - dy * Math.sin(a),
            ry = dx * Math.sin(a) + dy * Math.cos(a);
          return (
            el.visible !== false &&
            rx >= 0 &&
            ry >= 0 &&
            rx <= emuToPx(t.width) &&
            ry <= emuToPx(t.height)
          );
        });
        if (target) {
          e.preventDefault();
          props.onContextMenu?.({
            elementId: target,
            x: e.clientX,
            y: e.clientY,
          });
        }
      }}
      style={{
        position: "relative",
        width: emuToPx(value.size.width),
        height: emuToPx(value.size.height),
        background: slide?.background ?? "#fff",
        isolation: "isolate",
        overflow: "clip",
      }}
    >
      <div ref={host} style={{ position: "absolute", inset: 0 }} />
      {slide?.elementOrder.map((id) => {
        const el = slide.elements[id];
        const activeTable =
          el.type === "table" &&
          props.selectedIds?.includes(id) &&
          !current.current.readOnly &&
          !el.locked;
        if (
          (el.type !== "text" && el.type !== "image" && !activeTable) ||
          el.visible === false
        )
          return null;
        const t = el.transform;
        return (
          <div
            key={id}
            style={{
              position: "absolute",
              pointerEvents: id === editing || activeTable ? "auto" : "none",
              left: emuToPx(t.x),
              top: emuToPx(t.y),
              width: emuToPx(t.width),
              height: emuToPx(t.height),
              transform: `rotate(${t.rotation}deg)`,
              transformOrigin: "0 0",
              opacity:
                id === editing || activeTable || el.type === "image"
                  ? (el.opacity ?? 1)
                  : 0,
              overflow: activeTable ? "visible" : "hidden",
              color: el.type === "text" ? el.fill : undefined,
              background: el.type === "text" ? el.background : undefined,
              zIndex: activeTable ? 20 : undefined,
              ["--eppt-ui-scale" as string]: 1 / (props.viewScale ?? 1),
            }}
          >
            {el.type === "image" ? (
              <ResourceImage
                element={el}
                resolveAsset={props.resolveAsset}
                fallbackOnly
                onRetry={() => retryResources((n) => n + 1)}
              />
            ) : activeTable && controller && el.type === "table" ? (
              <TableOverlay
                key={id}
                element={el}
                controller={controller}
                slideId={slideId}
                viewScale={props.viewScale}
                actions={props.tableActions}
                onDone={() => props.onSelectionChange?.(null)}
              />
            ) : el.type === "text" &&
              editing === id &&
              textOf(document, slideId, id) ? (
              <SlateTextOverlay
                verticalAlign={el.verticalAlign}
                padding={el.padding}
                sharedText={textOf(document, slideId, id)!}
                onDone={() => setEditing(null)}
                onUndo={() => controller?.undo()}
                onRedo={() => controller?.redo()}
                onFormat={props.onTextEditor}
              />
            ) : (
              <ElementContent element={el} resolveAsset={props.resolveAsset} />
            )}
          </div>
        );
      })}
      {current.current.readOnly &&
        (props.selectedIds ?? []).map((id) => {
          const el = slide?.elements[id];
          if (!el) return null;
          return (
            <div
              key={id}
              aria-label="只读选区"
              style={{
                position: "absolute",
                pointerEvents: "none",
                border: "1px solid #365dea",
                left: emuToPx(el.transform.x),
                top: emuToPx(el.transform.y),
                width: emuToPx(el.transform.width),
                height: emuToPx(el.transform.height),
                transform: `rotate(${el.transform.rotation}deg)`,
                transformOrigin: "0 0",
              }}
            />
          );
        })}
      {!!guides.length && (
        <svg
          aria-label="对齐与等距参考线"
          className="eppt-snap-guides"
          width="100%"
          height="100%"
          viewBox={`0 0 ${emuToPx(value.size.width)} ${emuToPx(value.size.height)}`}
        >
          {guides.map((g, i) =>
            g.gap === undefined ? (
              <line
                key={i}
                x1={g.axis === "x" ? g.position : g.start}
                x2={g.axis === "x" ? g.position : g.end}
                y1={g.axis === "x" ? g.start : g.position}
                y2={g.axis === "x" ? g.end : g.position}
              />
            ) : (
              <g key={i}>
                <line
                  x1={g.axis === "x" ? g.start : g.position}
                  x2={g.axis === "x" ? g.end : g.position}
                  y1={g.axis === "x" ? g.position : g.start}
                  y2={g.axis === "x" ? g.position : g.end}
                />
                <text
                  x={g.axis === "x" ? (g.start + g.end) / 2 : g.position + 8}
                  y={g.axis === "x" ? g.position - 8 : (g.start + g.end) / 2}
                >
                  {Math.round(g.gap)} px
                </text>
              </g>
            ),
          )}
        </svg>
      )}
    </div>
  );
});
function makeNode(element: SlideElement): UI {
  const base = { id: element.id };
  if (element.type === "line")
    return new Path({ ...base, path: linePath(element) });
  if (element.type === "image") return new Rect(base);
  if (element.type === "text")
    return new Rect({
      ...base,
      editConfig: { editSize: "size", flipable: false },
    });
  if (element.type === "shape") {
    return new Path({ ...base, path: shapePath(element.shape) });
  }
  return new LeaferImage(base);
}
export function ElementContent({
  element: el,
  resolveAsset,
  interactiveResource = true,
  interactiveLinks = false,
}: {
  element: SlideElement;
  resolveAsset?: (id: string) => string;
  interactiveResource?: boolean;
  interactiveLinks?: boolean;
}) {
  if (el.type === "text")
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          height: "100%",
          padding: el.padding ?? 0,
          boxSizing: "border-box",
          background: el.background,
          justifyContent:
            el.verticalAlign === "middle"
              ? "center"
              : el.verticalAlign === "bottom"
                ? "flex-end"
                : "flex-start",
        }}
      >
        <div style={{ flexShrink: 0 }}>
          <RichTextView paragraphs={el.paragraphs} interactiveLinks={interactiveLinks} />
        </div>
      </div>
    );
  if (el.type === "image") {
    return (
      <ResourceImage
        element={el}
        resolveAsset={resolveAsset}
        interactive={interactiveResource}
      />
    );
  }
  if (el.type === "table")
    return (
      <table
        style={{
          width: "100%",
          height: "100%",
          borderCollapse: "collapse",
          tableLayout: "fixed",
          fontSize: 18,
        }}
      >
        <tbody>
          {el.cells.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) => (
                <td
                  key={j}
                  style={{
                    border: "1px solid #cdd5e4",
                    padding: 8,
                    background:
                      i === 0 ? el.headerFill : i % 2 ? "#f1f4fa" : "#fff",
                    color: i === 0 ? "#fff" : "#24314b",
                  }}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    );
  if (el.type === "chart") return <ChartView element={el} />;
  return null;
}
