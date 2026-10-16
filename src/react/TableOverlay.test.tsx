// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it } from "vitest";
import { TableOverlay } from "./TableOverlay";
import { createYDocument, readDocument } from "../collaboration/yjs-codec";
import { createPresentation } from "../model/create";
import { EditorController } from "../model/controller";
import type { TableElement } from "../model/types";
import { emuToPx } from "../model/types";
import { tableMetrics } from "../model/table";
let host: HTMLDivElement,
  root: Root,
  c: EditorController,
  d: ReturnType<typeof createYDocument>,
  s: string,
  id: string;
const element = () => readDocument(d).slides[s].elements[id] as TableElement;
function render() {
  root.render(
    <TableOverlay
      element={element()}
      controller={c}
      slideId={s}
      onDone={() => {}}
    />,
  );
}
function click(label: string) {
  const b = [...document.body.querySelectorAll("button")].find(
    (b) => b.getAttribute("aria-label") === label || b.textContent === label,
  )!;
  act(() => b.click());
}
function type(value: string) {
  act(() => {
    const e = host.querySelector("textarea")!;
    Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value",
    )!.set!.call(e, value);
    e.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.ResizeObserver = class {
    observe() {}
    disconnect() {}
  } as any;
  globalThis.requestAnimationFrame = (callback: FrameRequestCallback) => {
    callback(0);
    return 0;
  };
  d = createYDocument(createPresentation());
  c = new EditorController(d);
  s = readDocument(d).slideOrder[0];
  id = c.add(s, "table");
  c.history.clear();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(render);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  c.dispose();
  d.destroy();
});
it("single-click enters a cell, Escape discards its draft without any transaction", () => {
  let writes = 0;
  d.on("update", () => writes++);
  click("第 2 行第 2 列：72");
  expect(host.querySelector("textarea")?.value).toBe("72");
  type("cancel me");
  act(() =>
    host
      .querySelector("textarea")!
      .dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      ),
  );
  expect(element().cells[1][1]).toBe("72");
  expect(writes).toBe(0);
});
it("commits once before inserting a row; stable cell selection follows its data", () => {
  click("第 2 行第 2 列：72");
  type("88");
  click("行列");
  click("上方插行");
  act(render);
  expect(element().cells[2][1]).toBe("88");
  expect(element().cells[1]).toEqual(["", "", ""]);
  expect(host.querySelector("textarea")).toBeNull();
  expect(
    host
      .querySelector('[aria-selected="true"] button')
      ?.getAttribute("aria-label"),
  ).toBe("第 3 行第 2 列：88");
  c.undo();
  expect(element().cells[1][1]).toBe("88");
  c.undo();
  expect(element().cells[1][1]).toBe("72");
});
it("does not replace remote cell content with a stale blur draft", () => {
  click("第 2 行第 2 列：72");
  type("local");
  const e = element();
  c.tableCommand(s, id, {
    kind: "cell",
    row: e.rowIds![1],
    column: e.columnIds![1],
    value: "remote",
  });
  act(render);
  act(() =>
    host
      .querySelector("textarea")!
      .dispatchEvent(new FocusEvent("focusout", { bubbles: true })),
  );
  expect(element().cells[1][1]).toBe("remote");
  expect(host.querySelector("textarea")?.value).toBe("local");
  expect(host.querySelector('[role="alert"]')?.textContent).toContain("协作者");
});
function key(value: string, options: KeyboardEventInit = {}) {
  act(() =>
    host.querySelector(".eppt-table-overlay")!.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: value,
        bubbles: true,
        cancelable: true,
        ...options,
      }),
    ),
  );
}
it("selects rows and extends with Shift, clears only the rectangle and undoes once", () => {
  const before = structuredClone(element().cells);
  click("选择第 2 行");
  key("ArrowDown", { shiftKey: true });
  expect(
    host.querySelectorAll('[role="gridcell"][aria-selected="true"]'),
  ).toHaveLength(6);
  key("Delete");
  act(render);
  expect(element().cells.slice(1)).toEqual([
    ["", "", ""],
    ["", "", ""],
  ]);
  expect(element().cells[0]).toEqual(before[0]);
  expect(c.history.undoStack).toHaveLength(1);
  c.undo();
  act(render);
  expect(element().cells).toEqual(before);
});
it("Tab wraps, Shift Tab goes back and the last visible cell adds one row", () => {
  click("第 3 行第 3 列：60");
  act(() =>
    host.querySelector("textarea")!.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Tab",
        bubbles: true,
        cancelable: true,
      }),
    ),
  );
  act(render);
  expect(element().cells).toHaveLength(4);
  expect(
    host
      .querySelector('[role="gridcell"][aria-selected="true"] button')
      ?.getAttribute("data-r"),
  ).toBe("3");
  key("Tab", { shiftKey: true });
  expect(
    host
      .querySelector('[role="gridcell"][aria-selected="true"] button')
      ?.getAttribute("data-c"),
  ).toBe("2");
  expect(c.history.undoStack).toHaveLength(1);
});
it("selection and menu inspection create no content transactions, and IME Tab cannot commit", () => {
  let writes = 0;
  d.on("update", () => writes++);
  click("选择第 2 列");
  key("ArrowDown", { shiftKey: true });
  click("行列");
  expect(writes).toBe(0);
  click("行列");
  click("第 2 行第 2 列：72");
  type("中文输入");
  act(() =>
    host.querySelector("textarea")!.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Tab",
        bubbles: true,
        cancelable: true,
        isComposing: true,
      }),
    ),
  );
  expect(host.querySelector("textarea")?.value).toBe("中文输入");
  expect(writes).toBe(0);
});
it("pastes a TSV matrix, selects the pasted rectangle, and keeps one undo step", () => {
  click("第 2 行第 2 列：72");
  const event = new Event("paste", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "clipboardData", {
    value: {
      getData: (type: string) =>
        type === "text/plain" ? "一\t二\n三\t四" : "",
    },
  });
  act(() => host.querySelector("textarea")!.dispatchEvent(event));
  act(render);
  expect(
    element()
      .cells.slice(1)
      .map((row) => row.slice(1)),
  ).toEqual([
    ["一", "二"],
    ["三", "四"],
  ]);
  expect(
    host.querySelectorAll('[role="gridcell"][aria-selected="true"]'),
  ).toHaveLength(4);
  expect(c.history.undoStack).toHaveLength(1);
  c.undo();
  expect(element().cells[1][1]).toBe("72");
});
it("cuts a selected row with native table data and restores it with undo", () => {
  click("选择第 2 行");
  const data = new Map<string, string>();
  const event = new Event("cut", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "clipboardData", {
    value: { setData: (type: string, value: string) => data.set(type, value) },
  });
  act(() => host.querySelector(".eppt-table-overlay")!.dispatchEvent(event));
  act(render);
  expect(data.get("text/plain")).toBe("产品\t72\t90");
  expect(data.get("text/html")).toContain("<table>");
  expect(element().cells[1]).toEqual(["", "", ""]);
  c.undo();
  expect(element().cells[1][0]).toBe("产品");
});
it("cancels asynchronous menu paste when the cell selection changes", async () => {
  const descriptor = Object.getOwnPropertyDescriptor(navigator, "clipboard");
  let resolve!: (items: any[]) => void;
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: {
      read: () =>
        new Promise<any[]>((r) => {
          resolve = r;
        }),
    },
  });
  let writes = 0;
  d.on("update", () => writes++);
  try {
    click("表格设置");
    click("粘贴单元格");
    click("选择第 2 行");
    await act(async () => {
      resolve([
        {
          types: ["text/plain"],
          getType: async () => ({ text: async () => "迟到\t粘贴" }),
        },
      ]);
    });
    expect(writes).toBe(0);
    expect(element().cells[0]).toEqual(["项目", "本期", "目标"]);
  } finally {
    if (descriptor) Object.defineProperty(navigator, "clipboard", descriptor);
    else Reflect.deleteProperty(navigator, "clipboard");
  }
});
it("retains a draft when its row is deleted remotely and never writes it into another cell", () => {
  click("第 2 行第 2 列：72");
  type("尚未提交的草稿");
  let writes = 0;
  d.on("update", () => writes++);
  act(() => {
    c.tableCommand(s, id, { kind: "delete-row", target: element().rowIds![1] });
    render();
  });
  expect(
    host.querySelector<HTMLTextAreaElement>('[aria-label="保留的单元格草稿"]')
      ?.value,
  ).toBe("尚未提交的草稿");
  expect(element().cells.flat()).not.toContain("尚未提交的草稿");
  expect(writes).toBe(1);
});

