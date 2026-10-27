// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { CommentHighlight } from "./CommentHighlight";
import { createPresentation } from "../model/create";
import { createYDocument } from "../collaboration/yjs-codec";
import { pxToEmu } from "../model/types";

it("tracks live drag/resize/rotation only while interacting and cancels its frame on removal", () => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  let frame: FrameRequestCallback | undefined;
  const request = vi.fn((callback: FrameRequestCallback) => {
    frame = callback;
    return 19;
  });
  const cancel = vi.fn();
  vi.stubGlobal("requestAnimationFrame", request);
  vi.stubGlobal("cancelAnimationFrame", cancel);
  const model = createPresentation(),
    slideId = model.slideOrder[0],
    elementId = model.slides[slideId].elementOrder[0];
  const doc = createYDocument(model),
    base = model.slides[slideId].elements[elementId].transform;
  const writes = vi.fn();
  doc.on("update", writes);
  let live = base;
  const getTransform = () => live,
    host = document.createElement("div"),
    root = createRoot(host);
  const render = (interacting: boolean) =>
    act(() =>
      root.render(
        <CommentHighlight
          document={doc}
          anchor={{ type: "element", slideId, elementId }}
          slideId={slideId}
          getTransform={getTransform}
          interacting={interacting}
        />,
      ),
    );
  try {
    render(false);
    expect(request).not.toHaveBeenCalled();
    render(true);
    const region = host.querySelector<HTMLElement>(
      ".eppt-comment-highlight-region",
    )!;
    live = {
      ...base,
      x: pxToEmu(90),
      y: pxToEmu(100),
      width: pxToEmu(220),
      height: pxToEmu(80),
      rotation: 30,
    };
    act(() => frame?.(0));
    expect(region.style.left).toBe("90px");
    expect(region.style.width).toBe("220px");
    expect(region.style.transform).toBe("rotate(30deg)");
    live = base;
    render(false);
    const count = request.mock.calls.length;
    act(() => root.render(null));
    expect(request).toHaveBeenCalledTimes(count);
    expect(cancel).toHaveBeenCalledWith(19);
    expect(writes).not.toHaveBeenCalled();
  } finally {
    act(() => root.unmount());
    doc.destroy();
    vi.unstubAllGlobals();
  }
});
