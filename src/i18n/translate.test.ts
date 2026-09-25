import { expect, it } from "vitest";
import { en, zh } from "./catalog";
import { createTranslator, htmlLang, resolveLocale } from "./index";

it("uses the same keys in Chinese and English", () => {
  expect(Object.keys(zh).sort()).toEqual(Object.keys(en).sort());
});

it("defaults to Chinese, falls unknown codes back to English, and applies overrides", () => {
  const zhText = createTranslator();
  const enText = createTranslator("en");
  const fallback = createTranslator("fr");
  const custom = createTranslator("en", { "toolbar.bold": "Strong" });
  expect(resolveLocale()).toBe("zh");
  expect(resolveLocale("zh")).toBe("zh");
  expect(resolveLocale("en")).toBe("en");
  expect(resolveLocale("ja")).toBe("en");
  expect(htmlLang()).toBe("zh-CN");
  expect(htmlLang("en")).toBe("en");
  expect(htmlLang("ja")).toBe("en");
  expect(zhText("toolbar.bold")).toBe("加粗");
  expect(enText("toolbar.bold")).toBe("Bold");
  expect(fallback("toolbar.present")).toBe("Start slideshow");
  expect(custom("toolbar.bold")).toBe("Strong");
  expect(custom("toolbar.italic")).toBe("Italic");
  expect(enText("missing.key")).toBe("missing.key");
  expect(enText("alert.pngReady", { size: 12 })).toBe(
    "The PNG is ready (12 KB) in your downloads.",
  );
  expect(enText("selection.count", { count: 1 })).toBe("1 object selected");
  expect(enText("selection.count", { count: 2 })).toBe("2 objects selected");
  expect(zhText("selection.count", { count: 2 })).toBe("已选择 2 个对象");
  expect(enText("rail.duplicated", { count: 1 })).toBe(
    "Duplicated 1 slide. This can be undone",
  );
});
