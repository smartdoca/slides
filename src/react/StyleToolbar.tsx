import { useEffect, useState, type ReactNode } from "react";
import { useT } from "../i18n";
import type { SlideElement } from "../model/types";
import { safeTextLink } from "../model/text-format";
import {
  SHAPE_STYLES,
  type CharacterStyle,
  type ParagraphStyle,
} from "../model/styles";
import { ColorPicker } from "./ColorPicker";
import { CommitInput } from "./CommitInput";
import {
  FontMenu,
  FormatIcon,
  FormatMenuItem,
  FormatPopover,
  TextPresetMenu,
} from "./FormatControls";

export interface StyleToolbarProps {
  elements: SlideElement[];
  marks: CharacterStyle & { link?: string };
  paragraph: ParagraphStyle;
  disabled: boolean;
  painter: "once" | "continuous" | null;
  canCopy: boolean;
  canPaste: boolean;
  usedFonts?: string[];
  propertiesOpen?: boolean;
  onPainter(continuous: boolean): void;
  onCopy(): void;
  onPaste(): void;
  onClear(): void;
  onFormat(marks: CharacterStyle & { link?: string }): void;
  onParagraph(paragraph: ParagraphStyle): void;
  onStepSize(direction: 1 | -1): void;
  onPatch(patch: Record<string, unknown>): void;
  onPreset(id: string): void;
  onProperties?(): void;
}
export function StyleToolbar(props: StyleToolbarProps) {
  const {
    elements,
    marks,
    paragraph,
    disabled,
    painter,
    onFormat,
    onParagraph,
    onPreset,
  } = props;
  const t = useT(),
    [link, setLink] = useState(""),
    [linkError, setLinkError] = useState(false);
  useEffect(() => {
    setLink(marks.link ?? "");
    setLinkError(false);
  }, [marks.link, elements.map((element) => element.id).join(",")]);
  const texts =
      elements.length > 0 && elements.every((el) => el.type === "text"),
    shapes =
      elements.length > 0 &&
      elements.every((el) => el.type === "shape" || el.type === "line");
  const common = (key: string) => {
    const values = elements.map(
      (el) => (el as unknown as Record<string, unknown>)[key],
    );
    return values.every((value) => value === values[0]) ? values[0] : undefined;
  };
  const iconButton = (
    label: string,
    icon: ReactNode,
    run: () => void,
    pressed?: boolean | "mixed",
    blocked = false,
  ) => (
    <button
      type="button"
      key={label}
      aria-label={label}
      title={label}
      disabled={disabled || blocked}
      aria-pressed={pressed}
      onMouseDown={(event) => event.preventDefault()}
      onClick={run}
    >
      {icon}
    </button>
  );
  return (
    <div
      className="eppt-selection-format"
      role="group"
      aria-label={t("style.tools")}
    >
      {texts && (
        <>
          <TextPresetMenu
            marks={marks}
            disabled={disabled}
            onPreset={onPreset}
          />
          <span className="eppt-format-divider" />
          <FontMenu
            value={marks.fontFamily}
            used={props.usedFonts}
            disabled={disabled}
            onChange={(fontFamily) => onFormat({ fontFamily })}
          />
          <div
            className="eppt-font-stepper"
            role="group"
            aria-label={t("toolbar.fontSize")}
          >
            {iconButton(t("style.shrink"), "−", () => props.onStepSize(-1))}
            <CommitInput
              aria-label={t("toolbar.fontSize")}
              inputMode="decimal"
              value={marks.fontSize === undefined ? "" : String(marks.fontSize)}
              placeholder="—"
              disabled={disabled}
              onCommit={(input) => {
                const size = Number(input);
                if (
                  input.trim() &&
                  Number.isFinite(size) &&
                  size >= 6 &&
                  size <= 200
                )
                  onFormat({ fontSize: size });
              }}
            />
            {iconButton(t("style.grow"), "+", () => props.onStepSize(1))}
          </div>
          <FormatPopover
            label={t("float.align")}
            disabled={disabled}
            trigger={
              <>
                <FormatIcon
                  name={
                    paragraph.align === "center"
                      ? "alignCenter"
                      : paragraph.align === "right"
                        ? "alignRight"
                        : "alignLeft"
                  }
                />
                <span className="eppt-chevron">⌄</span>
              </>
            }
          >
            {(close) => (
              <>
                {(["left", "center", "right"] as const).map((align) => (
                  <FormatMenuItem
                    key={align}
                    checked={paragraph.align === align}
                    icon={
                      <FormatIcon
                        name={
                          align === "left"
                            ? "alignLeft"
                            : align === "center"
                              ? "alignCenter"
                              : "alignRight"
                        }
                      />
                    }
                    onClick={() => {
                      onParagraph({ align });
                      close();
                    }}
                  >
                    {t(`style.align.${align}`)}
                  </FormatMenuItem>
                ))}
                <hr />
                <FormatMenuItem
                  disabled={(paragraph.indentLevel ?? 0) >= 8}
                  icon={<FormatIcon name="indent" />}
                  onClick={() => {
                    onParagraph({
                      indentLevel: Math.min(
                        8,
                        (paragraph.indentLevel ?? 0) + 1,
                      ),
                    });
                    close();
                  }}
                >
                  {t("format.indent")}
                </FormatMenuItem>
                <FormatMenuItem
                  disabled={(paragraph.indentLevel ?? 0) <= 0}
                  icon={<FormatIcon name="outdent" />}
                  onClick={() => {
                    onParagraph({
                      indentLevel: Math.max(
                        0,
                        (paragraph.indentLevel ?? 0) - 1,
                      ),
                    });
                    close();
                  }}
                >
                  {t("format.outdent")}
                </FormatMenuItem>
              </>
            )}
          </FormatPopover>
          <FormatPopover
            label={t("format.list")}
            disabled={disabled}
            trigger={
              <>
                <FormatIcon
                  name={paragraph.list === "number" ? "number" : "list"}
                />
                <span className="eppt-chevron">⌄</span>
              </>
            }
          >
            {(close) =>
              (["none", "bullet", "number"] as const).map((list) => (
                <FormatMenuItem
                  key={list}
                  checked={paragraph.list === list}
                  onClick={() => {
                    onParagraph({ list, bullet: list === "bullet" });
                    close();
                  }}
                >
                  {t(
                    list === "none"
                      ? "format.listNone"
                      : list === "bullet"
                        ? "feishu.unordered"
                        : "feishu.ordered",
                  )}
                </FormatMenuItem>
              ))
            }
          </FormatPopover>
          {iconButton(
            t("toolbar.bold"),
            <b>B</b>,
            () => onFormat({ bold: !marks.bold }),
            marks.bold ?? "mixed",
          )}
          <FormatPopover
            label={t("format.link")}
            role="dialog"
            width={272}
            disabled={disabled}
            trigger={<FormatIcon name="link" />}
          >
            {(close) => (
              <form
                className="eppt-link-popover"
                onSubmit={(event) => {
                  event.preventDefault();
                  const url = safeTextLink(link);
                  if (!url) {
                    setLinkError(true);
                    return;
                  }
                  onFormat({ link: url });
                  setLinkError(false);
                  close();
                }}
              >
                <label>
                  {t("format.link")}
                  <input
                    aria-label={t("format.linkLabel")}
                    value={link}
                    placeholder="https://"
                    onChange={(event) => {
                      setLink(event.target.value);
                      setLinkError(false);
                    }}
                  />
                </label>
                <div>
                  <button
                    type="button"
                    disabled={!marks.link}
                    onClick={() => {
                      onFormat({ link: "" });
                      setLink("");
                      close();
                    }}
                  >
                    {t("format.removeLink")}
                  </button>
                  <button type="submit" className="eppt-primary">
                    {t("format.applyLink")}
                  </button>
                </div>
                {linkError && <p role="alert">{t("format.linkError")}</p>}
              </form>
            )}
          </FormatPopover>
          <ColorPicker
            label={t("toolbar.textColor")}
            value={marks.color}
            mark="text"
            disabled={disabled}
            onChange={(color) => onFormat({ color })}
            highlightValue={marks.backgroundColor}
            onHighlightChange={(backgroundColor) =>
              onFormat({ backgroundColor: backgroundColor ?? "transparent" })
            }
          />
        </>
      )}
      {shapes && (
        <>
          <FormatPopover
            label={t("style.shape")}
            disabled={disabled}
            width={236}
            trigger={
              <>
                <span>{t("style.shape")}</span>
                <span className="eppt-chevron">⌄</span>
              </>
            }
          >
            {(close) => (
              <div className="eppt-shape-presets">
                {SHAPE_STYLES.map((style) => (
                  <button
                    key={style.id}
                    type="button"
                    aria-label={t(`style.shape.${style.id}`)}
                    title={t(`style.shape.${style.id}`)}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => {
                      onPreset(style.id);
                      close();
                    }}
                  >
                    <span
                      style={{
                        background: style.fill,
                        border: `${Math.max(1, style.strokeWidth)}px solid ${style.stroke}`,
                      }}
                    />
                    {t(`style.shape.${style.id}`)}
                  </button>
                ))}
              </div>
            )}
          </FormatPopover>
          {elements.every((el) => el.type === "shape") && (
            <ColorPicker
              label={t("props.fill")}
              value={common("fill") as string | undefined}
              clearable
              disabled={disabled}
              onChange={(fill) =>
                props.onPatch({ fill: fill ?? "transparent" })
              }
            />
          )}
          <ColorPicker
            label={t("props.borderColor")}
            value={common("stroke") as string | undefined}
            clearable
            disabled={disabled}
            onChange={(stroke) =>
              props.onPatch({ stroke: stroke ?? "transparent" })
            }
          />
          <CommitInput
            aria-label={t("props.borderWidth")}
            className="eppt-outline-width"
            inputMode="decimal"
            disabled={disabled}
            value={
              common("strokeWidth") === undefined
                ? ""
                : String(common("strokeWidth"))
            }
            placeholder="—"
            onCommit={(input) => {
              const strokeWidth = Number(input);
              if (input.trim() && strokeWidth >= 0 && strokeWidth <= 40)
                props.onPatch({ strokeWidth });
            }}
          />
          <span className="eppt-format-divider" />
        </>
      )}
      {!texts && !shapes && (
        <span className="eppt-selection-kind">
          {elements.length > 1
            ? t("selection.count", { count: elements.length })
            : t("float.shape")}
        </span>
      )}
      <button
        type="button"
        aria-label={t("style.painter")}
        title={t("style.painterHint")}
        aria-pressed={!!painter}
        disabled={disabled || (!painter && !props.canCopy)}
        onMouseDown={(event) => event.preventDefault()}
        onClick={(event) => props.onPainter(event.detail > 1)}
        onDoubleClick={() => props.onPainter(true)}
      >
        <FormatIcon name="painter" />
      </button>
      {iconButton(
        t("toolbar.format"),
        <FormatIcon name="format" />,
        () => props.onProperties?.(),
        !!props.propertiesOpen,
      )}
      <FormatPopover
        label={t("feishu.moreFormatting")}
        disabled={disabled}
        trigger={<FormatIcon name="more" />}
        width={218}
      >
        {(close) => (
          <>
            {texts && (
              <>
                {(["italic", "underline", "strike"] as const).map((mark) => (
                  <FormatMenuItem
                    key={mark}
                    checked={!!marks[mark]}
                    onClick={() => {
                      onFormat({ [mark]: !marks[mark] });
                      close();
                    }}
                  >
                    {t(mark === "strike" ? "format.strike" : `toolbar.${mark}`)}
                  </FormatMenuItem>
                ))}
                {(["superscript", "subscript"] as const).map((script) => (
                  <FormatMenuItem
                    key={script}
                    checked={marks.script === script}
                    onClick={() => {
                      onFormat({
                        script: marks.script === script ? "normal" : script,
                      });
                      close();
                    }}
                  >
                    {t(
                      script === "superscript" ? "format.super" : "format.sub",
                    )}
                  </FormatMenuItem>
                ))}
                <hr />
                <FormatMenuItem
                  onClick={() => {
                    props.onClear();
                    close();
                  }}
                >
                  {t("style.clear")}
                </FormatMenuItem>
              </>
            )}
            <FormatMenuItem
              disabled={!props.canCopy}
              onClick={() => {
                props.onCopy();
                close();
              }}
            >
              {t("style.copyShort")}
            </FormatMenuItem>
            <FormatMenuItem
              disabled={!props.canPaste}
              onClick={() => {
                props.onPaste();
                close();
              }}
            >
              {t("style.pasteShort")}
            </FormatMenuItem>
          </>
        )}
      </FormatPopover>
    </div>
  );
}
