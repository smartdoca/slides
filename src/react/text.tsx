import type { CSSProperties } from "react";
import type { TextLeaf, TextParagraph } from "../model/types";
import { paragraphMarkers, safeTextLink } from "../model/text-format";
export function leafStyle(leaf: TextLeaf): CSSProperties {
  return {
    fontFamily: leaf.fontFamily ?? 'Arial, "Microsoft YaHei", sans-serif',
    fontSize:
      (((leaf.fontSize ?? 24) * 96) / 72) *
      (leaf.script && leaf.script !== "normal" ? 0.7 : 1),
    verticalAlign:
      leaf.script === "superscript"
        ? "super"
        : leaf.script === "subscript"
          ? "sub"
          : undefined,
    color: leaf.color,
    backgroundColor: leaf.backgroundColor,
    fontWeight: leaf.bold ? 700 : 400,
    fontStyle: leaf.italic ? "italic" : "normal",
    textDecoration:
      [
        leaf.underline || leaf.link ? "underline" : "",
        leaf.strike ? "line-through" : "",
      ]
        .filter(Boolean)
        .join(" ") || undefined,
  };
}
export function paragraphStyle(p: TextParagraph): CSSProperties {
  const listed = p.list ? p.list !== "none" : p.bullet;
  return {
    position: "relative",
    textAlign: p.align,
    lineHeight: p.lineHeight ?? 1.2,
    fontSize: ((p.children[0]?.fontSize ?? 24) * 96) / 72,
    minHeight: "1.2em",
    whiteSpace: "pre-wrap",
    overflowWrap: "break-word",
    paddingLeft: (p.indentLevel ?? 0) * 28 + (listed ? 36 : 0),
    marginTop: ((p.spaceBefore ?? 0) * 96) / 72,
    marginBottom: ((p.spaceAfter ?? 0) * 96) / 72,
  };
}
export function RichTextView({
  paragraphs,
  interactiveLinks = false,
}: {
  paragraphs: TextParagraph[];
  interactiveLinks?: boolean;
}) {
  const markers = paragraphMarkers(paragraphs);
  return (
    <>
      {paragraphs.map((p, i) => (
        <div key={i} style={paragraphStyle(p)}>
          {markers[i] && (
            <span
              style={{
                position: "absolute",
                left: 0,
                width: (p.indentLevel ?? 0) * 28 + 30,
                textAlign: "right",
                whiteSpace: "nowrap",
              }}
            >
              {markers[i]}{" "}
            </span>
          )}
          {p.children.map((leaf, j) => (
            <span key={j} style={leafStyle(leaf)}>
              {interactiveLinks && leaf.link && safeTextLink(leaf.link) ? (
                <a
                  href={safeTextLink(leaf.link)!}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: "inherit" }}
                  onClick={(e) => e.stopPropagation()}
                >
                  {leaf.text || "\u200b"}
                </a>
              ) : (
                leaf.text || "\u200b"
              )}
            </span>
          ))}
        </div>
      ))}
    </>
  );
}
