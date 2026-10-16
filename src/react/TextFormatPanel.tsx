import type { TextElement, TextLeaf, TextParagraph } from "../model/types";
import { textInsets } from "../model/text-format";
import { useT } from "../i18n";
import { CommitInput } from "./CommitInput";
import { ColorPicker } from "./ColorPicker";
import {
  FontMenu,
  FormatIcon,
  FormatMenuItem,
  FormatPopover,
  TextPresetMenu,
} from "./FormatControls";

export function TextFormatPanel({
  element,
  marks,
  paragraph,
  disabled,
  format,
  paragraphFormat,
  setPadding,
  onPatch,
  onPreset,
  usedFonts,
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
  onPatch?(patch: Record<string, unknown>): void;
  onPreset?(id: string): void;
  usedFonts?: string[];
}) {
  const t = useT(),
    insets = textInsets(element);
  const number = (
    label: string,
    value: number,
    min: number,
    max: number,
    change: (n: number) => void,
    prefix?: string,
  ) => (
    <label className="eppt-number-field" title={label}>
      <span aria-hidden="true">{prefix}</span>
      <CommitInput
        aria-label={label}
        disabled={disabled}
        inputMode="decimal"
        value={String(value)}
        onCommit={(input) => {
          const n = Number(input);
          if (input.trim() && Number.isFinite(n) && n >= min && n <= max)
            change(n);
        }}
      />
    </label>
  );
  const iconButton = (
    label: string,
    content: React.ReactNode,
    pressed: boolean,
    change: () => void,
  ) => (
    <button
      key={label}
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={change}
    >
      {content}
    </button>
  );
  const list = paragraph.list ?? (paragraph.bullet ? "bullet" : "none");
  return (
    <section
      className="eppt-text-format-panel"
      aria-label={t("format.advanced")}
    >
      <h3>{t("style.font")}</h3>
      {onPreset && (
        <TextPresetMenu
          marks={marks ?? {}}
          disabled={disabled}
          onPreset={onPreset}
        />
      )}
      <div className="eppt-panel-font-row">
        <FontMenu
          value={marks?.fontFamily ?? "Arial"}
          used={usedFonts}
          disabled={disabled}
          onChange={(fontFamily) => format({ fontFamily })}
        />
        {number(
          t("toolbar.fontSize"),
          marks?.fontSize ?? 24,
          6,
          200,
          (fontSize) => format({ fontSize }),
        )}
      </div>
      <div className="eppt-panel-segments">
        {(["bold", "strike", "italic", "underline"] as const).map((mark) =>
          iconButton(
            t(mark === "strike" ? "format.strike" : `toolbar.${mark}`),
            <span
              style={{
                fontWeight: mark === "bold" ? 600 : undefined,
                fontStyle: mark === "italic" ? "italic" : undefined,
                textDecoration:
                  mark === "strike"
                    ? "line-through"
                    : mark === "underline"
                      ? "underline"
                      : undefined,
              }}
            >
              {{ bold: "B", strike: "S", italic: "I", underline: "U" }[mark]}
            </span>,
            !!marks?.[mark],
            () => format({ [mark]: !marks?.[mark] }),
          ),
        )}
      </div>
      <div className="eppt-panel-color-row">
        <span>{t("toolbar.textColor")}</span>
        <ColorPicker
          circle
          label={t("toolbar.textColor")}
          value={marks?.color ?? element.fill ?? "#1f2329"}
          disabled={disabled}
          onChange={(color) => format({ color })}
        />
      </div>
      <div className="eppt-panel-color-row">
        <span>{t("feishu.highlight")}</span>
        <ColorPicker
          circle
          label={t("color.highlight")}
          value={marks?.backgroundColor}
          clearable
          disabled={disabled}
          onChange={(backgroundColor) =>
            format({ backgroundColor: backgroundColor ?? "transparent" })
          }
        />
      </div>
      <h3>{t("props.paragraph")}</h3>
      <div className="eppt-panel-paragraph-row">
        <div className="eppt-panel-segments">
          {(["left", "center", "right"] as const).map((align) =>
            iconButton(
              t(`style.align.${align}`),
              <FormatIcon
                name={
                  align === "left"
                    ? "alignLeft"
                    : align === "center"
                      ? "alignCenter"
                      : "alignRight"
                }
              />,
              (paragraph.align ?? "left") === align,
              () => paragraphFormat({ align }),
            ),
          )}
        </div>
        <div className="eppt-panel-segments">
          {(["top", "middle", "bottom"] as const).map((verticalAlign) =>
            iconButton(
              t(`props.${verticalAlign}`),
              <FormatIcon name={verticalAlign} />,
              (element.verticalAlign ?? "top") === verticalAlign,
              () => onPatch?.({ verticalAlign }),
            ),
          )}
        </div>
      </div>
      <div className="eppt-panel-paragraph-row">
        {(["bullet", "number"] as const).map((kind) => (
          <FormatPopover
            key={kind}
            label={t(kind === "bullet" ? "format.bullet" : "format.number")}
            disabled={disabled}
            trigger={
              <>
                <FormatIcon name={kind === "bullet" ? "list" : "number"} />
                <span className="eppt-chevron">⌄</span>
              </>
            }
          >
            {(close) => (
              <>
                {(["none", kind] as const).map((value) => (
                  <FormatMenuItem
                    key={value}
                    checked={list === value}
                    onClick={() => {
                      paragraphFormat({
                        list: value,
                        bullet: value === "bullet",
                      });
                      close();
                    }}
                  >
                    {t(
                      value === "none"
                        ? "format.listNone"
                        : value === "bullet"
                          ? "feishu.unordered"
                          : "feishu.ordered",
                    )}
                  </FormatMenuItem>
                ))}
              </>
            )}
          </FormatPopover>
        ))}
      </div>
      <div className="eppt-panel-paragraph-row">
        {number(
          t("format.lineHeight"),
          paragraph.lineHeight ?? 1.2,
          0.5,
          5,
          (lineHeight) => paragraphFormat({ lineHeight }),
          "↕A",
        )}
        {number(
          t("feishu.letterSpacing"),
          marks?.letterSpacing ?? 0,
          -5,
          100,
          (letterSpacing) => format({ letterSpacing }),
          "|A|",
        )}
      </div>
      <h3>{t("feishu.textInsets")}</h3>
      <div className="eppt-inset-grid">
        {(["left", "right", "top", "bottom"] as const).map((side, index) => (
          <div key={side}>
            {number(
              t(`feishu.inset.${side}`),
              insets[side],
              0,
              200,
              (value) =>
                onPatch
                  ? onPatch({ paddingInsets: { [side]: value } })
                  : setPadding(value),
              ["⊣", "⊢", "⊤", "⊥"][index],
            )}
          </div>
        ))}
      </div>
      <details className="eppt-paragraph-details">
        <summary>{t("feishu.paragraphSpacing")}</summary>
        <div className="eppt-panel-paragraph-row">
          {number(
            t("format.spaceBefore"),
            paragraph.spaceBefore ?? 0,
            0,
            240,
            (spaceBefore) => paragraphFormat({ spaceBefore }),
            t("feishu.before"),
          )}
          {number(
            t("format.spaceAfter"),
            paragraph.spaceAfter ?? 0,
            0,
            240,
            (spaceAfter) => paragraphFormat({ spaceAfter }),
            t("feishu.after"),
          )}
        </div>
        <div className="eppt-panel-segments">
          {iconButton(
            t("format.outdent"),
            <FormatIcon name="outdent" />,
            false,
            () =>
              paragraphFormat({
                indentLevel: Math.max(0, (paragraph.indentLevel ?? 0) - 1),
              }),
          )}
          {iconButton(
            t("format.indent"),
            <FormatIcon name="indent" />,
            false,
            () =>
              paragraphFormat({
                indentLevel: Math.min(8, (paragraph.indentLevel ?? 0) + 1),
              }),
          )}
        </div>
      </details>
      <div className="eppt-panel-color-row">
        <span>{t("feishu.fill")}</span>
        <ColorPicker
          circle
          label={t("color.textBackground")}
          value={element.background}
          clearable
          disabled={disabled}
          onChange={(background) => onPatch?.({ background })}
        />
      </div>
      {number(
        t("props.opacityLabel"),
        Math.round((element.opacity ?? 1) * 100),
        0,
        100,
        (value) => onPatch?.({ opacity: value / 100 }),
        t("props.opacityLabel"),
      )}
    </section>
  );
}
