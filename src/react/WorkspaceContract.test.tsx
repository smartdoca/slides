// @vitest-environment jsdom
import {
  act,
  createRef,
  forwardRef,
  useEffect,
  useImperativeHandle,
  useSyncExternalStore,
} from "react";
import * as Y from "yjs";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { createPresentation, createTextElement } from "../model/create";
import { createYDocument, readDocument } from "../collaboration/yjs-codec";
import { EditorController } from "../model/controller";
import { presentationStore } from "../model/projection-store";
import type { CommentMarker } from "../model/anchors";
import { emuToPx, pxToEmu } from "../model/types";
import {
  PresentationWorkspace,
  type PresentationWorkspaceHandle,
} from "./PresentationWorkspace";
const counters = vi.hoisted(() => ({ mounts: 0 }));
vi.mock("./PresentationEditor", () => ({
  usePresentation: (doc: Y.Doc) => {
    const store = presentationStore(doc);
    return useSyncExternalStore(
      store.subscribe,
      store.getSnapshot,
      store.getSnapshot,
    );
  },
  ElementContent: () => null,
  PresentationEditor: forwardRef(function Fake(props: any, ref) {
    useEffect(() => {
      counters.mounts++;
    }, []);
    useImperativeHandle(ref, () => ({
      exportPng: async () => new Blob(["png"]),
    }));
    return (
      <>
        <button
          data-test="select"
          onClick={() =>
            props.onSelectionChange({
              type: "elements",
              slideId: props.slideId,
              elementIds: readDocument(props.document).slides[props.slideId]
                .elementOrder,
            })
          }
        >
          测试选区
        </button>
        {readDocument(props.document).slides[props.slideId].elementOrder.map(
          (id) => (
            <button
              key={id}
              data-test={`select-${id}`}
              onClick={() =>
                props.onSelectionChange({
                  type: "elements",
                  slideId: props.slideId,
                  elementIds: [id],
                })
              }
            >
              Select {id}
            </button>
          ),
        )}
      </>
    );
  }),
}));
let root: Root, host: HTMLDivElement;
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  HTMLElement.prototype.scrollIntoView = vi.fn();
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as any;
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  counters.mounts = 0;
});
it("copies styles without writes, paints once or continuously, cancels with Escape and preserves undo", () => {
  const model = createPresentation(),
    sid = model.slideOrder[0],
    sourceId = model.slides[sid].elementOrder[0];
  const target = createTextElement("目标文字");
  model.slides[sid].elements[target.id] = target;
  model.slides[sid].elementOrder.push(target.id);
  const doc = createYDocument(model),
    controller = new EditorController(doc);
  controller.formatText(sid, [sourceId], { fontSize: 44, bold: true });
  controller.dispose();
  const writes = vi.fn();
  doc.on("update", writes);
  const render = (readOnly = false) =>
    act(() =>
      root.render(<PresentationWorkspace document={doc} readOnly={readOnly} />),
    );
  const click = (selector: string) =>
    act(() => host.querySelector<HTMLButtonElement>(selector)!.click());
  const select = (id: string) => click(`[data-test="select-${id}"]`);
  const leaf = () =>
    (
      readDocument(doc).slides[sid].elements[
        target.id
      ] as import("../model/types").TextElement
    ).paragraphs[0].children[0];
  render();
  select(sourceId);
  click('[aria-label="更多文字格式"]');
  act(() =>
    [...host.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')]
      .find((button) => button.textContent === "复制格式")!
      .click(),
  );
  expect(writes).not.toHaveBeenCalled();
  click('[aria-label="格式刷"]');
  select(target.id);
  render();
  expect(leaf()).toMatchObject({ text: "目标文字", fontSize: 44, bold: true });
  expect(
    host.querySelector('[aria-label="格式刷"]')!.getAttribute("aria-pressed"),
  ).toBe("false");
  expect(writes).toHaveBeenCalledTimes(1);
  click('[aria-label="撤销"]');
  render();
  expect(leaf().fontSize).toBe(24);
  select(sourceId);
  act(() =>
    host
      .querySelector('[aria-label="格式刷"]')!
      .dispatchEvent(new MouseEvent("dblclick", { bubbles: true })),
  );
  select(target.id);
  render();
  expect(
    host.querySelector('[aria-label="格式刷"]')!.getAttribute("aria-pressed"),
  ).toBe("true");
  act(() =>
    host.querySelector(".eppt-workspace")!.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Escape",
        bubbles: true,
        cancelable: true,
      }),
    ),
  );
  expect(
    host.querySelector('[aria-label="格式刷"]')!.getAttribute("aria-pressed"),
  ).toBe("false");
  click('[aria-label="更多文字格式"]');
  act(() =>
    [...host.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')]
      .find((button) => button.textContent === "清除所有格式")!
      .click(),
  );
  render();
  expect(leaf().bold).toBe(false);
  const lastWrites = writes.mock.calls.length;
  render(true);
  expect(host.querySelector(".eppt-selection-format")).toBeNull();
  act(() =>
    host.querySelector(".eppt-workspace")!.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "V",
        ctrlKey: true,
        shiftKey: true,
        bubbles: true,
      }),
    ),
  );
  expect(writes).toHaveBeenCalledTimes(lastWrites);
  doc.destroy();
});
it("format shortcuts take precedence over element clipboard and do not swallow input editing", () => {
  const model = createPresentation(),
    sid = model.slideOrder[0],
    sourceId = model.slides[sid].elementOrder[0];
  const target = createTextElement("目标");
  model.slides[sid].elements[target.id] = target;
  model.slides[sid].elementOrder.push(target.id);
  const doc = createYDocument(model),
    controller = new EditorController(doc);
  controller.formatText(sid, [sourceId], { fontSize: 40 });
  controller.dispose();
  const render = () =>
    act(() => root.render(<PresentationWorkspace document={doc} />));
  render();
  const select = (id: string) =>
    act(() =>
      host
        .querySelector<HTMLButtonElement>(`[data-test="select-${id}"]`)!
        .click(),
    );
  const key = (target: Element, value: string) => {
    const event = new KeyboardEvent("keydown", {
      key: value,
      ctrlKey: true,
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    });
    act(() => target.dispatchEvent(event));
    return event;
  };
  select(sourceId);
  expect(
    key(host.querySelector(".eppt-workspace")!, "C").defaultPrevented,
  ).toBe(true);
  select(target.id);
  expect(
    key(host.querySelector(".eppt-workspace")!, "V").defaultPrevented,
  ).toBe(true);
  expect(
    (
      readDocument(doc).slides[sid].elements[
        target.id
      ] as import("../model/types").TextElement
    ).paragraphs[0].children[0].fontSize,
  ).toBe(40);
  expect(readDocument(doc).slides[sid].elementOrder).toHaveLength(2);
  expect(key(host.querySelector("textarea")!, "V").defaultPrevented).toBe(
    false,
  );
  doc.destroy();
});
it("keeps line quick styles visible and marks the applied text preset", () => {
  const model = createPresentation(),
    sid = model.slideOrder[0],
    doc = createYDocument(model),
    controller = new EditorController(doc);
  const line = controller.add(sid, "line");
  controller.dispose();
  const render = () =>
    act(() => root.render(<PresentationWorkspace document={doc} />));
  const click = (selector: string) =>
    act(() => host.querySelector<HTMLButtonElement>(selector)!.click());
  render();
  click(`[data-test="select-${line}"]`);
  click('[aria-label="形状样式"]');
  click('[aria-label="强调"]');
  expect(readDocument(doc).slides[sid].elements[line]).toMatchObject({
    type: "line",
    strokeWidth: 1,
    stroke: "#4472c4",
  });
  click(`[data-test="select-${model.slides[sid].elementOrder[0]}"]`);
  click('[aria-label="标题样式"]');
  act(() =>
    [...host.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]')]
      .find((button) => button.textContent === "大标题")!
      .click(),
  );
  render();
  click('[aria-label="标题样式"]');
  expect(
    host.querySelector('[role="menuitemradio"][aria-checked="true"]')
      ?.textContent,
  ).toContain("大标题");
  doc.destroy();
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});
it.each([
  ["embedded", false],
  ["embedded", true],
  ["demo", false],
  ["demo", true],
] as const)(
  "leaves search UI and shortcuts to the host (%s, readonly=%s)",
  (chrome, readOnly) => {
    const doc = createYDocument(createPresentation()),
      ref = createRef<PresentationWorkspaceHandle>();
    const writes = vi.fn(),
      received = vi.fn();
    doc.on("update", writes);
    act(() =>
      root.render(
        <PresentationWorkspace
          document={doc}
          chrome={chrome}
          readOnly={readOnly}
          ref={ref}
        />,
      ),
    );
    expect(
      [...host.querySelectorAll("button")].some((button) =>
        button.textContent?.includes("查找"),
      ),
    ).toBe(false);
    expect(host.querySelector('[aria-label="查找文本"]')).toBeNull();
    window.addEventListener("keydown", received);
    try {
      for (const target of [
        host.querySelector(".eppt-workspace")!,
        host.querySelector("textarea")!,
        host.querySelector('[data-test="select"]')!,
      ]) {
        for (const modifier of [{ ctrlKey: true }, { metaKey: true }]) {
          const event = new KeyboardEvent("keydown", {
            key: "f",
            ...modifier,
            bubbles: true,
            cancelable: true,
          });
          act(() => target.dispatchEvent(event));
          expect(event.defaultPrevented).toBe(false);
        }
      }
      expect(received).toHaveBeenCalledTimes(6);
      const controller = new EditorController(doc);
      controller.setReadOnly(readOnly);
      const match = controller.find("EPPT")[0];
      expect(match).toBeDefined();
      act(() => {
        expect(ref.current!.revealAnchor(match.anchor)).toBe(true);
      });
      expect(writes).not.toHaveBeenCalled();
      expect(counters.mounts).toBe(1);
      controller.dispose();
    } finally {
      window.removeEventListener("keydown", received);
      doc.destroy();
    }
  },
);
it("embedded toolbar flattens presentation, history and page settings without remounting", () => {
  const doc = createYDocument(createPresentation());
  const writes = vi.fn();
  doc.on("update", writes);
  const render = (readOnly = false) =>
    act(() =>
      root.render(
        <PresentationWorkspace
          document={doc}
          chrome="embedded"
          readOnly={readOnly}
        />,
      ),
    );
  render();
  const toolbar = host.querySelector(".eppt-toolbar")!;
  expect(
    toolbar
      .querySelector(".eppt-flat-tools > button")
      ?.getAttribute("aria-label"),
  ).toBe("开始放映");
  expect(toolbar.querySelector('[aria-label="编辑"]')).toBeNull();
  expect(toolbar.querySelector('[aria-label="设计"]')).toBeNull();
  expect(toolbar.querySelector('[aria-label="撤销"]')).not.toBeNull();
  expect(toolbar.querySelector('[aria-label="重做"]')).not.toBeNull();
  expect(toolbar.querySelector('[aria-label="页面背景"]')).not.toBeNull();
  expect(writes).not.toHaveBeenCalled();
  const size = toolbar.querySelector<HTMLSelectElement>(
    '[aria-label="页面尺寸"]',
  )!;
  act(() => {
    size.value = "standard";
    size.dispatchEvent(new Event("change", { bubbles: true }));
  });
  render();
  expect(size.value).toBe("standard");
  expect(writes).toHaveBeenCalledTimes(1);
  act(() =>
    toolbar.querySelector<HTMLButtonElement>('[aria-label="撤销"]')!.click(),
  );
  render();
  expect(size.value).toBe("wide");
  act(() =>
    toolbar.querySelector<HTMLButtonElement>('[aria-label="重做"]')!.click(),
  );
  render();
  expect(size.value).toBe("standard");
  expect(counters.mounts).toBe(1);
  render(true);
  expect(
    toolbar.querySelector<HTMLButtonElement>('[aria-label="撤销"]')!.disabled,
  ).toBe(true);
  expect(size.disabled).toBe(true);
  expect(
    toolbar.querySelector<HTMLButtonElement>('[aria-label="开始放映"]')!
      .disabled,
  ).toBe(false);
  doc.destroy();
});
it("creates print previews only for print lifecycle without document writes", () => {
  const doc = createYDocument(createPresentation()),
    writes = vi.fn();
  doc.on("update", writes);
  act(() => root.render(<PresentationWorkspace document={doc} />));
  expect(host.querySelectorAll(".eppt-print .eppt-preview")).toHaveLength(0);
  act(() => window.dispatchEvent(new Event("beforeprint")));
  expect(host.querySelectorAll(".eppt-print .eppt-preview")).toHaveLength(1);
  act(() => window.dispatchEvent(new Event("afterprint")));
  expect(host.querySelectorAll(".eppt-print .eppt-preview")).toHaveLength(0);
  expect(writes).not.toHaveBeenCalled();
  doc.destroy();
});
it("embedded chrome, panels, comment action and readonly updates retain editor and create zero content writes", () => {
  const doc = createYDocument(createPresentation()),
    ref = createRef<PresentationWorkspaceHandle>(),
    presence = vi.fn();
  let writes = 0;
  doc.on("update", () => writes++);
  act(() =>
    root.render(
      <PresentationWorkspace
        document={doc}
        ref={ref}
        onPresence={presence}
        renderCommentAction={(anchor) => (
          <button data-test="comment">{anchor.type}</button>
        )}
      />,
    ),
  );
  expect(host.querySelector(".eppt-header")).toBeNull();
  act(() =>
    host.querySelector<HTMLButtonElement>('[data-test="select"]')!.click(),
  );
  expect(ref.current!.captureAnchor()).not.toBeNull();
  expect(host.querySelector('[data-test="comment"]')).not.toBeNull();
  act(() =>
    ref.current!.setPanels({ slides: false, properties: true, notes: false }),
  );
  expect(host.querySelector<HTMLElement>(".eppt-notes")!.hidden).toBe(true);
  act(() =>
    root.render(
      <PresentationWorkspace
        document={doc}
        ref={ref}
        readOnly
        onPresence={presence}
      />,
    ),
  );
  expect(counters.mounts).toBe(1);
  expect(writes).toBe(0);
  doc.destroy();
});
it("presentation navigation is local and never takes keys from a host input", () => {
  const doc = createYDocument(createPresentation()),
    c = new EditorController(doc);
  c.addSlide();
  const ref = createRef<PresentationWorkspaceHandle>(),
    presence = vi.fn();
  let writes = 0;
  doc.on("update", () => writes++);
  act(() =>
    root.render(
      <PresentationWorkspace document={doc} ref={ref} onPresence={presence} />,
    ),
  );
  act(() => ref.current!.setPresentation(true));
  presence.mockClear();
  const outside = document.createElement("input");
  document.body.append(outside);
  outside.focus();
  const key = new KeyboardEvent("keydown", {
    key: "ArrowRight",
    bubbles: true,
    cancelable: true,
  });
  act(() => outside.dispatchEvent(key));
  expect(key.defaultPrevented).toBe(false);
  const dialog = host.querySelector<HTMLElement>(".eppt-present")!;
  act(() =>
    dialog.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "ArrowRight",
        bubbles: true,
        cancelable: true,
      }),
    ),
  );
  expect(host.querySelector(".eppt-present-count")!.textContent).toContain(
    "2 / 2",
  );
  expect(presence).not.toHaveBeenCalled();
  act(() =>
    dialog.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    ),
  );
  expect(host.querySelector(".eppt-present")).toBeNull();
  expect(writes).toBe(0);
  outside.remove();
  c.dispose();
  doc.destroy();
});
it("updates interface copy when locale changes and leaves the document mounted", () => {
  const doc = createYDocument(createPresentation());
  const writes = vi.fn();
  doc.on("update", writes);
  act(() => root.render(<PresentationWorkspace document={doc} locale="zh" />));
  expect(host.querySelector('[aria-label="开始放映"]')).not.toBeNull();
  expect(host.querySelector(".eppt-workspace")?.getAttribute("lang")).toBe(
    "zh-CN",
  );
  act(() =>
    root.render(
      <PresentationWorkspace
        document={doc}
        locale="en"
        messages={{ "toolbar.present": "Play" }}
      />,
    ),
  );
  expect(host.querySelector('[aria-label="Play"]')).not.toBeNull();
  expect(host.querySelector('[aria-label="Undo"]')).not.toBeNull();
  expect(host.querySelector(".eppt-workspace")?.getAttribute("lang")).toBe(
    "en",
  );
  act(() => root.render(<PresentationWorkspace document={doc} locale="ja" />));
  expect(host.querySelector('[aria-label="Start slideshow"]')).not.toBeNull();
  expect(counters.mounts).toBe(1);
  expect(writes).not.toHaveBeenCalled();
  doc.destroy();
});

