import { createContext, useContext, useState, type ReactNode } from "react";
import { displayMessage, useT } from "../i18n";
import { CommitInput } from "./CommitInput";
import { FormatPopover } from "./FormatControls";

const basicColors = [
  "#8f959e",
  "#fbb8ab",
  "#f8d9b0",
  "#fff3b0",
  "#c8e8b1",
  "#b8e9e7",
  "#c2d7ff",
  "#dcc6fb",
  "#f2f3f5",
  "#fde2dc",
  "#fcebd4",
  "#fff8d6",
  "#e3f2d6",
  "#dcf5f3",
  "#e1ecff",
  "#eee3fc",
  "#dfe0e3",
  "#f69d8a",
  "#f5bc75",
  "#f8df73",
  "#a9d884",
  "#87d6d0",
  "#92b7f7",
  "#b68ce8",
  "#1f2329",
  "#d83931",
  "#de7802",
  "#e5ad00",
  "#34a853",
  "#35aaa4",
  "#3370ff",
  "#6425d0",
];
const ColorHistory = createContext<{
  recent: string[];
  used: string[];
  add(color: string): void;
}>({ recent: [], used: [], add() {} });
export function ColorHistoryProvider({
  children,
  colors = [],
}: {
  children: ReactNode;
  colors?: string[];
}) {
  const [recent, setRecent] = useState<string[]>([]);
  return (
    <ColorHistory.Provider
      value={{
        recent,
        used: colors,
        add: (color) =>
          setRecent((last) =>
            [color, ...last.filter((value) => value !== color)].slice(0, 10),
          ),
      }}
    >
      {children}
    </ColorHistory.Provider>
  );
}
export function ColorPicker({
  label,
  value,
  onChange,
  disabled,
  clearable = false,
  mark = "fill",
  circle = false,
  highlightValue,
  onHighlightChange,
  mixed = false,
}: {
  label: string;
  value?: string;
  onChange(value: string | undefined): void;
  disabled?: boolean;
  clearable?: boolean;
  mark?: "text" | "highlight" | "fill";
  circle?: boolean;
  mixed?: boolean;
  highlightValue?: string;
  onHighlightChange?(value: string | undefined): void;
}) {
  const t = useT(),
    history = useContext(ColorHistory);
  const [tab, setTab] = useState<"font" | "highlight">("font"),
    [more, setMore] = useState(false),
    [error, setError] = useState("");
  const highlighting = !!onHighlightChange && tab === "highlight";
  const selected = highlighting ? highlightValue : value;
  const used = [
    ...new Set(
      [
        ...history.used,
        ...history.recent,
        ...(selected && selected !== "transparent" ? [selected] : []),
        "#1f2329",
        "#ffffff",
        "#8f959e",
        "#bbbfc4",
      ].map((color) => color.toLowerCase()),
    ),
  ]
    .filter((color) => /^#[\da-f]{6}$/i.test(color))
    .slice(0, 16);
  const pick = (color: string | undefined, close: () => void) => {
    if (color) history.add(color.toLowerCase());
    (highlighting ? onHighlightChange! : onChange)(color);
    setError("");
    close();
  };
  const colorButton = (color: string, close: () => void) => (
    <button
      key={color}
      type="button"
      className="eppt-color-swatch"
      aria-label={color}
      aria-pressed={selected?.toLowerCase() === color.toLowerCase()}
      style={{ background: color }}
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => pick(color, close)}
    />
  );
  return (
    <FormatPopover
      label={label}
      disabled={disabled}
      className={`eppt-color-root ${circle ? "eppt-color-circle-root" : ""}`}
      width={248}
      role="dialog"
      trigger={
        circle ? (
          <span
            className={`eppt-current-color ${mixed ? "mixed" : !value || value === "transparent" ? "empty" : ""}`}
            style={{
              background: value && value !== "transparent" ? value : undefined,
            }}
          />
        ) : (
          <>
            <span
              className={`eppt-color-letter ${mark}`}
              style={
                mark === "text"
                  ? {
                      color: "#1f2329",
                      borderBottom: `2px solid ${value ?? "#8f959e"}`,
                      boxShadow:
                        value?.toLowerCase() === "#ffffff"
                          ? "0 1px 0 #dee0e3"
                          : undefined,
                    }
                  : undefined
              }
            >
              {mark === "text" ? "A" : mark === "highlight" ? "▰" : "▨"}
            </span>
            <span className="eppt-chevron">⌄</span>
          </>
        )
      }
    >
      {(close) => (
        <div
          className="eppt-color-popover"
          onKeyDown={(event) => {
            const target = event.target as HTMLElement,
              grid = target.closest(".eppt-color-swatches");
            if (
              !grid ||
              ![
                "ArrowLeft",
                "ArrowRight",
                "ArrowUp",
                "ArrowDown",
                "Home",
                "End",
              ].includes(event.key)
            )
              return;
            event.preventDefault();
            event.stopPropagation();
            const buttons = [
                ...grid.querySelectorAll<HTMLButtonElement>("button"),
              ],
              index = buttons.indexOf(target as HTMLButtonElement);
            const delta =
              event.key === "ArrowLeft"
                ? -1
                : event.key === "ArrowRight"
                  ? 1
                  : event.key === "ArrowUp"
                    ? -8
                    : 8;
            buttons[
              event.key === "Home"
                ? 0
                : event.key === "End"
                  ? buttons.length - 1
                  : (index + delta + buttons.length) % buttons.length
            ]?.focus();
          }}
        >
          {onHighlightChange ? (
            <div
              className="eppt-color-tabs"
              role="tablist"
              aria-label={t("feishu.fontStyle")}
            >
              <button
                type="button"
                role="tab"
                aria-selected={!highlighting}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  setTab("font");
                  setError("");
                }}
              >
                {t("toolbar.textColor")}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={highlighting}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  setTab("highlight");
                  setError("");
                }}
              >
                {t("feishu.highlight")}
              </button>
            </div>
          ) : (
            <div className="eppt-color-label">{label}</div>
          )}
          <p className="eppt-color-heading">{t("feishu.usedColors")}</p>
          <div
            className="eppt-color-swatches"
            role="group"
            aria-label={t("feishu.usedColors")}
          >
            {used.map((color) => colorButton(color, close))}
          </div>
          <p className="eppt-color-heading">{t("color.standard")}</p>
          <div
            className="eppt-color-swatches"
            role="group"
            aria-label={t("color.standard")}
          >
            {basicColors.map((color) => colorButton(color, close))}
          </div>
          {(clearable || highlighting) && (
            <button
              type="button"
              className="eppt-color-none"
              aria-label={t("color.none")}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => pick(undefined, close)}
            >
              <span className="eppt-current-color empty" />
              {t("color.none")}
            </button>
          )}
          <button
            type="button"
            className="eppt-more-colors"
            aria-expanded={more}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => setMore(!more)}
          >
            <span className="eppt-spectrum" />
            {t("feishu.moreColors")}
            <span>›</span>
          </button>
          {more && (
            <label className="eppt-custom-color">
              {t("color.custom")}
              <CommitInput
                aria-label={t("color.value", { label })}
                value={selected && selected !== "transparent" ? selected : ""}
                placeholder="#3370ff"
                onCommit={(input) => {
                  const color = input.startsWith("#") ? input : `#${input}`;
                  if (/^#[\da-f]{6}$/i.test(color)) pick(color, close);
                  else setError("color.invalid");
                }}
              />
            </label>
          )}
          {error && <p role="alert">{displayMessage(t, error)}</p>}
        </div>
      )}
    </FormatPopover>
  );
}
