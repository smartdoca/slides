// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { SectionHeading } from "./SectionHeading";

let host: HTMLDivElement, root: Root;
const rename = vi.fn(),
  remove = vi.fn(),
  toggle = vi.fn();
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  rename.mockReset();
  remove.mockReset();
  toggle.mockReset();
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});
const render = (disabled = false, name = "正文") =>
  act(() =>
    root.render(
      <SectionHeading
        id="s"
        startId="p"
        name={name}
        folded={false}
        disabled={disabled}
        dropping={false}
        onToggle={toggle}
        onRename={rename}
        onDelete={remove}
      />,
    ),
  );
function edit(value: string) {
  act(() =>
    host.querySelector<HTMLButtonElement>(".eppt-section-title")!.click(),
  );
  const input = host.querySelector("input")!;
  act(() => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  return input;
}
function key(input: HTMLElement, key: string, isComposing = false) {
  act(() =>
    input.dispatchEvent(
      new KeyboardEvent("keydown", {
        key,
        isComposing,
        bubbles: true,
        cancelable: true,
      }),
    ),
  );
}
it("edits in place, preserves Chinese composition, commits Enter/blur and cancels Escape", () => {
  render();
  let input = edit("新正文");
  expect(input.closest(".eppt-section-heading")).not.toBeNull();
  expect(host.querySelector("form")).toBeNull();
  key(input, "Enter", true);
  expect(rename).not.toHaveBeenCalled();
  key(input, "Enter");
  expect(rename).toHaveBeenCalledExactlyOnceWith("新正文");
  expect(host.querySelector("input")).toBeNull();
  rename.mockClear();
  input = edit("放弃");
  key(input, "Escape");
  expect(rename).not.toHaveBeenCalled();
  expect(host.querySelector("input")).toBeNull();
  input = edit("失焦保存");
  act(() => input.blur());
  expect(rename).toHaveBeenCalledExactlyOnceWith("失焦保存");
});
it("validates blank names and readonly cancels drafts without writing", () => {
  render();
  const input = edit(" ");
  key(input, "Enter");
  expect(rename).not.toHaveBeenCalled();
  expect(host.querySelector("[role=alert]")?.textContent).toBe(
    "请输入分节名称",
  );
  render(true);
  expect(host.querySelector("input")).toBeNull();
  expect(
    host.querySelector<HTMLButtonElement>(".eppt-section-title")!.disabled,
  ).toBe(true);
  expect(
    host.querySelector<HTMLButtonElement>(".eppt-section-more")!.disabled,
  ).toBe(true);
  act(() =>
    host.querySelector<HTMLButtonElement>(".eppt-section-toggle")!.click(),
  );
  expect(toggle).toHaveBeenCalledTimes(1);
  expect(rename).not.toHaveBeenCalled();
});
it("does not overwrite a remote rename when the local draft was never changed", () => {
  render();
  const input = edit("正文");
  render(false, "远端新名称");
  act(() => input.blur());
  expect(rename).not.toHaveBeenCalled();
  expect(host.querySelector(".eppt-section-title")?.textContent).toBe("远端新名称");
});
it("opens a keyboard accessible menu and explicitly deletes organization only", () => {
  render();
  act(() =>
    host.querySelector<HTMLButtonElement>(".eppt-section-more")!.click(),
  );
  const menu = document.querySelector("[role=menu]")!;
  const buttons = menu.querySelectorAll<HTMLButtonElement>("button");
  expect(document.activeElement).toBe(buttons[0]);
  key(buttons[0], "ArrowDown");
  expect(document.activeElement).toBe(buttons[1]);
  expect(buttons[1].textContent).toBe("删除分节（保留幻灯片）");
  act(() => buttons[1].click());
  expect(remove).toHaveBeenCalledTimes(1);
  expect(document.querySelector("[role=menu]")).toBeNull();
});
