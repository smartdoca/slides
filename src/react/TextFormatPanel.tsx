import { useEffect, useState } from "react";
import type { TextElement, TextLeaf, TextParagraph } from "../model/types";
import { safeTextLink } from "../model/text-format";
import { CommitInput } from "./CommitInput";

export function TextFormatPanel({
  element,
  marks,
  paragraph,
  disabled,
  format,
  paragraphFormat,
  setPadding,
}: {
  element: TextElement;
  marks: Partial<TextLeaf> | null;
  paragraph: TextParagraph;
  disabled: boolean;
  format(marks: Omit<TextLeaf, "text">): void;
  paragraphFormat(
    value: Partial<Omit<TextParagraph, "type" | "children">>,
  ): void;
  setPadding(value: number): void;
}) {
  const [link, setLink] = useState(marks?.link ?? ""),
    [error, setError] = useState("");
  useEffect(() => {
    setLink(marks?.link ?? "");
    setError("");
  }, [element.id, marks?.link]);
  const number = (
    label: string,
    value: number,
    min: number,
    max: number,
    change: (v: number) => void,
  ) => (
    <label className="eppt-field" key={label}>
      {label}
      <CommitInput
        aria-label={label}
        disabled={disabled}
        inputMode="decimal"
        value={String(value)}
        onCommit={(text) => {
          const parsed = Number(text);
          if (
            text.trim() &&
            Number.isFinite(parsed) &&
            parsed >= min &&
            parsed <= max
          ) {
            change(parsed);
            setError("");
          } else setError(`${label}需为 ${min}–${max}`);
        }}
      />
    </label>
  );
  return (
    <section aria-label="高级文字排版">
      <div className="eppt-prop-title">文字排版</div>
      <label className="eppt-field">
        列表
        <select
          aria-label="列表类型"
          disabled={disabled}
          value={paragraph.list ?? (paragraph.bullet ? "bullet" : "none")}
          onChange={(e) =>
            paragraphFormat({
              list: e.target.value as TextParagraph["list"],
              bullet: e.target.value === "bullet",
            })
          }
        >
          <option value="none">无列表</option>
          <option value="bullet">项目符号</option>
          <option value="number">多级编号</option>
        </select>
      </label>
      <div className="eppt-align">
        <button
          disabled={disabled || !(paragraph.indentLevel ?? 0)}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() =>
            paragraphFormat({
              indentLevel: Math.max(0, (paragraph.indentLevel ?? 0) - 1),
            })
          }
        >
          减少缩进
        </button>
        <button
          disabled={disabled || (paragraph.indentLevel ?? 0) >= 8}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() =>
            paragraphFormat({
              indentLevel: Math.min(8, (paragraph.indentLevel ?? 0) + 1),
            })
          }
        >
          增加缩进
        </button>
      </div>
      {number("行距倍数", paragraph.lineHeight ?? 1.2, 0.5, 5, (lineHeight) =>
        paragraphFormat({ lineHeight }),
      )}
      {number(
        "段前间距（磅）",
        paragraph.spaceBefore ?? 0,
        0,
        240,
        (spaceBefore) => paragraphFormat({ spaceBefore }),
      )}
      {number(
        "段后间距（磅）",
        paragraph.spaceAfter ?? 0,
        0,
        240,
        (spaceAfter) => paragraphFormat({ spaceAfter }),
      )}
      {number("文本内边距（像素）", element.padding ?? 0, 0, 200, setPadding)}
      <label className="eppt-field">
        上下标
        <select
          aria-label="上下标"
          disabled={disabled}
          value={marks?.script ?? "normal"}
          onChange={(e) =>
            format({ script: e.target.value as TextLeaf["script"] })
          }
        >
          <option value="normal">正常文字</option>
          <option value="superscript">上标</option>
          <option value="subscript">下标</option>
        </select>
      </label>
      <button
        disabled={disabled}
        aria-pressed={marks?.strike ?? false}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => format({ strike: !marks?.strike })}
      >
        删除线
      </button>
      <form
        className="eppt-text-link"
        onSubmit={(e) => {
          e.preventDefault();
          if (disabled) return;
          const url = safeTextLink(link);
          if (!url) {
            setError("链接仅支持 https、http 或 mailto 完整地址");
            return;
          }
          format({ link: url });
          setError("");
        }}
      >
        <label className="eppt-field">
          超链接
          <input
            aria-label="文字超链接"
            disabled={disabled}
            value={link}
            placeholder="https://example.com"
            onChange={(e) => setLink(e.target.value)}
          />
        </label>
        <button disabled={disabled} type="submit">
          应用链接
        </button>{" "}
        <button
          disabled={disabled || !marks?.link}
          type="button"
          onClick={() => {
            format({ link: "" });
            setLink("");
          }}
        >
          移除链接
        </button>
        {marks?.link && safeTextLink(marks.link) && (
          <a
            href={safeTextLink(marks.link)!}
            target="_blank"
            rel="noopener noreferrer"
          >
            打开链接
          </a>
        )}
        <p className="eppt-muted">选中文字时仅应用到选区；放映时可点击链接。</p>
      </form>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
