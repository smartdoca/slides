// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { CommentPin } from "./CommentPin";
import { pxToEmu } from "../model/types";

it("follows transient movement/rotation, returns to committed geometry and cancels frames", () => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  let frame: FrameRequestCallback | undefined;
  vi.stubGlobal("requestAnimationFrame", vi.fn((callback: FrameRequestCallback) => { frame = callback; return 17; }));
  const cancel = vi.fn();
  vi.stubGlobal("cancelAnimationFrame", cancel);
  const host = document.createElement("div"), root = createRoot(host);
  const base = {x: pxToEmu(10), y: pxToEmu(20), width: pxToEmu(100), height: pxToEmu(50), rotation: 0};
  let live = { ...base };
  const getTransform = () => live;
  const render = (interacting: boolean) => act(() => root.render(
    <CommentPin transforms={[base]} elementIds={["e"]} getTransform={getTransform}
      interacting={interacting} onClick={() => {}}>comment</CommentPin>));
  try {
    render(true);
    const button = host.querySelector("button")!;
    expect(button.style.left).toBe("110px");
    live = { ...base, x: pxToEmu(80), y: pxToEmu(100) };
    act(() => frame?.(0));
    expect(button.style.left).toBe("180px");
    expect(button.style.top).toBe("100px");
    live = { ...live, rotation: 90 };
    act(() => frame?.(0));
    expect(parseFloat(button.style.left)).toBeCloseTo(80);
    expect(button.style.pointerEvents).toBe("none");
    live = base;
    render(false);
    expect(button.style.left).toBe("110px");
    expect(button.style.pointerEvents).toBe("");
    expect(cancel).toHaveBeenCalledWith(17);
  } finally { act(() => root.unmount()); vi.unstubAllGlobals(); }
});
