// @vitest-environment jsdom
import {
  act,
  createRef,
  forwardRef,
  useEffect,
  useImperativeHandle,
} from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { createPresentation } from "../model/create";
import { createYDocument, readDocument } from "../collaboration/yjs-codec";
import { EditorController } from "../model/controller";
import {
  PresentationWorkspace,
  type PresentationWorkspaceHandle,
} from "./PresentationWorkspace";
const counters = vi.hoisted(() => ({ mounts: 0 }));
vi.mock("./PresentationEditor", () => ({
  usePresentation: readDocument,
  ElementContent: () => null,
  PresentationEditor: forwardRef(function Fake(props: any, ref) {
    useEffect(() => {
      counters.mounts++;
    }, []);
    useImperativeHandle(ref, () => ({
      exportPng: async () => new Blob(["png"]),
    }));
    return (
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
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});
it.each([
  ["embedded", false], ["embedded", true], ["demo", false], ["demo", true],
] as const)("leaves search UI and shortcuts to the host (%s, readonly=%s)", (chrome, readOnly) => {
  const doc = createYDocument(createPresentation()), ref = createRef<PresentationWorkspaceHandle>();
  const writes = vi.fn(), received = vi.fn();
  doc.on("update", writes);
  act(() => root.render(<PresentationWorkspace document={doc} chrome={chrome} readOnly={readOnly} ref={ref} />));
  expect([...host.querySelectorAll("button")].some(button => button.textContent?.includes("查找"))).toBe(false);
  expect(host.querySelector('[aria-label="查找文本"]')).toBeNull();
  window.addEventListener("keydown", received);
  try {
    for (const target of [host.querySelector(".eppt-workspace")!, host.querySelector("textarea")!, host.querySelector('[data-test="select"]')!]) {
      for (const modifier of [{ctrlKey: true}, {metaKey: true}]) {
        const event = new KeyboardEvent("keydown", {key: "f", ...modifier, bubbles: true, cancelable: true});
        act(() => target.dispatchEvent(event));
        expect(event.defaultPrevented).toBe(false);
      }
    }
    expect(received).toHaveBeenCalledTimes(6);
    const controller = new EditorController(doc);
    controller.setReadOnly(readOnly);
    const match = controller.find("EPPT")[0];
    expect(match).toBeDefined();
    act(() => { expect(ref.current!.revealAnchor(match.anchor)).toBe(true); });
    expect(writes).not.toHaveBeenCalled();
    expect(counters.mounts).toBe(1);
    controller.dispose();
  } finally {
    window.removeEventListener("keydown", received);
    doc.destroy();
  }
});
it("embedded toolbar flattens presentation, history and page settings without remounting", () => {
  const doc = createYDocument(createPresentation());
  const writes = vi.fn();
  doc.on("update", writes);
  const render = (readOnly = false) => act(() => root.render(<PresentationWorkspace document={doc} chrome="embedded" readOnly={readOnly} />));
  render();
  const toolbar = host.querySelector(".eppt-toolbar")!;
  expect(toolbar.querySelector('.eppt-flat-tools > button')?.getAttribute("aria-label")).toBe("开始放映");
  expect(toolbar.querySelector('[aria-label="编辑"]')).toBeNull();
  expect(toolbar.querySelector('[aria-label="设计"]')).toBeNull();
  expect(toolbar.querySelector('[aria-label="撤销"]')).not.toBeNull();
  expect(toolbar.querySelector('[aria-label="重做"]')).not.toBeNull();
  expect(toolbar.querySelector('[aria-label="页面背景"]')).not.toBeNull();
  expect(writes).not.toHaveBeenCalled();
  const size = toolbar.querySelector<HTMLSelectElement>('[aria-label="页面尺寸"]')!;
  act(() => {size.value = "standard"; size.dispatchEvent(new Event("change", {bubbles: true}));});
  render();
  expect(size.value).toBe("standard");
  expect(writes).toHaveBeenCalledTimes(1);
  act(() => toolbar.querySelector<HTMLButtonElement>('[aria-label="撤销"]')!.click());
  render();
  expect(size.value).toBe("wide");
  act(() => toolbar.querySelector<HTMLButtonElement>('[aria-label="重做"]')!.click());
  render();
  expect(size.value).toBe("standard");
  expect(counters.mounts).toBe(1);
  render(true);
  expect(toolbar.querySelector<HTMLButtonElement>('[aria-label="撤销"]')!.disabled).toBe(true);
  expect(size.disabled).toBe(true);
  expect(toolbar.querySelector<HTMLButtonElement>('[aria-label="开始放映"]')!.disabled).toBe(false);
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
  act(() =>
    root.render(<PresentationWorkspace document={doc} locale="zh" />),
  );
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
  act(() =>
    root.render(<PresentationWorkspace document={doc} locale="ja" />),
  );
  expect(host.querySelector('[aria-label="Start slideshow"]')).not.toBeNull();
  expect(counters.mounts).toBe(1);
  expect(writes).not.toHaveBeenCalled();
  doc.destroy();
});