it("keeps fit zoom stable while hidden and measures the restored canvas without content writes", () => {
  const doc = createYDocument(createPresentation()),
    writes = vi.fn();
  doc.on("update", writes);
  act(() => root.render(<PresentationWorkspace document={doc} />));
  const canvas = host.querySelector<HTMLElement>(".eppt-canvas-area")!;
  let width = 636,
    height = 730;
  Object.defineProperty(canvas, "clientWidth", { get: () => width });
  Object.defineProperty(canvas, "clientHeight", { get: () => height });
  const zoom = () =>
    host.querySelector<HTMLInputElement>('[aria-label="缩放"]')!.value;
  act(() => window.dispatchEvent(new Event("resize")));
  expect(zoom()).toBe("45%");
  width = 0;
  height = 0;
  act(() => window.dispatchEvent(new Event("resize")));
  expect(zoom()).toBe("45%");
  width = 804;
  height = 600;
  act(() => window.dispatchEvent(new Event("focus")));
  expect(zoom()).toBe("58%");
  expect(writes).not.toHaveBeenCalled();
  doc.destroy();
});

it("opens the SVG zoom menu without changing scale and applies presets or fit without content writes", () => {
  const doc = createYDocument(createPresentation()),
    writes = vi.fn();
  doc.on("update", writes);
  act(() => root.render(<PresentationWorkspace document={doc} />));
  const canvas = host.querySelector<HTMLElement>(".eppt-canvas-area")!;
  Object.defineProperty(canvas, "clientWidth", { value: 636 });
  Object.defineProperty(canvas, "clientHeight", { value: 730 });
  act(() => window.dispatchEvent(new Event("resize")));
  const zoom = () =>
    host.querySelector<HTMLInputElement>('[aria-label="缩放"]')!.value;
  const open = () =>
    act(() =>
      host.querySelector<HTMLButtonElement>('[aria-label="缩放选项"]')!.click(),
    );
  const choose = (label: string) =>
    act(() =>
      [...host.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]')]
        .find((button) => button.textContent === label)!
        .click(),
    );
  const trigger = host.querySelector<HTMLButtonElement>(
    '[aria-label="缩放选项"]',
  )!;
  expect(trigger.querySelector("svg path")).not.toBeNull();
  expect(trigger.textContent).toBe("");
  open();
  expect(zoom()).toBe("45%");
  expect(
    host.querySelector('[role="menu"][aria-label="缩放选项"]'),
  ).not.toBeNull();
  choose("100%");
  expect(zoom()).toBe("100%");
  expect(trigger.getAttribute("aria-expanded")).toBe("false");
  open();
  expect(
    [...host.querySelectorAll('[aria-checked="true"]')].some(
      (node) => node.textContent === "100%✓",
    ),
  ).toBe(true);
  choose("适应画布");
  expect(zoom()).toBe("45%");
  expect(writes).not.toHaveBeenCalled();
  doc.destroy();
});

