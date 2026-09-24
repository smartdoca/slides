// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { ResourceImage } from "./ResourceImage";
it("localizes resolver/load errors, retries and retains stable model identity", () => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement("div"),
    root = createRoot(host),
    el = {
      id: "image",
      type: "image" as const,
      assetId: "stable",
      transform: { x: 0, y: 0, width: 1, height: 1, rotation: 0 },
    };
  let available = false;
  const resolver = vi.fn(() => {
    if (!available) throw Error("no access");
    return "/allowed-image.png";
  });
  act(() =>
    root.render(<ResourceImage element={el} resolveAsset={resolver} />),
  );
  expect(host.textContent).toContain("暂不可用");
  available = true;
  act(() => host.querySelector("button")!.click());
  expect(host.querySelector("img")!.getAttribute("src")).toBe(
    "/allowed-image.png",
  );
  act(() => host.querySelector("img")!.dispatchEvent(new Event("error")));
  expect(host.textContent).toContain("重试图片");
  expect(el.assetId).toBe("stable");
  available = false;
  act(() => root.render(<button><ResourceImage element={el} resolveAsset={resolver} interactive={false} /></button>));
  expect(host.querySelectorAll("button")).toHaveLength(1);
  expect(host.textContent).toContain("暂不可用");
  act(() => root.unmount());
});
