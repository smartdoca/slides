import { memo } from "react";
import {
  emuToPx,
  type PresentationDocument,
  type Slide,
  type SlideElement,
} from "../model/types";
import { ElementContent } from "./PresentationEditor";
import { linePath } from "../model/line";
import { shapePath } from "../model/shapes";

export const SlidePreview = memo(
  function SlidePreview({
    document,
    slide,
    resolveAsset,
    step,
  }: {
    document: PresentationDocument;
    slide: Slide;
    resolveAsset?: (id: string) => string;
    step?: number;
  }) {
    let animated = 0;
    return (
      <div
        className="eppt-preview"
        style={{
          width: emuToPx(document.size.width),
          height: emuToPx(document.size.height),
          position: "relative",
          background: slide.background ?? "#fff",
          overflow: "hidden",
        }}
      >
        {slide.elementOrder.map((id) => {
          const el = slide.elements[id],
            t = el.transform;
          if (el.visible === false) return null;
          const order = el.animation ? ++animated : 0;
          const visible = step === undefined || !el.animation || order <= step;
          return (
            <div
              key={id}
              style={{
                position: "absolute",
                left: emuToPx(t.x),
                top: emuToPx(t.y),
                width: emuToPx(t.width),
                height: emuToPx(t.height),
                transform: `rotate(${t.rotation}deg) ${el.type === "image" ? `translate(${t.flipH ? emuToPx(t.width) : 0}px, ${t.flipV ? emuToPx(t.height) : 0}px) scale(${t.flipH ? -1 : 1}, ${t.flipV ? -1 : 1})` : ""} ${!visible && el.animation?.effect === "fly" ? "translateX(-60px)" : ""}`,
                transformOrigin: "0 0",
                overflow: el.type === "line" ? "visible" : "hidden",
                opacity: visible ? (el.opacity ?? 1) : 0,
                transition:
                  step === undefined || el.animation?.effect === "appear"
                    ? undefined
                    : `opacity ${el.animation?.duration ?? 0.3}s, transform ${el.animation?.duration ?? 0.3}s`,
                color: el.type === "text" ? el.fill : undefined,
              }}
            >
              {el.type === "shape" || el.type === "line" ? (
                <ShapeContent element={el} />
              ) : (
                <ElementContent element={el} resolveAsset={resolveAsset} interactiveResource={false} interactiveLinks={step !== undefined} />
              )}
            </div>
          );
        })}
      </div>
    );
  },
  (a, b) =>
    a.slide === b.slide &&
    a.document.size.width === b.document.size.width &&
    a.document.size.height === b.document.size.height &&
    a.resolveAsset === b.resolveAsset &&
    a.step === b.step,
);
export function ShapeContent({ element: el }: { element: SlideElement }) {
  if (el.type === "line")
    return (
      <svg
        width="100%"
        height="100%"
        viewBox={`0 0 ${emuToPx(el.transform.width)} ${emuToPx(el.transform.height)}`}
        preserveAspectRatio="none"
        style={{ overflow: "visible" }}
      >
        <path
          d={linePath(el)}
          fill={el.arrow ? el.stroke : "none"}
          stroke={el.stroke}
          strokeWidth={el.strokeWidth}
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    );
  if (el.type !== "shape") return null;
  const common = {
    fill: el.fill,
    stroke: el.stroke,
    strokeWidth: el.strokeWidth,
    vectorEffect: "non-scaling-stroke",
  };
  return (
    <svg
      width="100%"
      height="100%"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
    >
      <path d={shapePath(el.shape)} {...common} />
    </svg>
  );
}
