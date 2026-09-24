import type { ChartElement } from "../model/types";
import { emuToPx } from "../model/types";
import { chartSeries, CHART_COLORS } from "../model/chart";

// Cache only presentation data, never host asset URLs or user identity.
const cache = new Map<string, Promise<string>>();
export function chartSvg(element: ChartElement): Promise<string> {
  const width = Math.max(80, emuToPx(element.transform.width));
  const height = Math.max(60, emuToPx(element.transform.height));
  const key = JSON.stringify([
    width,
    height,
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
  ]);
  const existing = cache.get(key);
  if (existing) return existing;
  const result = (async () => {
    const [{ Chart }, { Renderer }] = await Promise.all([
      import("@antv/g2"),
      import("@antv/g-svg"),
    ]);
    const container = document.createElement("div");
    container.style.cssText = `position:fixed;left:-100000px;top:0;width:${width}px;height:${height}px;pointer-events:none`;
    document.body.appendChild(container);
    const chart = new Chart({
      container,
      width,
      height,
      renderer: new Renderer(),
    });
    try {
      const circular =
        element.chartType === "pie" || element.chartType === "doughnut";
      const series = chartSeries(element);
      const data = series.flatMap((s, j) =>
        element.labels.map((label, index) => ({
          category: String(index),
          label,
          series: String(j),
          value: s.values[index],
        })),
      );
      chart.options({
        type: element.chartType === "line" ? "line" : "interval",
        data,
        animate: false,
        interaction: { tooltip: false },
        title: element.title || undefined,
        padding: "auto",
        labels: element.showLabels
          ? [{ text: "value", style: { fill: "#596274", fontSize: 11 } }]
          : [],
        ...(circular
          ? {
              coordinate: {
                type: "theta",
                innerRadius: element.chartType === "doughnut" ? 0.6 : 0,
              },
              transform: [{ type: "stackY" }],
              encode: { y: "value", color: "category" },
              scale: {
                color: {
                  range: [
                    element.color,
                    "#ff922b",
                    "#30b79a",
                    "#8c72df",
                    "#f4c14d",
                  ],
                },
              },
              axis: false,
              legend: element.showLegend
                ? {
                    color: {
                      position: "bottom",
                      cols: Math.min(4, element.labels.length),
                      gridRow: Math.ceil(element.labels.length / 4),
                      size: 24 * Math.ceil(element.labels.length / 4) + 8,
                      padding: 0,
                      itemLabelText: (d: any) =>
                        element.labels[Number(d.label)] ?? d.label,
                    },
                  }
                : false,
            }
          : {
              encode: {
                x: "category",
                y: "value",
                color: "series",
                ...(element.chartType === "line"
                  ? {
                      shape:
                        element.curve === "smooth"
                          ? "smooth"
                          : element.curve === "step"
                            ? "hv"
                            : "line",
                    }
                  : {}),
              },
              transform:
                element.chartType === "bar"
                  ? element.stacking === "percent"
                    ? [{ type: "stackY" }, { type: "normalizeY" }]
                    : element.stacking === "stacked"
                      ? [{ type: "stackY" }]
                      : [{ type: "dodgeX" }]
                  : [],
              scale: {
                y: { zero: true },
                color: {
                  domain: series.map((_, j) => String(j)),
                  range: series.map(
                    (s, i) => s.color ?? CHART_COLORS[i % CHART_COLORS.length],
                  ),
                },
              },
              style:
                element.chartType === "line" ? { lineWidth: 3 } : undefined,
              axis: {
                x: {
                  title: false,
                  labelFormatter: (index: string) =>
                    element.labels[Number(index)] ?? "",
                },
                y: {
                  title: false,
                  ...(element.chartType === "bar" &&
                  element.stacking === "percent"
                    ? { labelFormatter: ".0%" }
                    : {}),
                },
              },
              legend:
                (element.showLegend ?? series.length > 1)
                  ? {
                      color: {
                        position: "bottom",
                        cols: Math.min(4, series.length),
                        gridRow: Math.ceil(series.length / 4),
                        size: 24 * Math.ceil(series.length / 4) + 8,
                        padding: 0,
                        itemLabelText: (d: any) =>
                          series[Number(d.label)]?.name ?? d.label,
                      },
                    }
                  : false,
            }),
      });
      await chart.render();
      const svg = container.querySelector("svg");
      if (!svg) throw new Error("AntV 图表未能生成");
      return (
        "data:image/svg+xml," +
        encodeURIComponent(new XMLSerializer().serializeToString(svg))
      );
    } finally {
      chart.destroy();
      container.remove();
    }
  })();
  cache.set(key, result);
  result.catch(() => cache.delete(key));
  if (cache.size > 64) cache.delete(cache.keys().next().value!);
  return result;
}
