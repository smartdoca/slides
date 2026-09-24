// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { expect, it, vi, beforeEach, afterEach } from "vitest";
import { PptxImportDialog } from "./PptxImportDialog";
let host: HTMLDivElement, root: Root;
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  HTMLDialogElement.prototype.showModal = vi.fn();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});
function choose(file: File) {
  const input = host.querySelector('input[type="file"]')!;
  Object.defineProperty(input, "files", { value: [file], configurable: true });
  act(() => input.dispatchEvent(new Event("change", { bubbles: true })));
}
function button(label: string) {
  return [...host.querySelectorAll("button")].find(
    (b) => b.textContent === label,
  )!;
}
it("validates actual selection and keeps failed uploads retryable", async () => {
  const upload = vi.fn().mockRejectedValue(new Error("文件损坏")),
    close = vi.fn();
  act(() =>
    root.render(<PptxImportDialog onImport={upload} onClose={close} />),
  );
  choose(new File(["bad"], "bad.json"));
  expect(button("上传并打开").disabled).toBe(true);
  expect(upload).not.toHaveBeenCalled();
  choose(new File(["pptx"], "报告.pptx"));
  await act(async () => button("上传并打开").click());
  expect(host.querySelector('[role="alert"]')?.textContent).toBe("文件损坏");
  expect(close).not.toHaveBeenCalled();
  expect(button("上传并打开").disabled).toBe(false);
});
it("cancels in-flight upload and ignores late resolution", async () => {
  let resolve!: () => void, signal!: AbortSignal;
  const close = vi.fn();
  const upload = vi.fn((_file: File, ctx: { signal: AbortSignal }) => {
    signal = ctx.signal;
    return new Promise<void>((r) => (resolve = r));
  });
  act(() =>
    root.render(<PptxImportDialog onImport={upload} onClose={close} />),
  );
  choose(new File(["pptx"], "报告.pptx"));
  await act(async () => button("上传并打开").click());
  expect(button("正在导入…").disabled).toBe(true);
  act(() => button("取消上传").click());
  expect(signal.aborted).toBe(true);
  expect(close).toHaveBeenCalledTimes(1);
  await act(async () => resolve());
  expect(close).toHaveBeenCalledTimes(1);
});
it("aborts if edit permission is revoked", async () => {
  let signal!: AbortSignal;
  const upload = (_file: File, ctx: { signal: AbortSignal }) => {
      signal = ctx.signal;
      return new Promise<void>(() => {});
    },
    close = vi.fn();
  act(() =>
    root.render(<PptxImportDialog onImport={upload} onClose={close} />),
  );
  choose(new File(["pptx"], "a.pptx"));
  await act(async () => button("上传并打开").click());
  act(() =>
    root.render(
      <PptxImportDialog disabled onImport={upload} onClose={close} />,
    ),
  );
  expect(signal.aborted).toBe(true);
  expect(close).toHaveBeenCalledTimes(1);
});
