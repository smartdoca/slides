import type { ChartElement } from "../model/types";
import { validChart } from "../model/chart";
import { displayMessage, useT } from "../i18n";
import { CommitInput } from "./CommitInput";
import { useState } from "react";
export function ChartOptions({
  element,
  disabled,
  onChange,
}: {
  element: ChartElement;
  disabled: boolean;
  onChange: (patch: Record<string, unknown>) => void;
}) {
  const [error, setError] = useState("");
  const t = useT();
  return (
    <div className="eppt-chart-options">
      <label>
        {t("chart.title")}
        <CommitInput
          aria-label={t("chart.title")}
          value={element.title ?? ""}
          disabled={disabled}
          onCommit={(title) => onChange({ title })}
        />
      </label>
      {element.chartType === "bar" && (
        <label>
          {t("chart.arrangement")}
          <select
            aria-label={t("chart.barLayout")}
            value={element.stacking ?? "none"}
            disabled={disabled}
            onChange={(e) => {
              const stacking = e.target.value as ChartElement["stacking"];
              if (!validChart({ ...element, stacking })) {
                setError("chart.percentError");
                return;
              }
              setError("");
              onChange({ stacking });
            }}
          >
            <option value="none">{t("chart.clustered")}</option>
            <option value="stacked">{t("chart.stacked")}</option>
            <option value="percent">{t("chart.percent")}</option>
          </select>
        </label>
      )}
      {element.chartType === "line" && (
        <label>
          {t("chart.lineStyle")}
          <select
            aria-label={t("chart.lineStyleLabel")}
            value={element.curve ?? "linear"}
            disabled={disabled}
            onChange={(e) => onChange({ curve: e.target.value })}
          >
            <option value="linear">{t("chart.linear")}</option>
            <option value="smooth">{t("chart.smooth")}</option>
            <option value="step">{t("chart.step")}</option>
          </select>
        </label>
      )}
      <label>
        <input
          type="checkbox"
          aria-label={t("chart.legend")}
          checked={element.showLegend ?? (element.series?.length ?? 1) > 1}
          disabled={disabled}
          onChange={(e) => onChange({ showLegend: e.target.checked })}
        />
        {t("chart.legend")}
      </label>
      <label>
        <input
          type="checkbox"
          aria-label={t("chart.labels")}
          checked={element.showLabels ?? false}
          disabled={disabled}
          onChange={(e) => onChange({ showLabels: e.target.checked })}
        />
        {t("chart.labels")}
      </label>
      {error && <p role="alert">{displayMessage(t, error)}</p>}
    </div>
  );
}
