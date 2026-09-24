import type { TextLeaf, TextParagraph } from "./types";

export function safeTextLink(value: string): string | null {
  const input = value.trim();
  if (!input || /[\u0000-\u0020\u007f]/.test(input)) return null;
  try {
    const url = new URL(input);
    return ["https:", "http:", "mailto:"].includes(url.protocol) &&
      !url.username &&
      !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}
export function validTextMarks(marks: Partial<TextLeaf>): boolean {
  return (
    (marks.script === undefined ||
      ["normal", "superscript", "subscript"].includes(marks.script)) &&
    (marks.strike === undefined || typeof marks.strike === "boolean") &&
    (marks.link === undefined ||
      marks.link === "" ||
      (typeof marks.link === "string" && safeTextLink(marks.link) !== null))
  );
}
export function validParagraphFormat(p: Partial<TextParagraph>): boolean {
  const number = (value: number | undefined, min: number, max: number) =>
    value === undefined ||
    (Number.isFinite(value) && value >= min && value <= max);
  return (
    (p.list === undefined || ["none", "bullet", "number"].includes(p.list)) &&
    number(p.indentLevel, 0, 8) &&
    (p.indentLevel === undefined || Number.isInteger(p.indentLevel)) &&
    number(p.lineHeight, 0.5, 5) &&
    number(p.spaceBefore, 0, 240) &&
    number(p.spaceAfter, 0, 240)
  );
}
export function paragraphMarkers(paragraphs: TextParagraph[]): string[] {
  const levels = Array(9).fill(0);
  return paragraphs.map((p) => {
    const kind = p.list ?? (p.bullet ? "bullet" : "none"),
      level = p.indentLevel ?? 0;
    if (kind !== "number") {
      levels.fill(0);
      return kind === "bullet" ? ["•", "◦", "▪"][level % 3] : "";
    }
    for (let i = 0; i < level; i++) levels[i] ||= 1;
    levels[level]++;
    levels.fill(0, level + 1);
    return levels.slice(0, level + 1).join(".") + ".";
  });
}
