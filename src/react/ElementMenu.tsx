import { useEffect, useLayoutEffect, useRef } from "react";
export interface ElementMenuAction {
  label: string;
  run: () => void;
  disabled?: boolean;
  separator?: boolean;
}
export function ElementMenu({
  x,
  y,
  actions,
  onClose,
}: {
  x: number;
  y: number;
  actions: ElementMenuAction[];
  onClose: () => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = root.current!;
    el.style.left =
      Math.max(8, Math.min(x, window.innerWidth - el.offsetWidth - 8)) + "px";
    el.style.top =
      Math.max(8, Math.min(y, window.innerHeight - el.offsetHeight - 8)) + "px";
    el.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
  }, [x, y]);
  useEffect(() => {
    const close = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) onClose();
    };
    window.addEventListener("pointerdown", close);
    window.addEventListener("resize", onClose);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("resize", onClose);
    };
  }, [onClose]);
  return (
    <div
      ref={root}
      role="menu"
      aria-label="元素操作"
      className="eppt-element-menu"
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Escape") {
          onClose();
          return;
        }
        if (["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) {
          e.preventDefault();
          const bs = [
              ...e.currentTarget.querySelectorAll<HTMLButtonElement>(
                "button:not(:disabled)",
              ),
            ],
            i = bs.indexOf(document.activeElement as HTMLButtonElement);
          bs[
            e.key === "Home"
              ? 0
              : e.key === "End"
                ? bs.length - 1
                : (i + (e.key === "ArrowUp" ? -1 : 1) + bs.length) % bs.length
          ]?.focus();
        }
      }}
    >
      {actions.map((a) => (
        <div key={a.label}>
          {a.separator && <hr />}
          <button
            role="menuitem"
            disabled={a.disabled}
            onClick={() => {
              a.run();
              onClose();
            }}
          >
            {a.label}
          </button>
        </div>
      ))}
    </div>
  );
}
