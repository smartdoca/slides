import { useEffect, useRef, useState } from "react";
import { isShapeKind, shapePath } from "../model/shapes";

export function ToolIcon({ kind }: { kind: string }) {
  if (isShapeKind(kind))
    return (
      <svg
        width="24"
        height="24"
        viewBox="-4 -4 108 108"
        fill="none"
        stroke="currentColor"
        strokeWidth="5"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d={shapePath(kind)} />
      </svg>
    );
  const paths: Record<string, string> = {
    copySlides: "M8 8h13v13H8z M4 16H2V2h14v2",
    section: "M3 5h7l2 3h9v12H3z M3 12h18",
    text: "M4 4h16v16H4z M8 8h8 M12 8v9",
    shape: "M3 3h12v12H3z M21 16a5 5 0 1 1-10 0a5 5 0 1 1 10 0",
    image: "M3 3h18v18H3z M3 17l6-6 4 4 3-3 5 5 M16 7h.01",
    chart: "M3 3v18h18 M8 16V9 M13 16V5 M18 16v-5",
    table: "M3 3h18v18H3z M3 9h18 M3 15h18 M9 3v18 M15 3v18",
    format: "M4 4l16 16 M15 3l6 6-5 5-6-6z M3 16l5 5 5-5-5-5z",
    undo: "M4 7v6h6 M4 13a8 8 0 1 1 14 5",
    redo: "M20 7v6h-6 M20 13a8 8 0 1 0-14 5",
    present: "M3 3h18v14H3z M12 17v4 M8 21h8 M10 7l5 3-5 3z",
    animation:
      "M12 2l2.5 6.5L21 11l-6.5 2.5L12 20l-2.5-6.5L3 11l6.5-2.5z M20 2v4 M18 4h4",
    search: "M16 10a6 6 0 1 1-12 0a6 6 0 1 1 12 0 M15 15l6 6",
    rect: "M3 4h18v16H3z",
    roundRect: "M6 4h12q3 0 3 3v10q0 3-3 3H6q-3 0-3-3V7q0-3 3-3z",
    ellipse: "M21 12a9 9 0 1 1-18 0a9 9 0 1 1 18 0",
    triangle: "M12 3l10 18H2z",
    diamond: "M12 2l10 10-10 10L2 12z",
    line: "M3 20L21 4",
    bar: "M3 21h18 M6 18V10h3v8z M12 18V4h3v14z M18 18V8h3v10z",
    chartLine: "M3 3v18h18 M4 17l6-8 5 5 6-10",
    pie: "M11 3a9 9 0 1 0 10 10H11z M14 2v8h8a9 9 0 0 0-8-8z",
    doughnut:
      "M21 12a9 9 0 1 1-18 0a9 9 0 1 1 18 0 M16 12a4 4 0 1 0-8 0a4 4 0 1 0 8 0",
  };
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[kind] ?? paths.format} />
    </svg>
  );
}

export function InsertPalette({
  kind,
  label,
  items,
  disabled,
  onPick,
}: {
  kind: string;
  label: string;
  items: { id: string; label: string; icon?: string; group?: string }[];
  disabled: boolean;
  onPick: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [group, setGroup] = useState("全部");
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (disabled) setOpen(false);
    const close = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [disabled]);
  return (
    <div
      className="eppt-palette-root"
      ref={root}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false);
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          setOpen(false);
          trigger.current?.focus();
        }
      }}
    >
      <button
        ref={trigger}
        className={"eppt-insert-tool " + (open ? "active" : "")}
        disabled={disabled}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <ToolIcon kind={kind} />
        <span>{label}</span>
      </button>
      {open && (
        <div
          className={
            "eppt-palette " +
            (kind === "chart" ? "eppt-chart-gallery" : "eppt-shape-gallery")
          }
          role="group"
          aria-label={label + "选择"}
        >
          <h3>
            {label === "图表" ? "图表" : "形状"}
            <span>
              {label === "图表" ? "插入后可编辑数据" : "基础形状与线条"}
            </span>
          </h3>
          {kind === "shape" && (
            <div className="eppt-shape-categories">
              {[
                "全部",
                ...new Set(items.map((i) => i.group).filter(Boolean)),
              ].map((g) => (
                <button
                  key={g}
                  aria-pressed={group === g}
                  onClick={() => setGroup(g!)}
                >
                  {g}
                </button>
              ))}
            </div>
          )}
          <div className="eppt-palette-grid">
            {items
              .filter(
                (i) =>
                  kind !== "shape" || group === "全部" || i.group === group,
              )
              .map((item) => (
                <button
                  key={item.id}
                  onClick={() => {
                    onPick(item.id);
                    setOpen(false);
                  }}
                >
                  {kind === "chart" ? (
                    <ChartSwatch kind={item.id} />
                  ) : (
                    <ToolIcon kind={item.icon ?? item.id} />
                  )}
                  <span>{item.label}</span>
                </button>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ChartSwatch({ kind }: { kind: string }) {
  return (
    <svg className="eppt-chart-swatch" viewBox="0 0 180 110" aria-hidden="true">
      {kind.startsWith("bar") ? (
        <>
          <path d="M22 90H162" stroke="#9ba1ac" strokeWidth="2" />
          {[40, 76, 112, 148].map((x, i) => (
            <rect
              key={x}
              x={x - 9}
              y={kind === "bar-percent" ? 20 : [44, 20, 55, 34][i]}
              width="18"
              height={kind === "bar-percent" ? 70 : [46, 70, 35, 56][i]}
              rx="2"
              fill={kind === "bar" && i % 2 ? "#ff8a24" : "#527eff"}
            />
          ))}
          {kind !== "bar" &&
            [40, 76, 112, 148].map((x, i) => (
              <rect
                key={x}
                x={x - 9}
                y={kind === "bar-percent" ? 20 : [44, 20, 55, 34][i]}
                width="18"
                height={
                  kind === "bar-percent"
                    ? [30, 40, 20, 35][i]
                    : [16, 30, 15, 26][i]
                }
                fill="#ff8a24"
                stroke="#f7f8fa"
                strokeWidth="1"
              />
            ))}
        </>
      ) : kind.startsWith("line") ? (
        <>
          <path
            d="M22 18V90H162"
            stroke="#9ba1ac"
            strokeWidth="2"
            fill="none"
          />
          <path
            d={
              kind === "line-step"
                ? "M32 76H72V37H110V62H153V24"
                : kind === "line-smooth"
                  ? "M32 76C55 60 52 25 72 37S115 90 153 24"
                  : "M32 76L72 37L110 62L153 24"
            }
            stroke="#527eff"
            strokeWidth="4"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {[
            [32, 76],
            [72, 37],
            [110, 62],
            [153, 24],
          ].map(([cx, cy]) => (
            <circle key={cx} cx={cx} cy={cy} r="3.5" fill="#527eff" />
          ))}
        </>
      ) : (
        <>
          <circle cx="90" cy="55" r="36" fill="#ff8a24" />
          <path
            d="M90 55V19A36 36 0 0 1 126 55Z"
            fill="#527eff"
            stroke="#f7f8fa"
            strokeWidth="2"
          />
          {kind === "doughnut" && (
            <circle cx="90" cy="55" r="22" fill="#f7f8fa" />
          )}
        </>
      )}
    </svg>
  );
}
