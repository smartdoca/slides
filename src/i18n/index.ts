import { createContext, createElement, useContext, useMemo, type ReactNode } from "react";
import { en, zh, type MessageKey } from "./catalog";

export type Translator = (
  key: string,
  vars?: Record<string, string | number>,
) => string;

export type Phrase =
  | { key: string; vars?: Record<string, string | number> }
  | { text: string };

const catalogs: Record<string, Record<string, string>> = { zh, en };

/** Missing locale stays Chinese. Any other unknown code uses English. */
export function resolveLocale(locale?: string) {
  if (!locale || locale === "zh") return "zh";
  return locale in catalogs ? locale : "en";
}

export function htmlLang(locale?: string) {
  return resolveLocale(locale) === "zh" ? "zh-CN" : "en";
}

function lookup(
  catalog: Record<string, string>,
  key: string,
  overrides?: Record<string, string>,
) {
  if (overrides && Object.prototype.hasOwnProperty.call(overrides, key))
    return overrides[key];
  if (Object.prototype.hasOwnProperty.call(catalog, key)) return catalog[key];
  if (Object.prototype.hasOwnProperty.call(en, key)) return en[key as MessageKey];
  return undefined;
}

export function createTranslator(
  locale?: string,
  overrides?: Record<string, string>,
): Translator {
  const catalog = catalogs[resolveLocale(locale)] ?? en;
  return (key, vars) => {
    let template: string | undefined;
    if (vars && typeof vars.count === "number") {
      template = lookup(
        catalog,
        `${key}.${vars.count === 1 ? "one" : "other"}`,
        overrides,
      );
    }
    template ??= lookup(catalog, key, overrides) ?? key;
    if (!vars) return template;
    return template.replace(/\{(\w+)\}/g, (_, name: string) =>
      vars[name] == null ? `{${name}}` : String(vars[name]),
    );
  };
}

/** Package errors keep their existing Chinese messages. UI maps them at display time. */
export const KNOWN_ERRORS: Record<string, string> = {
  编辑器尚未就绪: "error.editorNotReady",
  当前幻灯片尚未就绪: "error.slideNotReady",
  "PNG 导出失败，请检查图片资源是否有权限访问": "error.pngFailed",
  "目标幻灯片已删除，未插入迟到的图片。": "error.slideDeleted",
  "AntV 图表未能生成": "error.chartFailed",
  "最多支持 500 页": "error.slideLimit",
  "复制后超过 500 页限制": "error.copyLimit",
  分节不存在: "error.sectionMissing",
  "分节名称需为 1–200 个字符": "error.sectionName",
  "最多支持 500 个分节": "error.sectionLimit",
  "请选择 .pptx 文件；不支持旧版 .ppt、.pptm 或 JSON 文件。": "error.importType",
  "文件为空，请重新选择。": "error.importEmpty",
  "PPTX 文件超过 30 MB，请先拆分或压缩媒体资源。": "error.importSize",
  "上传失败，请重试。": "import.failed",
  "每次请选择一个 PPTX 文件。": "import.oneFile",
};

export function displayMessage(t: Translator, value: string) {
  if (!value) return "";
  return t(KNOWN_ERRORS[value] ?? value);
}

export function noticeFromError(error: unknown): Phrase {
  const text = error instanceof Error ? error.message : String(error);
  const key = KNOWN_ERRORS[text];
  return key ? { key } : { text };
}

export function phraseText(t: Translator, phrase: Phrase | null | undefined) {
  if (!phrase) return "";
  if ("text" in phrase) return displayMessage(t, phrase.text);
  return t(phrase.key, phrase.vars);
}

const I18nContext = createContext<Translator>(createTranslator());

export function I18nProvider({
  locale,
  messages,
  value,
  children,
}: {
  locale?: string;
  messages?: Record<string, string>;
  value?: Translator;
  children: ReactNode;
}) {
  const t = useMemo(
    () => value ?? createTranslator(locale, messages),
    [value, locale, messages],
  );
  return createElement(I18nContext.Provider, { value: t }, children);
}

export function useT() {
  return useContext(I18nContext);
}

export const SHAPE_GROUPS: Record<string, string> = {
  全部: "shape.group.all",
  基础: "shape.group.basic",
  星与标注: "shape.group.stars",
  箭头: "shape.group.arrows",
  线条: "shape.group.lines",
};