it.each([false, true])(
  "controls comment backgrounds independently of selection and marker callbacks (readonly=%s)",
  (readOnly) => {
    const doc = createYDocument(createPresentation()),
      controller = new EditorController(doc);
    const slideId = readDocument(doc).slideOrder[0],
      textId = readDocument(doc).slides[slideId].elementOrder[0];
    const tableId = controller.add(slideId, "table");
    controller.patch(slideId, tableId, {
      transform: { x: pxToEmu(600), y: pxToEmu(350), rotation: 15 },
    });
    controller.history.clear();
    const snapshot = Y.encodeStateAsUpdate(doc),
      writes = vi.fn(),
      presence = vi.fn();
    doc.on("update", writes);
    const ref = createRef<PresentationWorkspaceHandle>();
    const markers: CommentMarker[] = [
      {
        id: "multi",
        anchor: {
          type: "elements",
          slideId,
          elementIds: [textId, tableId, textId, "deleted"],
        },
      },
      { id: "table", anchor: { type: "element", slideId, elementId: tableId } },
      { id: "page", anchor: { type: "slide", slideId } },
    ];
    const render = (
      activeCommentId?: string | null,
      callback?: (candidates: CommentMarker[]) => void,
      commentMarkers = markers,
    ) =>
      act(() =>
        root.render(
          <PresentationWorkspace
            document={doc}
            ref={ref}
            readOnly={readOnly}
            commentMarkers={commentMarkers}
            activeCommentId={activeCommentId}
            onCommentAnchorClick={callback}
            onPresence={presence}
          />,
        ),
      );
    const regions = () => [
      ...host.querySelectorAll<HTMLElement>(".eppt-comment-highlight-region"),
    ];
    render();
    presence.mockClear(); // Existing readonly mount clears presence before activation.
    render("multi");
    expect(regions().map((node) => node.dataset.elementId)).toEqual([
      textId,
      tableId,
    ]);
    const table = readDocument(doc).slides[slideId].elements[tableId];
    expect(regions()[1].style.width).toBe(
      `${emuToPx(table.transform.width)}px`,
    );
    expect(regions()[1].style.transform).toBe("rotate(15deg)");
    expect(ref.current!.getSelection()).toBeNull();
    expect(host.querySelectorAll(".eppt-comment-marker")).toHaveLength(0);
    const oldCallback = vi.fn(),
      latestCallback = vi.fn();
    render(null, oldCallback);
    expect(regions()).toHaveLength(0);
    render(null, latestCallback);
    act(() =>
      host.querySelector<HTMLButtonElement>(".eppt-comment-marker")!.click(),
    );
    expect(latestCallback).toHaveBeenCalledExactlyOnceWith(markers);
    expect(oldCallback).not.toHaveBeenCalled();
    expect(regions()).toHaveLength(0); // The host decides which overlapping comment to activate.
    render("table", latestCallback);
    expect(regions().map((node) => node.dataset.elementId)).toEqual([tableId]);
    render("page");
    expect(regions()).toHaveLength(1);
    expect(regions()[0].style.width).toBe(
      `${emuToPx(readDocument(doc).size.width)}px`,
    );
    render("missing");
    expect(regions()).toHaveLength(0);
    render("table", undefined, []);
    expect(regions()).toHaveLength(0);
    render(undefined);
    expect(regions()).toHaveLength(0);
    expect(writes).not.toHaveBeenCalled();
    expect(presence).not.toHaveBeenCalled();
    expect(controller.history.undoStack).toHaveLength(0);
    expect(Y.encodeStateAsUpdate(doc)).toEqual(snapshot);
    expect(counters.mounts).toBe(1);
    controller.dispose();
    doc.destroy();
  },
);

