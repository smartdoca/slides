import {
  useEffect,
  useRef,
  useState,
  type TextareaHTMLAttributes,
} from "react";
export function CommitTextarea({
  value,
  onCommit,
  ...props
}: Omit<
  TextareaHTMLAttributes<HTMLTextAreaElement>,
  "value" | "defaultValue" | "onChange"
> & { value: string; onCommit(value: string): void }) {
  const [draft, setDraft] = useState(value),
    focused = useRef(false),
    start = useRef(value);
  useEffect(() => {
    if (!focused.current) setDraft(value);
  }, [value]);
  return (
    <textarea
      {...props}
      value={draft}
      onFocus={() => {
        focused.current = true;
        start.current = draft;
      }}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        focused.current = false;
        if (draft !== start.current) onCommit(draft);
        else setDraft(value);
      }}
    />
  );
}
