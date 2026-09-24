import { useEffect, useState } from "react";
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
    <section className="eppt-chart-data" aria-label="图表数据编辑">
      <h3>图表数据</h3>
      <p>编辑后应用，支持撤销</p>
      {dirty && baseline !== signature && (
        <p role="alert">数据已被协作者修改。请重新载入后再编辑。</p>
      )}
      <div className="eppt-chart-sheet">
        <table>
          <thead>
            <tr>
              <th>分类</th>
              {data.series.map((s, j) => (
                <th key={j}>
                  <input
                    aria-label={`系列 ${j + 1} 名称`}
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
                    aria-label={`系列 ${j + 1} 颜色`}
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
                    aria-label={`移除系列 ${j + 1}`}
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
                    aria-label={`第 ${i + 1} 项分类`}
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
                          ? `第 ${i + 1} 项数值`
                          : `系列 ${j + 1} 第 ${i + 1} 项数值`
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
                    aria-label={`移除第 ${i + 1} 项`}
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
      {error && <p role="alert">{error}</p>}
      <div className="eppt-data-grid-actions">
        <button
          disabled={disabled || data.labels.length >= 100}
          onClick={() =>
            update({
              labels: [...data.labels, `分类 ${data.labels.length + 1}`],
              series: data.series.map((s) => ({
                ...s,
                values: [...s.values, "0"],
              })),
            })
          }
        >
          ＋ 添加一行
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
                  name: `系列 ${data.series.length + 1}`,
                  color: CHART_COLORS[data.series.length % CHART_COLORS.length],
                  values: data.labels.map(() => "0"),
                },
              ],
            })
          }
        >
          ＋ 添加系列
        </button>
        <button disabled={disabled || !dirty} onClick={reset}>
          重置
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
              setError("请填写分类和有效数值");
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
                  ? "饼图和环形图需要非负值，且至少一项大于零"
                  : "请填写系列名称；百分比堆积需要非负数据且每一分类总值大于零",
              );
              return;
            }
            onApply(labels, values, series);
            setDirty(false);
            setError("");
          }}
        >
          应用数据
        </button>
      </div>
    </section>
  );
}
