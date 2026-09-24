// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ChartDataEditor } from "./ChartDataEditor";
import type { ChartElement } from "../model/types";
let root: Root, host: HTMLDivElement;
const element: ChartElement = {
  id: "c",
  type: "chart",
  chartType: "pie",
  color: "#527eff",
  labels: ["A", "B"],
  values: [2, 3],
  transform: { x: 0, y: 0, width: 100, height: 100, rotation: 0 },
};
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});
function edit(label: string, value: string) {
  const input = host.querySelector<HTMLInputElement>(
    `[aria-label="${label}"]`,
  )!;
  act(() => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
function button(text: string) {
  return [...host.querySelectorAll("button")].find(
    (b) => b.textContent === text,
  )!;
}
it("validates draft and applies a single data update", () => {
  const apply = vi.fn();
  act(() =>
    root.render(
      <ChartDataEditor element={element} disabled={false} onApply={apply} />,
    ),
  );
  edit("第 1 项数值", "-2");
  act(() => button("应用数据").click());
  expect(apply).not.toHaveBeenCalled();
  expect(host.querySelector('[role="alert"]')?.textContent).toContain("非负");
  edit("第 1 项数值", "5.5");
  act(() => button("应用数据").click());
  expect(apply).toHaveBeenCalledExactlyOnceWith(
    ["A", "B"],
    [5.5, 3],
    [{ name: "系列 1", values: [5.5, 3], color: "#527eff" }],
  );
});
it("does not overwrite newer remote data with an old local draft", () => {
  const apply = vi.fn();
  act(() =>
    root.render(
      <ChartDataEditor element={element} disabled={false} onApply={apply} />,
    ),
  );
  edit("第 1 项数值", "9");
  const remote = { ...element, values: [6, 3] };
  act(() =>
    root.render(
      <ChartDataEditor element={remote} disabled={false} onApply={apply} />,
    ),
  );
  expect(button("应用数据").disabled).toBe(true);
  expect(host.querySelector('[role="alert"]')?.textContent).toContain("协作者");
  act(() => button("重置").click());
  expect(
    host.querySelector<HTMLInputElement>('[aria-label="第 1 项数值"]')?.value,
  ).toBe("6");
  edit("第 1 项数值", "8");
  act(() =>
    root.render(<ChartDataEditor element={remote} disabled onApply={apply} />),
  );
  expect(
    host.querySelector<HTMLInputElement>('[aria-label="第 1 项数值"]')?.value,
  ).toBe("6");
  expect(button("应用数据").disabled).toBe(true);
  expect(apply).not.toHaveBeenCalled();
});
