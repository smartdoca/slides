// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it } from "vitest";
import { TableOverlay } from "./TableOverlay";
import { createYDocument, readDocument } from "../collaboration/yjs-codec";
import { createPresentation } from "../model/create";
import { EditorController } from "../model/controller";
import type { TableElement } from "../model/types";
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
  const b = [...host.querySelectorAll("button")].find(
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
  click("上方插行");
  act(render);
  expect(element().cells[2][1]).toBe("88");
  expect(element().cells[1]).toEqual(["", "", ""]);
  expect(host.querySelector("textarea")).toBeNull();
  expect(
    host.querySelector('[aria-selected="true"]')?.getAttribute("aria-label"),
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
  expect(host.querySelector('[role="alert"]')?.textContent).toContain("协作者");
});
