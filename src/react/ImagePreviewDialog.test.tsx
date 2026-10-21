// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { I18nProvider } from "../i18n";
import { ImagePreviewDialog } from "./ImagePreviewDialog";

const gallery = ["one", "two", "three"].map((id, index) => ({
  id,
  slideId: `slide-${index}`,
  elementId: id,
  assetId: `asset-${id}`,
  alt: id,
}));

it("navigates with buttons, horizontal wheel and fit-image drag, pans when zoomed, and traps keys/focus", () => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement("div"),
    root = createRoot(host),
    close = vi.fn(),
    resolve = vi.fn((id) => `/authorized/${id}`),
    shortcut = vi.fn();
  const trigger = document.createElement("button");
  document.body.append(host, trigger);
  trigger.focus();
  window.addEventListener("keydown", shortcut);
  function Test() {
    const [currentId, setCurrentId] = useState("one");
    return (
      <I18nProvider locale="en">
        <ImagePreviewDialog
          gallery={gallery}
          currentId={currentId}
          resolveAsset={resolve}
          onNavigate={setCurrentId}
          onClose={close}
        />
      </I18nProvider>
    );
  }
  const button = (label: string) =>
    document.body.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)!;
  const click = (label: string) => act(() => button(label).click());
  const key = (key: string, shiftKey = false) =>
    act(() =>
      document.body.querySelector('[role="dialog"]')!.dispatchEvent(
        new KeyboardEvent("keydown", {
          key,
          shiftKey,
          bubbles: true,
          cancelable: true,
        }),
      ),
    );
  const image = () =>
    document.body.querySelector<HTMLImageElement>(".eppt-image-preview img")!;
  const pointer = (type: string, x: number, y = 100) =>
    act(() => {
      const target = image();
      target.setPointerCapture = vi.fn();
      target.dispatchEvent(
        new MouseEvent(type, {
          bubbles: true,
          cancelable: true,
          button: 0,
          clientX: x,
          clientY: y,
        }),
      );
    });
  try {
    act(() => root.render(<Test />));
    expect(button("Previous image").disabled).toBe(true);
    expect(image().src).toContain("/authorized/asset-one");
    key("Tab", true);
    expect(document.activeElement).toBe(button("Next image"));
    click("Next image");
    expect(image().alt).toBe("two");
    key("ArrowRight");
    expect(image().alt).toBe("three");
    expect(button("Next image").disabled).toBe(true);
    const wheel = new WheelEvent("wheel", {
      deltaX: -120,
      cancelable: true,
      bubbles: true,
    });
    act(() =>
      document.body
        .querySelector(".eppt-image-preview-viewport")!
        .dispatchEvent(wheel),
    );
    expect(wheel.defaultPrevented).toBe(true);
    expect(image().alt).toBe("two");
    pointer("pointerdown", 200);
    pointer("pointermove", 100);
    pointer("pointerup", 100);
    expect(image().alt).toBe("three");
    click("Zoom in");
    expect(image().style.transform).toContain("scale(1.25)");
    const calls = resolve.mock.calls.length;
    pointer("pointerdown", 200);
    pointer("pointermove", 100, 130);
    pointer("pointerup", 100, 130);
    expect(image().alt).toBe("three");
    expect(image().style.transform).toContain("translate(-100px, 30px)");
    expect(resolve).toHaveBeenCalledTimes(calls);
    key("0");
    expect(image().style.transform).toBe("translate(0px, 0px) scale(1)");
    key("Escape");
    expect(close).toHaveBeenCalledTimes(1);
    expect(shortcut).not.toHaveBeenCalled();
    act(() => root.unmount());
    expect(document.activeElement).toBe(trigger);
  } finally {
    window.removeEventListener("keydown", shortcut);
    act(() => root.unmount());
    host.remove();
    trigger.remove();
  }
});

it("shows an authorized-resource error, retries its resolver and updates locale without replacing the view", () => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement("div"),
    root = createRoot(host);
  document.body.append(host);
  let allowed = false;
  const resolve = vi.fn(() => {
    if (!allowed) throw new Error("denied");
    return "/authorized/image.png";
  });
  const render = (locale: string) =>
    act(() =>
      root.render(
        <I18nProvider locale={locale}>
          <ImagePreviewDialog
            gallery={gallery}
            currentId="one"
            resolveAsset={resolve}
            onNavigate={() => {}}
            onClose={() => {}}
          />
        </I18nProvider>,
      ),
    );
  try {
    render("zh");
    const dialog = document.body.querySelector('[role="dialog"]');
    expect(dialog!.textContent).toContain("暂不可用");
    expect(dialog!.querySelector("img")).toBeNull();
    allowed = true;
    act(() =>
      [...dialog!.querySelectorAll("button")]
        .find((button) => button.textContent === "重试图片")!
        .click(),
    );
    expect(dialog!.querySelector("img")!.getAttribute("src")).toBe(
      "/authorized/image.png",
    );
    render("en");
    expect(document.body.querySelector('[role="dialog"]')).toBe(dialog);
    expect(dialog!.getAttribute("aria-label")).toBe("Preview image");
    act(() => dialog!.querySelector("img")!.dispatchEvent(new Event("error")));
    expect(dialog!.textContent).toContain("is unavailable");
  } finally {
    act(() => root.unmount());
    host.remove();
  }
});
