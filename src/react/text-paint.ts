import type { UI } from "leafer-ui";
import type { SlideElement } from "../model/types";

type TextElement = Extract<SlideElement, { type: "text" }>;

/** Local paint cache: resizing reflows text without scaling glyphs or writing Yjs. */
export function createTextPainter(
  markup: (element: TextElement, width: number, height: number) => string,
) {
  const cache = new WeakMap<
    object,
    { element: TextElement; width: number; height: number; url: string }
  >();
  return (
    node: Pick<UI, "fill" | "width" | "height">,
    element: TextElement,
  ) => {
    const width = Math.max(1, node.width ?? 1);
    const height = Math.max(1, node.height ?? 1);
    const previous = cache.get(node);
    if (
      previous?.element === element &&
      previous.width === width &&
      previous.height === height
    )
      return;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><foreignObject width="100%" height="100%"><div xmlns="http://www.w3.org/1999/xhtml">${markup(element, width, height)}</div></foreignObject></svg>`;
    const url = "data:image/svg+xml," + encodeURIComponent(svg);
    // Explicit pixel size also prevents stretching the previous image while the
    // browser decodes a new SVG. Text remains in the native canvas layer order.
    if (previous?.url !== url)
      node.fill = {
        type: "image",
        url,
        mode: "clip",
        size: { width, height },
        offset: { x: 0, y: 0 },
      };
    cache.set(node, { element, width, height, url });
  };
}
