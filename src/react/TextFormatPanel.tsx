import { useEffect, useState } from "react";
import type { TextElement, TextLeaf, TextParagraph } from "../model/types";
import { safeTextLink } from "../model/text-format";
import { phraseText, useT, type Phrase } from "../i18n";
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
    [error, setError] = useState<Phrase | null>(null);
  const t = useT();
  useEffect(() => {
    setLink(marks?.link ?? "");
    setError(null);
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
            setError(null);
          } else
            setError({
              key: "format.range",
              vars: { label, min, max },
            });
        }}
      />
    </label>
  );
  return (
    <section aria-label={t("format.advanced")}>
      <div className="eppt-prop-title">{t("format.title")}</div>
      <label className="eppt-field">
        {t("format.list")}
        <select
          aria-label={t("format.listType")}
          disabled={disabled}
          value={paragraph.list ?? (paragraph.bullet ? "bullet" : "none")}
          onChange={(e) =>
            paragraphFormat({
              list: e.target.value as TextParagraph["list"],
              bullet: e.target.value === "bullet",
            })
          }
        >
          <option value="none">{t("format.listNone")}</option>
          <option value="bullet">{t("format.bullet")}</option>
          <option value="number">{t("format.number")}</option>
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
          {t("format.outdent")}
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
          {t("format.indent")}
        </button>
      </div>
      {number(t("format.lineHeight"), paragraph.lineHeight ?? 1.2, 0.5, 5, (lineHeight) =>
        paragraphFormat({ lineHeight }),
      )}
      {number(
        t("format.spaceBefore"),
        paragraph.spaceBefore ?? 0,
        0,
        240,
        (spaceBefore) => paragraphFormat({ spaceBefore }),
      )}
      {number(
        t("format.spaceAfter"),
        paragraph.spaceAfter ?? 0,
        0,
        240,
        (spaceAfter) => paragraphFormat({ spaceAfter }),
      )}
      {number(t("format.padding"), element.padding ?? 0, 0, 200, setPadding)}
      <label className="eppt-field">
        {t("format.script")}
        <select
          aria-label={t("format.script")}
          disabled={disabled}
          value={marks?.script ?? "normal"}
          onChange={(e) =>
            format({ script: e.target.value as TextLeaf["script"] })
          }
        >
          <option value="normal">{t("format.normal")}</option>
          <option value="superscript">{t("format.super")}</option>
          <option value="subscript">{t("format.sub")}</option>
        </select>
      </label>
      <button
        disabled={disabled}
        aria-pressed={marks?.strike ?? false}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => format({ strike: !marks?.strike })}
      >
        {t("format.strike")}
      </button>
      <form
        className="eppt-text-link"
        onSubmit={(e) => {
          e.preventDefault();
          if (disabled) return;
          const url = safeTextLink(link);
          if (!url) {
            setError({ key: "format.linkError" });
            return;
          }
          format({ link: url });
          setError(null);
        }}
      >
        <label className="eppt-field">
          {t("format.link")}
          <input
            aria-label={t("format.linkLabel")}
            disabled={disabled}
            value={link}
            placeholder="https://example.com"
            onChange={(e) => setLink(e.target.value)}
          />
        </label>
        <button disabled={disabled} type="submit">
          {t("format.applyLink")}
        </button>{" "}
        <button
          disabled={disabled || !marks?.link}
          type="button"
          onClick={() => {
            format({ link: "" });
            setLink("");
          }}
        >
          {t("format.removeLink")}
        </button>
        {marks?.link && safeTextLink(marks.link) && (
          <a
            href={safeTextLink(marks.link)!}
            target="_blank"
            rel="noopener noreferrer"
          >
            {t("format.openLink")}
          </a>
        )}
        <p className="eppt-muted">{t("format.linkHint")}</p>
      </form>
      {error && <p role="alert">{phraseText(t, error)}</p>}
    </section>
  );
}
