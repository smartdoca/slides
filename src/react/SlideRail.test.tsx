// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { SlideRail } from "./SlideRail";
import { createPresentation } from "../model/create";
import { EditorController } from "../model/controller";
import { createYDocument, readDocument } from "../collaboration/yjs-codec";
import { emuToPx } from "../model/types";
vi.mock("./SlidePreview", () => ({
  SlidePreview: () => <span data-test="preview" />,
}));
let root: Root,
  host: HTMLDivElement,
  toolbar: HTMLDivElement,
  c: EditorController;
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.setPointerCapture = vi.fn();
  Element.prototype.hasPointerCapture = () => false;
  host = document.createElement("div");
  document.body.append(host);
  toolbar = document.createElement("div");
  document.body.append(toolbar);
  root = createRoot(host);
  c = new EditorController(createYDocument(createPresentation()));
  c.addSlide();
  c.addSlide();
  c.history.clear();
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  toolbar.remove();
  c.dispose();
  c.doc.destroy();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
it("scales previews to the available rail width without changing the document", () => {
  let width = 167,
    resize!: () => void;
  vi.spyOn(Element.prototype, "clientWidth", "get").mockImplementation(
    function (this: Element) {
      return this.classList.contains("eppt-thumb") ? width : 220;
    },
  );
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback: () => void) {
        resize = callback;
      }
      observe() {}
      disconnect() {}
    },
  );
  const writes = vi.fn();
  c.doc.on("update", writes);
  render();
  const fullWidth = emuToPx(readDocument(c.doc).size.width);
  const scale = () =>
    host.querySelector<HTMLElement>(".eppt-thumbnail > div")!.style.transform;
  expect(scale()).toBe(`scale(${167 / fullWidth})`);
  width = 152;
  act(() => resize());
  expect(scale()).toBe(`scale(${152 / fullWidth})`);
  width = 0;
  act(() => resize());
  expect(scale()).toBe(`scale(${152 / fullWidth})`);
  expect(writes).not.toHaveBeenCalled();
});
it("renders page actions only in the toolbar using the live multi-page selection", () => {
  const buttons = render(),
    before = readDocument(c.doc),
    writes = vi.fn();
  c.doc.on("update", writes);
  expect(
    [...host.querySelectorAll("button")].some(
      (b) => b.textContent === "新建分节" || b.textContent === "复制所选",
    ),
  ).toBe(false);
  expect(toolbar.querySelectorAll("button")).toHaveLength(2);
  act(() =>
    buttons[2].dispatchEvent(
      new MouseEvent("click", { bubbles: true, shiftKey: true }),
    ),
  );
  const copy = [...toolbar.querySelectorAll("button")].find(
    (b) => b.textContent === "复制所选",
  )!;
  expect(copy.title).toContain("3 页");
  expect(writes).not.toHaveBeenCalled();
  act(() => copy.click());
  expect(readDocument(c.doc).slideOrder).toHaveLength(6);
  expect(writes).toHaveBeenCalledTimes(1);
  c.undo();
  expect(readDocument(c.doc)).toEqual(before);
});
it("unmounts offscreen previews while retaining drag and keyboard targets without writes", () => {
  let notify!: (entries: any[]) => void;
  const disconnect = vi.fn();
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(callback: typeof notify) {
        notify = callback;
      }
      observe() {}
      disconnect = disconnect;
    },
  );
  const writes = vi.fn();
  c.doc.on("update", writes);
  render();
  const rows = host.querySelectorAll("[data-slide-id]");
  expect(rows).toHaveLength(3);
  expect(host.querySelectorAll('[data-test="preview"]')).toHaveLength(1);
  act(() => notify([{ target: rows[2], isIntersecting: true }]));
  expect(host.querySelectorAll('[data-test="preview"]')).toHaveLength(2);
  act(() => notify([{ target: rows[2], isIntersecting: false }]));
  expect(host.querySelectorAll('[data-test="preview"]')).toHaveLength(1);
  expect(host.querySelectorAll(".eppt-thumb")).toHaveLength(3);
  expect(writes).not.toHaveBeenCalled();
});
function render(disabled = false) {
  const value = readDocument(c.doc);
  act(() =>
    root.render(
      <SlideRail
        value={value}
        active={value.slideOrder[0]}
        disabled={disabled}
        controller={c}
        select={() => {}}
        collapsed={false}
        toolbarContainer={toolbar}
      />,
    ),
  );
  const rect = (top: number, height: number) => ({
    left: 0,
    right: 220,
    top,
    bottom: top + height,
    width: 220,
    height,
    x: 0,
    y: top,
    toJSON: () => ({}),
  });
  host.querySelector("aside")!.getBoundingClientRect = () => rect(0, 500);
  [...host.querySelectorAll<HTMLElement>("[data-slide-id]")].forEach(
    (r, i) => (r.getBoundingClientRect = () => rect(i * 120, 110)),
  );
  [...host.querySelectorAll<HTMLElement>("[data-section-start]")].forEach(
    (r) =>
      (r.getBoundingClientRect = () =>
        rect(value.slideOrder.indexOf(r.dataset.sectionStart!) * 120 - 8, 8)),
  );
  return host.querySelectorAll<HTMLButtonElement>(".eppt-thumb");
}
function pointer(button: HTMLButtonElement, type: string, y: number) {
  act(() =>
    button.dispatchEvent(
      new MouseEvent(type, {
        bubbles: true,
        clientX: 100,
        clientY: y,
        button: 0,
      }),
    ),
  );
}
it("pointer drag commits one reorder and is undone in one step", () => {
  const before = readDocument(c.doc).slideOrder,
    buttons = render();
  pointer(buttons[2], "pointerdown", 290);
  expect(buttons[2].getAttribute("aria-pressed")).toBe("true");
  expect(buttons[0].getAttribute("aria-pressed")).toBe("false");
  pointer(buttons[2], "pointermove", 10);
  expect(readDocument(c.doc).slideOrder).toEqual(before);
  expect(host.querySelector(".drop-before")).not.toBeNull();
  pointer(buttons[2], "pointerup", 10);
  expect(readDocument(c.doc).slideOrder).toEqual([
    before[2],
    before[0],
    before[1],
  ]);
  c.undo();
  expect(readDocument(c.doc).slideOrder).toEqual(before);
});
it("cancelled drags and readonly changes do not write", () => {
  const before = readDocument(c.doc).slideOrder,
    buttons = render();
  const update = vi.fn();
  c.doc.on("update", update);
  pointer(buttons[2], "pointerdown", 290);
  pointer(buttons[2], "pointermove", 10);
  pointer(buttons[2], "pointercancel", 10);
  pointer(buttons[2], "pointerup", 10);
  const locked = render(true);
  pointer(locked[2], "pointerdown", 290);
  pointer(locked[2], "pointermove", 10);
  pointer(locked[2], "pointerup", 10);
  expect(update).not.toHaveBeenCalled();
  expect(readDocument(c.doc).slideOrder).toEqual(before);
});
it.each([false, true])(
  "dropping onto a section heading changes membership even when folded=%s",
  (folded) => {
    const ids = readDocument(c.doc).slideOrder;
    const section = c.createSection("测试分节", [ids[2]])!;
    c.history.clear();
    const buttons = render();
    if (folded)
      act(() =>
        host
          .querySelector<HTMLButtonElement>('[aria-expanded="true"]')!
          .click(),
      );
    const before = readDocument(c.doc),
      writes = vi.fn();
    c.doc.on("update", writes);
    pointer(buttons[1], "pointerdown", 155);
    pointer(buttons[1], "pointermove", 236);
    expect(
      host.querySelector(".eppt-section-heading.is-drop-target"),
    ).not.toBeNull();
    expect(writes).not.toHaveBeenCalled();
    pointer(buttons[1], "pointerup", 236);
    expect(readDocument(c.doc).slides[ids[1]].sectionId).toBe(section);
    expect(writes).toHaveBeenCalledTimes(1);
    c.undo();
    expect(readDocument(c.doc)).toEqual(before);
  },
);
it("dropping on section contents joins it, and dragging out removes membership atomically", () => {
  const ids = readDocument(c.doc).slideOrder;
  const section = c.createSection("测试分节", [ids[2]])!;
  c.history.clear();
  let buttons = render();
  pointer(buttons[1], "pointerdown", 155);
  pointer(buttons[1], "pointermove", 300);
  pointer(buttons[1], "pointerup", 300);
  expect(readDocument(c.doc).slideOrder).toEqual([ids[0], ids[2], ids[1]]);
  expect(readDocument(c.doc).slides[ids[1]].sectionId).toBe(section);
  const before = readDocument(c.doc);
  buttons = render();
  pointer(buttons[2], "pointerdown", 290);
  pointer(buttons[2], "pointermove", 10);
  pointer(buttons[2], "pointerup", 10);
  expect(readDocument(c.doc).slides[ids[1]].sectionId).toBeUndefined();
  c.undo();
  expect(readDocument(c.doc)).toEqual(before);
});
it("opens the section form beside the chosen page, cancels without writes and creates on submit", () => {
  const buttons = render(),
    writes = vi.fn();
  c.doc.on("update", writes);
  act(() => buttons[2].click());
  const open = () =>
    act(() =>
      [...toolbar.querySelectorAll<HTMLButtonElement>("button")]
        .find((b) => b.textContent === "新建分节")!
        .click(),
    );
  open();
  const form = host.querySelector<HTMLFormElement>(".eppt-section-form")!;
  expect(form.nextElementSibling?.getAttribute("data-slide-id")).toBe(
    readDocument(c.doc).slideOrder[2],
  );
  expect(
    form.querySelector(".eppt-section-form-actions button[type=submit]")
      ?.textContent,
  ).toBe("创建");
  act(() =>
    form.querySelector<HTMLButtonElement>('button[type="button"]')!.click(),
  );
  expect(host.querySelector("form")).toBeNull();
  expect(writes).not.toHaveBeenCalled();
  open();
  act(() =>
    host
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
  );
  expect(writes).toHaveBeenCalledTimes(1);
  expect(host.querySelector("form")).toBeNull();
  expect(
    readDocument(c.doc).slides[readDocument(c.doc).slideOrder[2]].sectionId,
  ).toBeTruthy();
});
it("shift selection batches copies and delete without leaking keyboard events to the canvas", () => {
  const buttons = render(),
    before = readDocument(c.doc);
  act(() =>
    buttons[2].dispatchEvent(
      new MouseEvent("click", { bubbles: true, shiftKey: true }),
    ),
  );
  expect(
    host.querySelectorAll('.eppt-thumb[aria-pressed="true"]'),
  ).toHaveLength(3);
  const writes = vi.fn();
  c.doc.on("update", writes);
  const leaked = vi.fn();
  window.addEventListener("keydown", leaked);
  act(() =>
    buttons[2].dispatchEvent(
      new KeyboardEvent("keydown", {
        bubbles: true,
        cancelable: true,
        key: "d",
        ctrlKey: true,
      }),
    ),
  );
  expect(readDocument(c.doc).slideOrder).toHaveLength(6);
  expect(writes).toHaveBeenCalledTimes(1);
  expect(leaked).not.toHaveBeenCalled();
  c.undo();
  expect(readDocument(c.doc)).toEqual(before);
  window.removeEventListener("keydown", leaked);
});
