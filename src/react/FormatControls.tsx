import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useT } from "../i18n";
import { TEXT_STYLES, type CharacterStyle } from "../model/styles";

export function FormatIcon({ name }: { name: string }) {
  const paths: Record<string, ReactNode> = {
    chevronDown: <path d="m4 6 4 4 4-4" />,
    alignLeft: <path d="M2 3h12M2 6.5h8M2 10h12M2 13.5h8" />,
    alignCenter: <path d="M2 3h12M4 6.5h8M2 10h12M4 13.5h8" />,
    alignRight: <path d="M2 3h12M6 6.5h8M2 10h12M6 13.5h8" />,
    objectLeft: (
      <>
        <path d="M2 1v14" />
        <rect x="5" y="3" width="8" height="3" rx=".5" />
        <rect x="5" y="10" width="5" height="3" rx=".5" />
      </>
    ),
    objectCenter: (
      <>
        <path d="M8 1v14" />
        <rect x="2" y="3" width="12" height="3" rx=".5" />
        <rect x="5" y="10" width="6" height="3" rx=".5" />
      </>
    ),
    objectRight: (
      <>
        <path d="M14 1v14" />
        <rect x="3" y="3" width="8" height="3" rx=".5" />
        <rect x="6" y="10" width="5" height="3" rx=".5" />
      </>
    ),
    objectTop: (
      <>
        <path d="M1 2h14" />
        <rect x="3" y="5" width="3" height="8" rx=".5" />
        <rect x="10" y="5" width="3" height="5" rx=".5" />
      </>
    ),
    objectMiddle: (
      <>
        <path d="M1 8h14" />
        <rect x="3" y="2" width="3" height="12" rx=".5" />
        <rect x="10" y="5" width="3" height="6" rx=".5" />
      </>
    ),
    objectBottom: (
      <>
        <path d="M1 14h14" />
        <rect x="3" y="3" width="3" height="8" rx=".5" />
        <rect x="10" y="6" width="3" height="5" rx=".5" />
      </>
    ),
    top: (
      <>
        <path d="M2 2h12M8 5v9M4.5 8.5 8 5l3.5 3.5" />
      </>
    ),
    middle: <path d="M2 8h12M8 1v4M5 3l3 3 3-3M8 15v-4M5 13l3-3 3 3" />,
    bottom: <path d="M2 14h12M8 2v9M4.5 7.5 8 11l3.5-3.5" />,
    list: (
      <>
        <path d="M6 3h8M6 8h8M6 13h8" />
        <circle cx="2.5" cy="3" r=".7" />
        <circle cx="2.5" cy="8" r=".7" />
        <circle cx="2.5" cy="13" r=".7" />
      </>
    ),
    number: (
      <>
        <path d="M7 3h7M7 8h7M7 13h7M2 1h1v4M1.5 8a1 1 0 1 1 1.8.6L1.5 11H4M1.5 13h2l-1 1h1v1h-2" />
      </>
    ),
    painter: <path d="M2 2h9v5H2zM11 4h3v6H7v2M5.5 12h3v3h-3z" />,
    format: (
      <>
        <path d="m3 2 11 11-2 2L1 4zM12 1l3 3-5 5-3-3zM5 8l3 3-4 4-3-3z" />
      </>
    ),
    link: (
      <path d="m6.5 10 3-4M6 11.5l-1 1a3 3 0 0 1-4-4l3-3a3 3 0 0 1 4 0M10 4.5l1-1a3 3 0 0 1 4 4l-3 3a3 3 0 0 1-4 0" />
    ),
    more: (
      <>
        <circle cx="3" cy="8" r=".8" />
        <circle cx="8" cy="8" r=".8" />
        <circle cx="13" cy="8" r=".8" />
      </>
    ),
    indent: <path d="M7 3h7M7 8h7M7 13h7M1 5l3 3-3 3" />,
    outdent: <path d="M7 3h7M7 8h7M7 13h7M4 5 1 8l3 3" />,
    front: (
      <>
        <rect x="2" y="2" width="8" height="8" rx="1" />
        <path d="M12 6h2v8H6v-2" />
      </>
    ),
    back: (
      <>
        <rect x="6" y="6" width="8" height="8" rx="1" />
        <path d="M10 4V2H2v8h2" />
      </>
    ),
    forward: <path d="m8 2 4 4H9v6H7V6H4zM2 14h12" />,
    backward: <path d="m8 14 4-4H9V4H7v6H4zM2 2h12" />,
    flipH: <path d="M8 1v14M2 4v8l4-4zM14 4v8l-4-4z" />,
    flipV: <path d="M1 8h14M4 2h8L8 6zM4 14h8l-4-4z" />,
    search: (
      <>
        <circle cx="6.5" cy="6.5" r="4.5" />
        <path d="m10 10 4 4" />
      </>
    ),
    lock: (
      <>
        <rect x="3" y="7" width="10" height="8" rx="1" />
        <path d="M5 7V4a3 3 0 0 1 6 0v3M8 10v2" />
      </>
    ),
    unlock: (
      <>
        <rect x="3" y="7" width="10" height="8" rx="1" />
        <path d="M5 7V4a3 3 0 0 1 6 0M8 10v2" />
      </>
    ),
  };
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name] ?? paths.format}
    </svg>
  );
}

