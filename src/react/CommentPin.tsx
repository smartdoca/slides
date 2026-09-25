import { useLayoutEffect, useRef, type ReactNode } from "react";
import { useT } from "../i18n";
import { emuToPx, type Transform } from "../model/types";
import { selectionBounds } from "../model/viewport";

/** Transient canvas geometry must not be persisted just to move annotations. */
export function CommentPin({ transforms, elementIds, getTransform, interacting, onClick, children }: {
  transforms: Transform[];
  elementIds: string[];
  getTransform: (id: string) => Transform | null | undefined;
  interacting: boolean;
  onClick(): void;
  children: ReactNode;
}) {
  const t = useT();
  const button = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => {
    let frame = 0;
    const update = () => {
      const bounds = selectionBounds(transforms.map((fallback, i) =>
        getTransform(elementIds[i]) ?? fallback));
      if (button.current) {
        button.current.style.left = `${emuToPx(bounds.x + bounds.width)}px`;
        button.current.style.top = `${emuToPx(bounds.y)}px`;
      }
    };
    const tick = () => { update(); frame = requestAnimationFrame(tick); };
    update();
    if (interacting) frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [transforms, elementIds, getTransform, interacting]);
  return <button ref={button} aria-label={t("editor.comments")} className="eppt-comment-marker"
    style={{ position: "absolute", zIndex: 40, pointerEvents: interacting ? "none" : undefined }}
    onPointerDown={e => e.stopPropagation()} onClick={onClick}>{children}</button>;
}