it.each(["toolbar", "context"] as const)(
  "%s structure commands preserve stable targets, undo and deletion guards",
  (surface) => {
    const before = structuredClone(element());
    const openMenu = () => {
      if (surface === "toolbar") click("行列");
      else
        act(() =>
          host.querySelector(".eppt-table-overlay")!.dispatchEvent(
            new MouseEvent("contextmenu", {
              bubbles: true,
              cancelable: true,
              clientX: 10,
              clientY: 10,
            }),
          ),
        );
    };
    click("选择第 2 行");
    openMenu();
    click("上方插行");
    act(render);
    expect(element().cells[1]).toEqual(["", "", ""]);
    expect(element().rowIds![2]).toBe(before.rowIds![1]);
    openMenu();
    const menu = document.body.querySelector(
      surface === "toolbar" ? ".eppt-format-popover" : ".eppt-element-menu",
    )!;
    expect(
      [...menu.querySelectorAll("button")].find(
        (button) => button.textContent === "删除列",
      )!.disabled,
    ).toBe(true);
    click("删除行");
    act(render);
    expect(element().cells).toEqual([
      before.cells[0],
      ["", "", ""],
      before.cells[2],
    ]);
    expect(c.history.undoStack).toHaveLength(2);
    c.undo();
    c.undo();
    expect(element()).toEqual(before);
  },
);

it.each([
  ["column", "ArrowRight", "ArrowDown", "width"],
  ["row", "ArrowDown", "ArrowRight", "height"],
] as const)(
  "%s resize changes its extent once, ignores keys on the other axis and undoes completely",
  (axis, resizeKey, otherKey, dimension) => {
    const before = structuredClone(element()),
      separator = host.querySelector(
        `[aria-label="调整第 1 ${axis === "column" ? "列宽" : "行高"}"]`,
      )!;
    let writes = 0;
    d.on("update", () => writes++);
    const press = (key: string) =>
      act(() =>
        separator.dispatchEvent(
          new KeyboardEvent("keydown", {
            key,
            bubbles: true,
            cancelable: true,
          }),
        ),
      );
    press(otherKey);
    expect(writes).toBe(0);
    press(resizeKey);
    const next = element(),
      metrics = tableMetrics(next),
      original = tableMetrics(before);
    expect(emuToPx(next.transform[dimension])).toBeCloseTo(
      emuToPx(before.transform[dimension]) + 8,
    );
    expect(axis === "column" ? metrics.rows : metrics.columns).toEqual(
      axis === "column" ? original.rows : original.columns,
    );
    expect(writes).toBe(1);
    expect(c.history.undoStack).toHaveLength(1);
    c.undo();
    expect(element()).toEqual(before);
  },
);