it("follows remote anchor geometry and partial deletions without an echo or stale highlight", () => {
  const doc = createYDocument(createPresentation()),
    controller = new EditorController(doc);
  const slideId = readDocument(doc).slideOrder[0],
    textId = readDocument(doc).slides[slideId].elementOrder[0];
  const tableId = controller.add(slideId, "table"),
    second = controller.addSlide();
  const secondId = controller.add(second, "text");
  controller.history.clear();
  const peer = new Y.Doc();
  Y.applyUpdate(peer, Y.encodeStateAsUpdate(doc), "bootstrap");
  const remoteController = new EditorController(peer),
    writes = vi.fn();
  peer.on("update", (update) => Y.applyUpdate(doc, update, "remote-test"));
  doc.on("update", writes);
  const ref = createRef<PresentationWorkspaceHandle>();
  const markers: CommentMarker[] = [
    {
      id: "multi",
      anchor: { type: "elements", slideId, elementIds: [textId, tableId] },
    },
    {
      id: "second",
      anchor: { type: "element", slideId: second, elementId: secondId },
    },
    { id: "text", anchor: controller.find("EPPT")[0].anchor },
  ];
  const render = (activeCommentId: string, document = doc) =>
    act(() =>
      root.render(
        <PresentationWorkspace
          document={document}
          ref={ref}
          commentMarkers={markers}
          activeCommentId={activeCommentId}
          readOnly
        />,
      ),
    );
  const regions = () => [
    ...host.querySelectorAll<HTMLElement>(".eppt-comment-highlight-region"),
  ];
  render("text");
  expect(regions().map((node) => node.dataset.elementId)).toEqual([textId]);
  render("multi");
  act(() =>
    remoteController.patch(slideId, tableId, {
      transform: { x: pxToEmu(720), width: pxToEmu(310) },
    }),
  );
  expect(regions()[1].style.left).toBe("720px");
  expect(regions()[1].style.width).toBe("310px");
  act(() => remoteController.remove(slideId, [textId]));
  expect(regions().map((node) => node.dataset.elementId)).toEqual([tableId]);
  render("text");
  expect(regions()).toHaveLength(0);
  render("multi");
  act(() => remoteController.remove(slideId, [tableId]));
  expect(regions()).toHaveLength(0);
  expect(writes).toHaveBeenCalledTimes(3);
  expect(writes.mock.calls.every((call) => call[1] === "remote-test")).toBe(
    true,
  );
  expect(controller.history.undoStack).toHaveLength(0);
  render("second");
  expect(regions()).toHaveLength(0);
  act(() => {
    expect(ref.current!.revealAnchor(markers[1].anchor)).toBe(true);
  });
  expect(regions().map((node) => node.dataset.elementId)).toEqual([secondId]);
  expect(writes).toHaveBeenCalledTimes(3);
  act(() => remoteController.deleteSlide(second));
  expect(regions()).toHaveLength(0);
  expect(writes).toHaveBeenCalledTimes(4);
  const other = createYDocument(createPresentation());
  render("second", other);
  expect(regions()).toHaveLength(0);
  controller.dispose();
  remoteController.dispose();
  doc.destroy();
  peer.destroy();
  other.destroy();
});