export function FormatPopover({
  label,
  trigger,
  children,
  disabled,
  className = "",
  width = 192,
  role = "menu",
}: {
  label: string;
  trigger: ReactNode;
  children(close: () => void): ReactNode;
  disabled?: boolean;
  className?: string;
  width?: number;
  role?: "menu" | "dialog";
}) {
  const [open, setOpen] = useState(false),
    id = useId();
  const root = useRef<HTMLDivElement>(null),
    button = useRef<HTMLButtonElement>(null),
    popup = useRef<HTMLDivElement>(null);
  const byKeyboard = useRef(false);
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const rect = button.current?.getBoundingClientRect(),
        box = popup.current;
      if (!rect || !box) return;
      box.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - box.offsetWidth - 8))}px`;
      box.style.top = `${Math.max(8, rect.bottom + box.offsetHeight + 8 <= window.innerHeight ? rect.bottom + 6 : rect.top - box.offsetHeight - 6)}px`;
    };
    place();
    if (byKeyboard.current)
      popup.current
        ?.querySelector<HTMLElement>("input,button:not(:disabled)")
        ?.focus();
    const observer = new ResizeObserver(place);
    if (popup.current) observer.observe(popup.current);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);
  useEffect(() => {
    if (disabled) setOpen(false);
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", outside);
    return () => window.removeEventListener("pointerdown", outside);
  }, [disabled]);
  return (
    <div
      ref={root}
      className={`eppt-format-root ${className}`}
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          event.preventDefault();
          event.stopPropagation();
          setOpen(false);
          button.current?.focus();
        }
        if (!open || (event.target as HTMLElement).matches("input,textarea"))
          return;
        if (["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) {
          event.preventDefault();
          event.stopPropagation();
          const items = [
              ...(popup.current?.querySelectorAll<HTMLButtonElement>(
                "button:not(:disabled)",
              ) ?? []),
            ],
            index = items.indexOf(document.activeElement as HTMLButtonElement);
          items[
            event.key === "Home"
              ? 0
              : event.key === "End"
                ? items.length - 1
                : (index + (event.key === "ArrowUp" ? -1 : 1) + items.length) %
                  items.length
          ]?.focus();
        }
      }}
    >
      <button
        ref={button}
        type="button"
        className="eppt-format-trigger"
        aria-label={label}
        title={label}
        aria-expanded={open}
        aria-haspopup={role}
        aria-controls={open ? id : undefined}
        disabled={disabled}
        onMouseDown={(event) => event.preventDefault()}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            byKeyboard.current = true;
            setOpen(true);
          }
        }}
        onClick={() => {
          byKeyboard.current = false;
          setOpen(!open);
        }}
      >
        {trigger}
      </button>
      {open && (
        <div
          ref={popup}
          id={id}
          className="eppt-format-popover"
          role={role}
          aria-label={label}
          style={{ width }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

export function FormatMenuItem({
  children,
  checked,
  onClick,
  disabled,
  icon,
}: {
  children: ReactNode;
  checked?: boolean;
  onClick(): void;
  disabled?: boolean;
  icon?: ReactNode;
}) {
  return (
    <button
      type="button"
      role={checked === undefined ? "menuitem" : "menuitemradio"}
      aria-checked={checked}
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
    >
      {icon && <span className="eppt-menu-icon">{icon}</span>}
      <span>{children}</span>
      {checked && <span className="eppt-menu-check">✓</span>}
    </button>
  );
}

export const FONT_FAMILIES = [
  { name: "思源黑体", value: "Source Han Sans SC" },
  { name: "思源宋体", value: "Source Han Serif SC" },
  { name: "微软雅黑", value: "Microsoft YaHei" },
  { name: "宋体", value: "SimSun" },
  { name: "黑体", value: "SimHei" },
  { name: "楷体", value: "KaiTi" },
  ...["Arial", "Calibri", "Aptos", "Georgia", "Times New Roman"].map(
    (value) => ({ name: value, value }),
  ),
];
export function FontMenu({
  value,
  used = [],
  disabled,
  onChange,
}: {
  value?: string;
  used?: string[];
  disabled?: boolean;
  onChange(value: string): void;
}) {
  const t = useT(),
    [search, setSearch] = useState("");
  const name = (font: string) =>
    FONT_FAMILIES.find((item) => item.value === font)?.name ?? font;
  const list = [
    ...new Set([...used, ...FONT_FAMILIES.map((font) => font.value)]),
  ].filter((font) =>
    `${font} ${name(font)}`.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <FormatPopover
      label={t("toolbar.font")}
      disabled={disabled}
      className="eppt-font-menu"
      width={246}
      trigger={
        <>
          <span>{value ? name(value) : t("style.mixed")}</span>
          <span className="eppt-chevron">⌄</span>
        </>
      }
    >
      {(close) => (
        <>
          <label className="eppt-font-search">
            <FormatIcon name="search" />
            <input
              aria-label={t("feishu.fontSearch")}
              placeholder={t("feishu.search")}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <div className="eppt-font-results">
            {!!used.length && !search && (
              <>
                <p className="eppt-menu-caption">{t("feishu.usedFonts")}</p>
                {[...new Set(used)].map((font) => (
                  <FormatMenuItem
                    key={`used-${font}`}
                    checked={font === value}
                    onClick={() => {
                      onChange(font);
                      close();
                    }}
                  >
                    <span style={{ fontFamily: font }}>{name(font)}</span>
                  </FormatMenuItem>
                ))}
              </>
            )}
            <p className="eppt-menu-caption">{t("feishu.fonts")}</p>
            {list.map((font) => (
              <FormatMenuItem
                key={font}
                checked={font === value}
                onClick={() => {
                  onChange(font);
                  close();
                }}
              >
                <span style={{ fontFamily: font }}>{name(font)}</span>
              </FormatMenuItem>
            ))}
            {!list.length && (
              <p className="eppt-menu-caption">{t("feishu.noFonts")}</p>
            )}
          </div>
        </>
      )}
    </FormatPopover>
  );
}

export function TextPresetMenu({
  marks,
  disabled,
  onPreset,
}: {
  marks: CharacterStyle;
  disabled?: boolean;
  onPreset(id: string): void;
}) {
  const t = useT(),
    selected = TEXT_STYLES.find(
      (style) => style.fontSize === marks.fontSize && style.bold === marks.bold,
    );
  return (
    <FormatPopover
      label={t("feishu.textPreset")}
      disabled={disabled}
      className="eppt-preset-menu"
      width={180}
      trigger={
        <>
          <span>
            {selected ? t(`style.text.${selected.id}`) : t("feishu.customText")}
          </span>
          <span className="eppt-chevron">⌄</span>
        </>
      }
    >
      {(close) =>
        TEXT_STYLES.map((style) => (
          <FormatMenuItem
            key={style.id}
            checked={selected?.id === style.id}
            onClick={() => {
              onPreset(style.id);
              close();
            }}
          >
            {t(`style.text.${style.id}`)}
          </FormatMenuItem>
        ))
      }
    </FormatPopover>
  );
}
