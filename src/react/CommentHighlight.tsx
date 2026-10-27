import { useLayoutEffect, useRef } from "react";
import type * as Y from "yjs";
import { resolveAnchor, type CommentAnchor } from "../model/anchors";
import { readDocument } from "../collaboration/yjs-codec";
import { emuToPx, type Transform } from "../model/types";

/** A view overlay: never changes the element's native fill, selection or anchor. */
export function CommentHighlight({
  document,
  anchor,
  slideId,
  getTransform,
  interacting,
}: {
  document: Y.Doc;
  anchor: CommentAnchor;
  slideId: string;
  getTransform: (id: string) => Transform | null | undefined;
  interacting: boolean;
}) {
  const resolved = resolveAnchor(document, anchor);
  if (!resolved || resolved.slideId !== slideId) return null;
  const slide = readDocument(document).slides[slideId];
  const ids =
    "elementIds" in resolved
      ? resolved.elementIds
      : "elementId" in resolved
        ? [resolved.elementId]
        : null;
  const regions = ids
    ? ids.flatMap((id) => {
        const element = id ? slide.elements[id] : undefined;
        return element && element.visible !== false
          ? [{ id: element.id, transform: element.transform }]
          : [];
      })
    : [{ id: undefined, transform: resolved.transform }];
  return (
    <div className="eppt-comment-highlight" aria-hidden="true">
      {regions.map(({ id, transform }) => (
        <CommentRegion
          key={id ?? "slide"}
          elementId={id}
          transform={transform}
          getTransform={getTransform}
          interacting={interacting}
        />
      ))}
    </div>
  );
}

function CommentRegion({
  elementId,
  transform,
  getTransform,
  interacting,
}: {
  elementId?: string;
  transform: Transform;
  getTransform: (id: string) => Transform | null | undefined;
  interacting: boolean;
}) {
  const region = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    let frame = 0;
    const update = () => {
      const t = (elementId && getTransform(elementId)) || transform;
      if (region.current)
        Object.assign(region.current.style, {
          left: `${emuToPx(t.x)}px`,
          top: `${emuToPx(t.y)}px`,
          width: `${emuToPx(t.width)}px`,
          height: `${emuToPx(t.height)}px`,
          transform: `rotate(${t.rotation}deg)`,
        });
    };
    const tick = () => {
      update();
      frame = requestAnimationFrame(tick);
    };
    update();
    if (interacting && elementId) frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [elementId, transform, getTransform, interacting]);
  return (
    <div
      ref={region}
      className="eppt-comment-highlight-region"
      data-element-id={elementId}
    />
  );
}
