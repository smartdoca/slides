import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useT } from "../i18n";
export interface ElementMenuAction {
  label: string;
  run?: () => void;
  children?: ElementMenuAction[];
  shortcut?: string;
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
  onClose(): void;
}) {
  const t = useT(),
    root = useRef<HTMLDivElement>(null),
    [submenu, setSubmenu] = useState<string | null>(null);
  useLayoutEffect(() => {
    const el = root.current!;
    el.style.left = `${Math.max(8, Math.min(x, window.innerWidth - el.offsetWidth - 8))}px`;
    el.style.top = `${Math.max(8, Math.min(y, window.innerHeight - el.offsetHeight - 8))}px`;
    el.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
  }, [x, y]);
  useLayoutEffect(() => {
    const popup = root.current?.querySelector<HTMLElement>(
      ".eppt-context-submenu",
    );
    if (!popup) return;
    const rect = popup.getBoundingClientRect();
    if (rect.right > window.innerWidth - 8) {
      popup.style.left = "auto";
      popup.style.right = "100%";
    }
    if (rect.bottom > window.innerHeight - 8)
      popup.style.top = `${window.innerHeight - 8 - rect.bottom}px`;
  }, [submenu]);
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
      aria-label={t("context.menu")}
      className="eppt-element-menu"
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Escape") {
          e.preventDefault();
          onClose();
          return;
        }
        const current = e.target as HTMLButtonElement;
        if (e.key === "ArrowRight") {
          const action = actions.find(
            (a) => a.label === current.textContent?.replace("›", ""),
          );
          if (action?.children) {
            e.preventDefault();
            setSubmenu(action.label);
          }
        }
        if (e.key === "ArrowLeft" && submenu) {
          e.preventDefault();
          setSubmenu(null);
          root.current
            ?.querySelector<HTMLButtonElement>('[aria-expanded="true"]')
            ?.focus();
        }
        if (["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) {
          e.preventDefault();
          const menu = current.closest('[role="menu"]') ?? e.currentTarget;
          const buttons = [
              ...menu.querySelectorAll<HTMLButtonElement>(
                ":scope > div > button:not(:disabled)",
              ),
            ],
            index = buttons.indexOf(current);
          buttons[
            e.key === "Home"
              ? 0
              : e.key === "End"
                ? buttons.length - 1
                : (index + (e.key === "ArrowUp" ? -1 : 1) + buttons.length) %
                  buttons.length
          ]?.focus();
        }
      }}
    >
      {actions.map((action) => (
        <div
          key={action.label}
          className="eppt-context-row"
          onMouseEnter={() => setSubmenu(action.children ? action.label : null)}
        >
          {action.separator && <hr />}
          <button
            type="button"
            role="menuitem"
            disabled={action.disabled}
            aria-haspopup={action.children ? "menu" : undefined}
            aria-expanded={
              action.children ? submenu === action.label : undefined
            }
            onKeyDown={(e) => {
              if (action.children && e.key === "ArrowRight") {
                e.preventDefault();
                setSubmenu(action.label);
                requestAnimationFrame(() =>
                  root.current
                    ?.querySelector<HTMLButtonElement>(
                      ".eppt-context-submenu button:not(:disabled)",
                    )
                    ?.focus(),
                );
              }
            }}
            onClick={() => {
              if (action.children)
                setSubmenu(submenu === action.label ? null : action.label);
              else {
                action.run?.();
                onClose();
              }
            }}
          >
            <span>{action.label}</span>
            {action.children ? (
              <span>›</span>
            ) : (
              action.shortcut && <kbd>{action.shortcut}</kbd>
            )}
          </button>
          {action.children && submenu === action.label && (
            <div
              className="eppt-context-submenu"
              role="menu"
              aria-label={action.label}
            >
              {action.children.map((child) => (
                <div key={child.label}>
                  <button
                    type="button"
                    role="menuitem"
                    disabled={child.disabled}
                    onClick={() => {
                      child.run?.();
                      onClose();
                    }}
                  >
                    {child.label}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
