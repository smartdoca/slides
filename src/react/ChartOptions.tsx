import type { ChartElement } from "../model/types";
import { validChart } from "../model/chart";
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
  return (
    <div className="eppt-chart-options">
      <label>
        图表标题
        <CommitInput
          aria-label="图表标题"
          value={element.title ?? ""}
          disabled={disabled}
          onCommit={(title) => onChange({ title })}
        />
      </label>
      {element.chartType === "bar" && (
        <label>
          排列方式
          <select
            aria-label="柱形排列"
            value={element.stacking ?? "none"}
            disabled={disabled}
            onChange={(e) => {
              const stacking = e.target.value as ChartElement["stacking"];
              if (!validChart({ ...element, stacking })) {
                setError("百分比堆积需要非负数，每一分类总值必须大于零");
                return;
              }
              setError("");
              onChange({ stacking });
            }}
          >
            <option value="none">簇状柱形</option>
            <option value="stacked">堆积柱形</option>
            <option value="percent">百分比堆积</option>
          </select>
        </label>
      )}
      {element.chartType === "line" && (
        <label>
          线条样式
          <select
            aria-label="折线样式"
            value={element.curve ?? "linear"}
            disabled={disabled}
            onChange={(e) => onChange({ curve: e.target.value })}
          >
            <option value="linear">直线</option>
            <option value="smooth">平滑曲线</option>
            <option value="step">阶梯线</option>
          </select>
        </label>
      )}
      <label>
        <input
          type="checkbox"
          aria-label="显示图例"
          checked={element.showLegend ?? (element.series?.length ?? 1) > 1}
          disabled={disabled}
          onChange={(e) => onChange({ showLegend: e.target.checked })}
        />
        显示图例
      </label>
      <label>
        <input
          type="checkbox"
          aria-label="显示数值标签"
          checked={element.showLabels ?? false}
          disabled={disabled}
          onChange={(e) => onChange({ showLabels: e.target.checked })}
        />
        显示数值标签
      </label>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
