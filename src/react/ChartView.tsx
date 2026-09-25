import { useEffect, useState } from "react";
import { useT } from "../i18n";
import type { ChartElement } from "../model/types";
import { chartSvg } from "./chart-renderer";
import { chartSeries } from "../model/chart";

export function ChartView({ element }: { element: ChartElement }) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState(false);
  const t = useT();
  const key = JSON.stringify([
    element.chartType,
    element.labels,
    element.values,
    element.color,
    element.series,
    element.stacking,
    element.curve,
    element.title,
    element.showLegend,
    element.showLabels,
    element.transform.width,
    element.transform.height,
  ]);
  useEffect(() => {
    let live = true;
    setError(false);
    chartSvg(element).then(
      (next) => {
        if (live) setUrl(next);
      },
      () => {
        if (live) setError(true);
      },
    );
    return () => {
      live = false;
    };
  }, [key]);
  return error ? (
    <span role="alert">{t("chart.loadFailed")}</span>
  ) : url ? (
    <img
      src={url}
      alt={chartSeries(element)
        .map(
          (s) =>
            `${s.name}：` +
            element.labels
              .map((label, i) => `${label}: ${s.values[i]}`)
              .join("；"),
        )
        .join(" / ")}
      draggable={false}
      style={{ width: "100%", height: "100%", display: "block" }}
    />
  ) : null;
}
