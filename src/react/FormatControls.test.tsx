// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { FontMenu } from "./FormatControls";
import { ColorPicker } from "./ColorPicker";

it("searching fonts, dismissing and readonly changes don't format the document; choosing applies once", () => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.ResizeObserver = class {
    observe() {}
    disconnect() {}
  } as any;
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host),
    change = vi.fn();
  const render = (disabled = false) =>
    act(() =>
      root.render(
        <FontMenu
          value="Arial"
          used={["Arial"]}
          onChange={change}
          disabled={disabled}
        />,
      ),
    );
  const click = (selector: string) =>
    act(() => host.querySelector<HTMLButtonElement>(selector)!.click());
  try {
    render();
    const trigger =
      host.querySelector<HTMLButtonElement>('[aria-label="字体"]')!;
    act(() =>
      trigger.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }),
      ),
    );
    const input = host.querySelector<HTMLInputElement>("input")!;
    expect(document.activeElement).toBe(input);
    act(() => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )!.set!.call(input, "思源宋");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(
      [...host.querySelectorAll('[role="menuitemradio"]')].map(
        (el) => el.textContent,
      ),
    ).toEqual(["思源宋体"]);
    expect(change).not.toHaveBeenCalled();
    click('[role="menuitemradio"]');
    expect(change).toHaveBeenCalledExactlyOnceWith("Source Han Serif SC");
    click('[aria-label="字体"]');
    act(() =>
      host
        .querySelector('[role="menu"]')!
        .dispatchEvent(
          new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
        ),
    );
    expect(document.activeElement).toBe(trigger);
    expect(host.querySelector('[role="menu"]')).toBeNull();
    click('[aria-label="字体"]');
    render(true);
    expect(host.querySelector('[role="menu"]')).toBeNull();
    expect(change).toHaveBeenCalledTimes(1);
  } finally {
    act(() => root.unmount());
    host.remove();
  }
});
it("font color and highlight tabs write to the right mark and allow clearing highlight", () => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.ResizeObserver = class {
    observe() {}
    disconnect() {}
  } as any;
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host),
    font = vi.fn(),
    highlight = vi.fn();
  const click = (selector: string) =>
    act(() => host.querySelector<HTMLButtonElement>(selector)!.click());
  try {
    act(() =>
      root.render(
        <ColorPicker
          label="字色"
          value="#1f2329"
          onChange={font}
          onHighlightChange={highlight}
        />,
      ),
    );
    click('[aria-label="字色"]');
    click('[role="tab"][aria-selected="false"]');
    click('[aria-label="基础色"] [aria-label="#fff3b0"]');
    expect(highlight).toHaveBeenCalledExactlyOnceWith("#fff3b0");
    expect(font).not.toHaveBeenCalled();
    click('[aria-label="字色"]');
    click(".eppt-color-none");
    expect(highlight).toHaveBeenLastCalledWith(undefined);
  } finally {
    act(() => root.unmount());
    host.remove();
  }
});
