import { useEffect, useRef, useState, type InputHTMLAttributes } from "react";

/** Keep remote changes visible without resetting an in-progress local draft. */
export function CommitInput({
  value,
  onCommit,
  ...props
}: Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "value" | "defaultValue" | "onChange"
> & { value: string; onCommit(value: string): void }) {
  const [draft, setDraft] = useState(value);
  const focused = useRef(false),
    start = useRef(value);
  useEffect(() => {
    if (!focused.current || props.disabled) {
      setDraft(value);
      if (props.disabled) start.current = value;
    }
  }, [value, props.disabled]);
  return (
    <input
      {...props}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onFocus={(e) => {
        focused.current = true;
        start.current = draft;
        props.onFocus?.(e);
      }}
      onBlur={(e) => {
        focused.current = false;
        if (!props.disabled && draft !== start.current) onCommit(draft);
        setDraft(value);
        props.onBlur?.(e);
      }}
      onKeyDown={(e) => {
        props.onKeyDown?.(e);
        if (e.defaultPrevented) return;
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          setDraft(value);
          start.current = draft;
          e.currentTarget.blur();
        }
      }}
    />
  );
}
