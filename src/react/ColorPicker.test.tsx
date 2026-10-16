// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ColorHistoryProvider, ColorPicker } from "./ColorPicker";
import { createTranslator, I18nProvider } from "../i18n";

let root: Root, host: HTMLDivElement;
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.ResizeObserver = class {
    observe() {}
    disconnect() {}
  } as any;
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});
const click = (selector: string) =>
  act(() => host.querySelector<HTMLButtonElement>(selector)!.click());

it("shares recent colors across pickers and opening/closing never applies a color", () => {
  const change = vi.fn();
  act(() =>
    root.render(
      <ColorHistoryProvider>
        <ColorPicker label="Fill" onChange={change} clearable />
        <ColorPicker label="Outline" onChange={change} />
      </ColorHistoryProvider>,
    ),
  );
  click('[aria-label="Fill"]');
  expect(change).not.toHaveBeenCalled();
  expect(host.querySelectorAll('[aria-label="基础色"] button')).toHaveLength(
    32,
  );
  click('[aria-label="基础色"] [aria-label="#3370ff"]');
  expect(change).toHaveBeenCalledExactlyOnceWith("#3370ff");
  click('[aria-label="Outline"]');
  expect(
    host.querySelector(
      '[aria-label="幻灯片使用过的颜色"] [aria-label="#3370ff"]',
    ),
  ).not.toBeNull();
  act(() =>
    host
      .querySelector('[aria-label="Outline"]')!
      .dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      ),
  );
  expect(host.querySelector(".eppt-color-popover")).toBeNull();
  expect(change).toHaveBeenCalledTimes(1);
  expect(document.activeElement).toBe(
    host.querySelector('[aria-label="Outline"]'),
  );
});
it("keeps invalid custom color errors visible, accepts valid hex, supports no fill and closes on readonly", () => {
  const change = vi.fn();
  const render = (disabled = false) =>
    act(() =>
      root.render(
        <ColorHistoryProvider>
          <ColorPicker
            label="填充"
            disabled={disabled}
            clearable
            onChange={change}
          />
        </ColorHistoryProvider>,
      ),
    );
  render();
  click('[aria-label="填充"]');
  const edit = (value: string) => {
    const input = host.querySelector<HTMLInputElement>("input")!;
    act(() => input.focus());
    act(() => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )!.set!.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    act(() =>
      input.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
      ),
    );
  };
  click(".eppt-more-colors");
  edit("invalid");
  expect(change).not.toHaveBeenCalled();
  expect(host.querySelector('[role="alert"]')?.textContent).toBeTruthy();
  expect(host.querySelector(".eppt-color-popover")).not.toBeNull();
  edit("123ABC");
  expect(change).toHaveBeenCalledExactlyOnceWith("#123ABC");
  click('[aria-label="填充"]');
  click(".eppt-color-none");
  expect(change).toHaveBeenLastCalledWith(undefined);
  click('[aria-label="填充"]');
  render(true);
  expect(host.querySelector(".eppt-color-popover")).toBeNull();
  expect(
    host.querySelector<HTMLButtonElement>('[aria-label="填充"]')!.disabled,
  ).toBe(true);
});
it("supports arrow-key palette navigation and catalog overrides", () => {
  act(() =>
    root.render(
      <I18nProvider
        value={createTranslator("en", { "color.standard": "Brand colors" })}
      >
        <ColorPicker label="Fill" onChange={() => {}} />
      </I18nProvider>,
    ),
  );
  click('[aria-label="Fill"]');
  expect(host.querySelector('[aria-label="Brand colors"]')).not.toBeNull();
  const buttons = host.querySelectorAll<HTMLButtonElement>(
    '[aria-label="Brand colors"] button',
  );
  act(() => buttons[0].focus());
  act(() =>
    buttons[0].dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }),
    ),
  );
  expect(document.activeElement).toBe(buttons[8]);
});
