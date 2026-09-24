import { useState } from "react";
import { imageFrame } from "../model/image";
import type { ImageElement } from "../model/types";

export function resolveImageUrl(
  resolve: ((id: string) => string) | undefined,
  id: string,
) {
  try {
    return resolve?.(id) ?? "";
  } catch {
    return "";
  }
}
/** A single resource failure never replaces or deletes the model's stable asset identity. */
export function ResourceImage({
  element,
  resolveAsset,
  fallbackOnly = false,
  onRetry,
  interactive = true,
}: {
  element: ImageElement;
  resolveAsset?: (id: string) => string;
  fallbackOnly?: boolean;
  onRetry?: () => void;
  interactive?: boolean;
}) {
  const [attempt, retry] = useState(0),
    [failed, setFailed] = useState<string | null>(null);
  const url = resolveImageUrl(resolveAsset, element.assetId),
    key = url + "|" + attempt;
  const frame = imageFrame(100, 100, element.crop);
  if (!url || failed === key)
    return (
      <div
        role="status"
        style={{
          width: "100%",
          height: "100%",
          background: "#f1f3f7",
          color: "#64748b",
          display: "grid",
          placeContent: "center",
          fontSize: 14,
        }}
      >
        <span>{element.alt || "图片"}暂不可用</span>
        {interactive && <button
          style={{ pointerEvents: "auto" }}
          onClick={(e) => {
            e.stopPropagation();
            retry((n) => n + 1);
            onRetry?.();
          }}
        >
          重试图片
        </button>}
      </div>
    );
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        position: "relative",
        overflow: "hidden",
        opacity: fallbackOnly ? 0 : 1,
      }}
    >
      <img
        key={key}
        draggable={false}
        src={url}
        alt={element.alt ?? ""}
        onError={() => setFailed(key)}
        style={{
          position: "absolute",
          left: frame.x + "%",
          top: frame.y + "%",
          width: frame.width + "%",
          height: frame.height + "%",
          maxWidth: "none",
          objectFit: "fill",
        }}
      />
    </div>
  );
}
