/** React's HTML serialization uses camel-case spans; SVG foreignObject parses XHTML case-sensitively. */
export function foreignObjectHtml(markup: string) {
  return markup.replace(/<[^>]+>/g, (tag) =>
    tag.replace(
      /\s(rowSpan|colSpan)=/g,
      (_, name: string) => ` ${name.toLowerCase()}=`,
    ),
  );
}
