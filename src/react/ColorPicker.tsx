import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { displayMessage, useT } from "../i18n";
import { CommitInput } from "./CommitInput";
const colors = [
  "#ffffff",
  "#202328",
  "#6b7280",
  "#d1d5db",
  "#ef4444",
  "#f97316",
  "#facc15",
  "#22c55e",
  "#14b8a6",
  "#3b82f6",
  "#6366f1",
  "#a855f7",
  "#ec4899",
  "#fee2e2",
  "#fef3c7",
  "#dcfce7",
  "#dbeafe",
  "#ede9fe",
];
export function ColorPicker({
  label,
  value,
  onChange,
  disabled,
  clearable = false,
  mark = "fill",
}: {
  label: string;
  value?: string;
  onChange: (value: string | undefined) => void;
  disabled?: boolean;
  clearable?: boolean;
  mark?: "text" | "highlight" | "fill";
}) {
  const t = useT();
  const [open, setOpen] = useState(false),
    [error, setError] = useState("");
  const root = useRef<HTMLDivElement>(null),
    button = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => {
    if (!open) return;
    const p = root.current?.querySelector<HTMLElement>(".eppt-color-popover"),
      b = button.current?.getBoundingClientRect();
    if (p && b) {
      p.style.left =
        Math.max(8, Math.min(b.left, window.innerWidth - p.offsetWidth - 8)) +
        "px";
      p.style.top =
        Math.max(
          8,
          b.bottom + p.offsetHeight + 8 < window.innerHeight
            ? b.bottom + 8
            : b.top - p.offsetHeight - 8,
        ) + "px";
    }
  }, [open]);
  useEffect(() => {
    if (disabled) setOpen(false);
    const close = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [disabled]);
  const pick = (v: string | undefined) => {
    onChange(v);
    setOpen(false);
    setError("");
  };
  return (
    <div
      ref={root}
      className="eppt-color-root"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false);
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          setOpen(false);
          button.current?.focus();
        }
      }}
    >
      <button
        ref={button}
        aria-label={label}
        title={label}
        disabled={disabled}
        aria-expanded={open}
        className="eppt-color-trigger"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen(!open)}
      >
        <span>
          {mark === "highlight" ? "▰" : mark === "text" ? "A" : "▣"}
        </span>
        <i style={{ background: value ?? "transparent" }} />
        <small>⌄</small>
      </button>
      {open && (
        <div
          className="eppt-color-popover"
          role="group"
          aria-label={t("color.choose", { label })}
        >
          <strong>{label}</strong>
          <div className="eppt-swatches">
            {colors.map((c) => (
              <button
                key={c}
                aria-label={c}
                aria-pressed={value?.toLowerCase() === c}
                style={{ background: c }}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(c)}
              />
            ))}
          </div>
          <label>
            {t("color.custom")}
            <CommitInput
              aria-label={t("color.value", { label })}
              value={value ?? ""}
              placeholder="#3366ff"
              onCommit={(s) => {
                const color = s.startsWith("#") ? s : "#" + s;
                if (/^#[\da-f]{6}$/i.test(color)) pick(color);
                else setError("color.invalid");
              }}
            />
          </label>
          {clearable && (
            <button
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(undefined)}
            >
              {t("color.none")}
            </button>
          )}
          {error && <span role="alert">{displayMessage(t, error)}</span>}
        </div>
      )}
    </div>
  );
}
