// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { CommitInput } from "./CommitInput";
let root: Root, host: HTMLDivElement;
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
function edit(input: HTMLInputElement, value: string) {
  act(() => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
it("keeps a numeric draft, commits once on Enter and forwards focus/blur", () => {
  const commit = vi.fn(),
    focus = vi.fn(),
    blur = vi.fn();
  act(() =>
    root.render(
      <CommitInput
        type="number"
        value="10"
        onCommit={commit}
        onFocus={focus}
        onBlur={blur}
      />,
    ),
  );
  const input = host.querySelector("input")!;
  act(() => input.focus());
  edit(input, "");
  edit(input, "-12.5");
  expect(commit).not.toHaveBeenCalled();
  act(() =>
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    ),
  );
  expect(commit).toHaveBeenCalledExactlyOnceWith("-12.5");
  expect(focus).toHaveBeenCalledOnce();
  expect(blur).toHaveBeenCalledOnce();
});
it("Escape cancels without committing stale draft and readonly discards edits", () => {
  const commit = vi.fn();
  act(() => root.render(<CommitInput value="original" onCommit={commit} />));
  const input = host.querySelector("input")!;
  act(() => input.focus());
  edit(input, "cancelled");
  act(() =>
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    ),
  );
  expect(commit).not.toHaveBeenCalled();
  expect(input.value).toBe("original");
  act(() => input.focus());
  edit(input, "pending");
  act(() =>
    root.render(<CommitInput disabled value="remote" onCommit={commit} />),
  );
  act(() => input.blur());
  expect(commit).not.toHaveBeenCalled();
  expect(input.value).toBe("remote");
});
