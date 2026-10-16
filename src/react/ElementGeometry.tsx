import type { SlideElement } from "../model/types";
import { emuToPx, pxToEmu } from "../model/types";
import { useT } from "../i18n";
import { CommitInput } from "./CommitInput";
import { FormatIcon } from "./FormatControls";
export function ElementGeometry({
  element,
  disabled,
  patch,
  align,
  arrange,
}: {
  element: SlideElement;
  disabled: boolean;
  patch(value: Record<string, unknown>): void;
  align(value: "left" | "center" | "right" | "top" | "middle" | "bottom"): void;
  arrange(value: "front" | "forward" | "backward" | "back"): void;
}) {
  const t = useT();
  const transforms = ["width", "height", "x", "y", "rotation"] as const;
  const labels = [
    t("props.width"),
    t("props.height"),
    t("props.xLabel"),
    t("props.yLabel"),
    t("props.rotationLabel"),
  ];
  return (
    <section
      className="eppt-element-geometry"
      aria-label={t("feishu.geometry")}
    >
      <div className="eppt-panel-segments eppt-object-align">
        {(["left", "center", "right", "top", "middle", "bottom"] as const).map(
          (value, index) => (
            <button
              key={value}
              type="button"
              title={t(
                `props.align${["Left", "Center", "Right", "Top", "Middle", "Bottom"][index]}`,
              )}
              aria-label={t(
                `props.align${["Left", "Center", "Right", "Top", "Middle", "Bottom"][index]}`,
              )}
              disabled={disabled || element.locked}
              onClick={() => align(value)}
            >
              <FormatIcon
                name={
                  [
                    "objectLeft",
                    "objectCenter",
                    "objectRight",
                    "objectTop",
                    "objectMiddle",
                    "objectBottom",
                  ][index]
                }
              />
            </button>
          ),
        )}
      </div>
      <div className="eppt-panel-segments eppt-object-arrange">
        {(["front", "forward", "backward", "back"] as const).map((value) => (
          <button
            key={value}
            type="button"
            title={t(`context.${value}`)}
            aria-label={t(`context.${value}`)}
            disabled={disabled || element.locked}
            onClick={() => arrange(value)}
          >
            <FormatIcon name={value} />
          </button>
        ))}
      </div>
      <div className="eppt-geometry-grid">
        {transforms.map((key, index) => (
          <label
            className={`eppt-number-field ${key === "rotation" ? "eppt-angle-field" : ""}`}
            key={key}
            title={labels[index]}
          >
            <span aria-hidden="true">{["W", "H", "X", "Y", "↻"][index]}</span>
            <CommitInput
              aria-label={labels[index]}
              inputMode="decimal"
              disabled={disabled || element.locked}
              value={String(
                Math.round(
                  (key === "rotation"
                    ? element.transform[key]
                    : emuToPx(element.transform[key])) * 100,
                ) / 100,
              )}
              onCommit={(input) => {
                const value = Number(input);
                if (
                  input.trim() &&
                  Number.isFinite(value) &&
                  (!["width", "height"].includes(key) || value > 0)
                )
                  patch({
                    transform: {
                      [key]: key === "rotation" ? value : pxToEmu(value),
                    },
                  });
              }}
            />
            {key === "rotation" && <span>°</span>}
          </label>
        ))}
        <button
          type="button"
          className="eppt-geometry-lock"
          disabled={disabled}
          aria-pressed={!!element.locked}
          aria-label={t("props.lock")}
          title={t("props.lock")}
          onClick={() => patch({ locked: !element.locked })}
        >
          <FormatIcon name={element.locked ? "lock" : "unlock"} />
        </button>
      </div>
    </section>
  );
}
