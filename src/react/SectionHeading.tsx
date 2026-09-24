import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/** Local title draft and menu state; only a committed name/deletion is content. */
export function SectionHeading({
  id,
  startId,
  name,
  folded,
  disabled,
  dropping,
  onToggle,
  onRename,
  onDelete,
}: {
  id: string;
  startId: string;
  name: string;
  folded: boolean;
  disabled: boolean;
  dropping: boolean;
  onToggle(): void;
  onRename(name: string): void;
  onDelete(): void;
}) {
  const root = useRef<HTMLDivElement>(null),
    menu = useRef<HTMLDivElement>(null),
    trigger = useRef<HTMLButtonElement>(null);
  const [editing, setEditing] = useState(false),
    [draft, setDraft] = useState(name),
    [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const finished = useRef(false);
  const startName = useRef(name);
  const rename = () => {
    if (disabled) return;
    finished.current = false;
    startName.current = name;
    setDraft(name);
    setError("");
    setEditing(true);
    setOpen(false);
  };
  const commit = () => {
    if (finished.current || disabled) return;
    if (!draft.trim()) {
      setError("请输入分节名称");
      return;
    }
    try {
      if (draft.trim() !== startName.current.trim()) onRename(draft.trim());
      finished.current = true;
      setEditing(false);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  useEffect(() => {
    if (disabled) {
      finished.current = true;
      setEditing(false);
      setOpen(false);
    }
  }, [disabled]);
  useLayoutEffect(() => {
    if (!open || !menu.current || !trigger.current) return;
    const rect = trigger.current.getBoundingClientRect(),
      popup = menu.current;
    popup.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - popup.offsetWidth - 8))}px`;
    popup.style.top = `${Math.max(8, Math.min(rect.bottom + 4, window.innerHeight - popup.offsetHeight - 8))}px`;
    popup.querySelector<HTMLButtonElement>("button")?.focus();
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (
        !root.current?.contains(event.target as Node) &&
        !menu.current?.contains(event.target as Node)
      )
        setOpen(false);
    };
    const scroll = (event: Event) => {
      if (!menu.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    window.addEventListener("scroll", scroll, true);
    window.addEventListener("resize", scroll);
    return () => {
      document.removeEventListener("pointerdown", outside);
      window.removeEventListener("scroll", scroll, true);
      window.removeEventListener("resize", scroll);
    };
  }, [open]);
  return (
    <div
      ref={root}
      className={"eppt-section-heading" + (dropping ? " is-drop-target" : "")}
      data-section-start={startId}
      data-section-id={id}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!disabled) setOpen(true);
      }}
      onKeyDown={(e) => {
        if (["Delete", "Backspace"].includes(e.key)) e.stopPropagation();
        if (e.key === "F2") {
          e.preventDefault();
          e.stopPropagation();
          rename();
        }
      }}
    >
      <button
        className="eppt-section-toggle"
        aria-label={`${folded ? "展开" : "收起"}分节 ${name}`}
        aria-expanded={!folded}
        onClick={onToggle}
      >
        {folded ? "▸" : "▾"}
      </button>
      {editing ? (
        <input
          className="eppt-section-name-input"
          aria-label="分节名称"
          aria-invalid={!!error}
          title={error || "Enter 保存 · Esc 取消"}
          autoFocus
          maxLength={200}
          value={draft}
          onFocus={(e) => e.currentTarget.select()}
          onChange={(e) => {
            setDraft(e.target.value);
            setError("");
          }}
          onBlur={commit}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.nativeEvent.isComposing || e.keyCode === 229) return;
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            }
            if (e.key === "Escape") {
              e.preventDefault();
              finished.current = true;
              setEditing(false);
              setError("");
            }
          }}
        />
      ) : (
        <button
          className="eppt-section-title"
          disabled={disabled}
          aria-label={`重命名分节 ${name}`}
          title="点击名称编辑 · 拖动幻灯片到这里移入分节"
          onClick={rename}
        >
          {name}
        </button>
      )}
      <button
        ref={trigger}
        className="eppt-section-more"
        disabled={disabled}
        aria-label={`分节 ${name} 更多操作`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        ···
      </button>
      {error && (
        <span role="alert" className="eppt-section-error">
          {error}
        </span>
      )}
      {open &&
        createPortal(
          <div
            ref={menu}
            className="eppt-section-menu"
            role="menu"
            aria-label={`分节 ${name} 操作`}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Escape") {
                e.preventDefault();
                setOpen(false);
                trigger.current?.focus();
              }
              if (["ArrowDown", "ArrowUp"].includes(e.key)) {
                e.preventDefault();
                const buttons = [
                  ...menu.current!.querySelectorAll<HTMLButtonElement>(
                    "button",
                  ),
                ];
                const index = buttons.indexOf(
                  document.activeElement as HTMLButtonElement,
                );
                buttons[
                  (index + (e.key === "ArrowDown" ? 1 : -1) + buttons.length) %
                    buttons.length
                ]?.focus();
              }
            }}
          >
            <button role="menuitem" disabled={disabled} onClick={rename}>
              重命名分节
            </button>
            <button
              role="menuitem"
              disabled={disabled}
              onClick={() => {
                setOpen(false);
                onDelete();
              }}
            >
              删除分节（保留幻灯片）
            </button>
          </div>,
          root.current?.closest(".eppt-workspace") ?? document.body,
        )}
    </div>
  );
}
