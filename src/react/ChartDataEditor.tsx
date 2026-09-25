import { useEffect, useState } from "react";
import { displayMessage, useT } from "../i18n";
import type { ChartElement, ChartSeries } from "../model/types";
import { chartSeries, CHART_COLORS, validChart } from "../model/chart";
export function ChartDataEditor({
  element,
  disabled,
  onApply,
}: {
  element: ChartElement;
  disabled: boolean;
  onApply: (labels: string[], values: number[], series: ChartSeries[]) => void;
}) {
  const signature = JSON.stringify([element.labels, chartSeries(element)]);
  const initial = () => ({
    labels: [...element.labels],
    series: chartSeries(element).map((s, i) => ({
      ...s,
      color: s.color ?? CHART_COLORS[i % CHART_COLORS.length],
      values: s.values.map(String),
    })),
  });
  const [data, setData] = useState(initial),
    [baseline, setBaseline] = useState(signature),
    [dirty, setDirty] = useState(false),
    [error, setError] = useState("");
  const t = useT();
  useEffect(() => {
    if (!dirty || disabled) {
      setData(initial());
      setBaseline(signature);
      setDirty(false);
      setError("");
    }
  }, [signature, disabled]);
  const reset = () => {
    setData(initial());
    setBaseline(signature);
    setDirty(false);
    setError("");
  };
  const update = (next: typeof data) => {
    setData(next);
    setDirty(true);
    setError("");
  };
  return (
    <section className="eppt-chart-data" aria-label={t("chart.dataTitle")}>
      <h3>{t("chart.dataHeading")}</h3>
      <p>{t("chart.dataHint")}</p>
      {dirty && baseline !== signature && (
        <p role="alert">{t("chart.remote")}</p>
      )}
      <div className="eppt-chart-sheet">
        <table>
          <thead>
            <tr>
              <th>{t("chart.categoryHeader")}</th>
              {data.series.map((s, j) => (
                <th key={j}>
                  <input
                    aria-label={t("chart.seriesName", { index: j + 1 })}
                    value={s.name}
                    disabled={disabled}
                    onChange={(e) =>
                      update({
                        ...data,
                        series: data.series.map((x, k) =>
                          j === k ? { ...x, name: e.target.value } : x,
                        ),
                      })
                    }
                  />
                  <input
                    type="color"
                    aria-label={t("chart.seriesColor", { index: j + 1 })}
                    value={s.color}
                    disabled={disabled}
                    onChange={(e) =>
                      update({
                        ...data,
                        series: data.series.map((x, k) =>
                          j === k ? { ...x, color: e.target.value } : x,
                        ),
                      })
                    }
                  />
                  <button
                    aria-label={t("chart.removeSeries", { index: j + 1 })}
                    disabled={disabled || data.series.length === 1}
                    onClick={() =>
                      update({
                        ...data,
                        series: data.series.filter((_, k) => k !== j),
                      })
                    }
                  >
                    ×
                  </button>
                </th>
              ))}
              <th />
            </tr>
          </thead>
          <tbody>
            {data.labels.map((label, i) => (
              <tr key={i}>
                <td>
                  <input
                    aria-label={t("chart.category", { index: i + 1 })}
                    value={label}
                    disabled={disabled}
                    onChange={(e) =>
                      update({
                        ...data,
                        labels: data.labels.map((l, j) =>
                          j === i ? e.target.value : l,
                        ),
                      })
                    }
                  />
                </td>
                {data.series.map((s, j) => (
                  <td key={j}>
                    <input
                      aria-label={
                        j === 0
                          ? t("chart.value", { index: i + 1 })
                          : t("chart.seriesValue", {
                              series: j + 1,
                              index: i + 1,
                            })
                      }
                      inputMode="decimal"
                      value={s.values[i]}
                      disabled={disabled}
                      onChange={(e) =>
                        update({
                          ...data,
                          series: data.series.map((s, k) =>
                            k === j
                              ? {
                                  ...s,
                                  values: s.values.map((v, r) =>
                                    r === i ? e.target.value : v,
                                  ),
                                }
                              : s,
                          ),
                        })
                      }
                    />
                  </td>
                ))}
                <td>
                  <button
                    aria-label={t("chart.removeRow", { index: i + 1 })}
                    disabled={disabled || data.labels.length === 1}
                    onClick={() =>
                      update({
                        labels: data.labels.filter((_, r) => r !== i),
                        series: data.series.map((s) => ({
                          ...s,
                          values: s.values.filter((_, r) => r !== i),
                        })),
                      })
                    }
                  >
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {error && <p role="alert">{displayMessage(t, error)}</p>}
      <div className="eppt-data-grid-actions">
        <button
          disabled={disabled || data.labels.length >= 100}
          onClick={() =>
            update({
              labels: [...data.labels, t("chart.categoryDefault", { index: data.labels.length + 1 })],
              series: data.series.map((s) => ({
                ...s,
                values: [...s.values, "0"],
              })),
            })
          }
        >
          {t("chart.addRow")}
        </button>
        <button
          disabled={
            disabled ||
            data.series.length >= 12 ||
            ["pie", "doughnut"].includes(element.chartType)
          }
          onClick={() =>
            update({
              ...data,
              series: [
                ...data.series,
                {
                  name: t("chart.seriesDefault", { index: data.series.length + 1 }),
                  color: CHART_COLORS[data.series.length % CHART_COLORS.length],
                  values: data.labels.map(() => "0"),
                },
              ],
            })
          }
        >
          {t("chart.addSeries")}
        </button>
        <button disabled={disabled || !dirty} onClick={reset}>
          {t("chart.reset")}
        </button>
        <button
          className="eppt-primary"
          disabled={disabled || !dirty || baseline !== signature}
          onClick={() => {
            if (
              data.labels.some((l) => !l.trim()) ||
              data.series.some((s) =>
                s.values.some((v) => !v.trim() || !Number.isFinite(Number(v))),
              )
            ) {
              setError("chart.invalid");
              return;
            }
            const series = data.series.map((s) => ({
                ...s,
                name: s.name.trim(),
                values: s.values.map(Number),
              })),
              labels = data.labels.map((l) => l.trim()),
              values = series[0].values;
            if (!validChart({ ...element, labels, values, series })) {
              setError(
                ["pie", "doughnut"].includes(element.chartType)
                  ? "chart.pieRule"
                  : "chart.stackRule",
              );
              return;
            }
            onApply(labels, values, series);
            setDirty(false);
            setError("");
          }}
        >
          {t("chart.apply")}
        </button>
      </div>
    </section>
  );
}
