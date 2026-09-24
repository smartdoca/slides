import type { ChartElement, ChartSeries } from "./types";
export const CHART_COLORS = [
  "#527eff",
  "#ff8a24",
  "#30b79a",
  "#8c72df",
  "#f4c14d",
  "#ed6b8d",
];
export function chartSeries(el: ChartElement): ChartSeries[] {
  return el.series ?? [{ name: "系列 1", values: el.values, color: el.color }];
}
export function validChart(el: ChartElement) {
  if (
    !["bar", "line", "pie", "doughnut"].includes(el.chartType) ||
    !Array.isArray(el.labels) ||
    !el.labels.length ||
    el.labels.length > 100 ||
    el.labels.some((v) => typeof v !== "string")
  )
    return false;
  const series = chartSeries(el);
  if (
    !Array.isArray(series) ||
    !series.length ||
    series.length > 12 ||
    series.some(
      (s) =>
        typeof s.name !== "string" ||
        !s.name.trim() ||
        !Array.isArray(s.values) ||
        s.values.length !== el.labels.length ||
        s.values.some((v) => !Number.isFinite(v)),
    )
  )
    return false;
  if (
    !Array.isArray(el.values) ||
    el.values.length !== el.labels.length ||
    el.values.some((v) => !Number.isFinite(v))
  )
    return false;
  if (
    el.series &&
    JSON.stringify(el.values) !== JSON.stringify(series[0].values)
  )
    return false;
  if (
    ["pie", "doughnut"].includes(el.chartType) &&
    (series.length !== 1 ||
      el.values.some((v) => v < 0) ||
      !el.values.some((v) => v > 0))
  )
    return false;
  if (el.stacking && !["none", "stacked", "percent"].includes(el.stacking))
    return false;
  if (el.curve && !["linear", "smooth", "step"].includes(el.curve))
    return false;
  if (
    el.chartType === "bar" &&
    el.stacking === "percent" &&
    (series.some((s) => s.values.some((v) => v < 0)) ||
      el.labels.some(
        (_, i) => series.reduce((sum, s) => sum + s.values[i], 0) <= 0,
      ))
  )
    return false;
  return true;
}
