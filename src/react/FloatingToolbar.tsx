import {
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { emuToPx, type SlideElement, type Transform } from "../model/types";
import { floatingPosition, selectionBounds } from "../model/viewport";

/** View-only placement. Never writes selection/scroll coordinates to Yjs. */
export function FloatingToolbar({
  children,
  frame,
  viewport,
  elements,
  scale,
  hidden,
  interacting,
  getTransform,
}: {
  children: ReactNode;
  frame: RefObject<HTMLDivElement | null>;
  viewport: RefObject<HTMLDivElement | null>;
  elements: SlideElement[];
  scale: number;
  hidden?: boolean;
  interacting?: boolean;
  getTransform?: (id: string) => Transform | null | undefined;
}) {
  const toolbar = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{
    left: number;
    top: number;
    visible: boolean;
  }>({ left: 0, top: 0, visible: false });
  const signature = JSON.stringify(elements.map((el) => el.transform));
  useLayoutEffect(() => {
    const update = () => {
      const f = frame.current,
        v = viewport.current,
        t = toolbar.current;
      if (!f || !v || !t || !elements.length) return;
      const box = selectionBounds(
        elements.map((el) => {
          const t = getTransform?.(el.id) ?? el.transform;
          return { x: emuToPx(t.x), y: emuToPx(t.y),
            width: emuToPx(t.width), height: emuToPx(t.height), rotation: t.rotation };
        }),
      );
      const bounds = f.getBoundingClientRect(),
        area = v.getBoundingClientRect();
      t.style.maxWidth = `${Math.max(160, area.width - 16)}px`;
      const next = floatingPosition(
        {
          x: bounds.left + box.x * scale,
          y: bounds.top + box.y * scale,
          width: box.width * scale,
          height: box.height * scale,
        },
        { x: area.left, y: area.top, width: area.width, height: area.height },
        { width: t.offsetWidth, height: t.offsetHeight },
      );
      setPosition((last) =>
        last.left === next.left &&
        last.top === next.top &&
        last.visible === next.visible
          ? last
          : next,
      );
    };
    update();
    let frameId = 0;
    const tick = () => { update(); frameId = requestAnimationFrame(tick); };
    if (interacting) frameId = requestAnimationFrame(tick);
    const observer = new ResizeObserver(update);
    if (viewport.current) observer.observe(viewport.current);
    if (toolbar.current) observer.observe(toolbar.current);
    if (frame.current) observer.observe(frame.current);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      cancelAnimationFrame(frameId);
      observer.disconnect();
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [signature, scale, hidden, interacting, getTransform]);
  return (
    <div
      ref={toolbar}
      className="eppt-context-toolbar"
      role="toolbar"
      aria-label="选中对象工具"
      style={{
        left: position.left,
        top: position.top,
        visibility: position.visible && !hidden ? "visible" : "hidden",
        pointerEvents: interacting ? "none" : undefined,
      }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {children}
    </div>
  );
}
