import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useT } from "../i18n";
import type { PresentationImagePreviewItem } from "../model/image-preview";
import { resolveImageUrl } from "./ResourceImage";

const clamp = (value: number) => Math.max(0.25, Math.min(5, value));

/** Standalone view only. Hosts can replace it through onImagePreview. */
export function ImagePreviewDialog({
  gallery,
  currentId,
  resolveAsset,
  onNavigate,
  onClose,
}: {
  gallery: readonly PresentationImagePreviewItem[];
  currentId: string;
  resolveAsset?: (assetId: string) => string;
  onNavigate(id: string): void;
  onClose(): void;
}) {
  const t = useT(),
    root = useRef<HTMLDivElement>(null),
    viewport = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1),
    [offset, setOffset] = useState({ x: 0, y: 0 }),
    [failed, setFailed] = useState<string | null>(null),
    [attempt, setAttempt] = useState(0);
  const drag = useRef<{
    x: number;
    y: number;
    left: number;
    top: number;
    swipe: boolean;
  } | null>(null);
  const index = gallery.findIndex((item) => item.id === currentId),
    image = gallery[index];
  const url = useMemo(
      () => (image ? resolveImageUrl(resolveAsset, image.assetId) : ""),
      [resolveAsset, image?.assetId, currentId, attempt],
    ),
    loadKey = JSON.stringify([currentId, url, attempt]);
  const reset = () => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
    drag.current = null;
  };
  const navigate = (direction: number) => {
    const next = gallery[index + direction];
    if (next) onNavigate(next.id);
    reset();
    root.current?.focus({ preventScroll: true });
  };
  const navigation = useRef(navigate);
  navigation.current = navigate;
  useEffect(() => {
    const previous = document.activeElement;
    root.current?.focus({ preventScroll: true });
    let horizontal = 0,
      lastWheel = 0;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) {
        if (event.timeStamp - lastWheel > 250) horizontal = 0;
        horizontal += event.deltaX;
        lastWheel = event.timeStamp;
        if (Math.abs(horizontal) >= 100) {
          navigation.current(horizontal > 0 ? 1 : -1);
          horizontal = 0;
        }
      } else if (event.deltaY) {
        setScale((value) => clamp(value + (event.deltaY < 0 ? 0.15 : -0.15)));
      }
    };
    const target = viewport.current;
    target?.addEventListener("wheel", wheel, { passive: false });
    return () => {
      target?.removeEventListener("wheel", wheel);
      if (previous instanceof HTMLElement && previous.isConnected)
        previous.focus({ preventScroll: true });
    };
  }, []);
  useEffect(reset, [currentId]);
  if (!image) return null;
  return createPortal(
    <div
      ref={root}
      className="eppt-image-preview"
      role="dialog"
      aria-modal="true"
      aria-label={t("image.preview")}
      tabIndex={-1}
      onPointerDown={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (
          [
            "Escape",
            "ArrowLeft",
            "ArrowRight",
            "+",
            "=",
            "-",
            "0",
            "Tab",
          ].includes(event.key)
        )
          event.preventDefault();
        if (event.key === "Escape") onClose();
        if (event.key === "ArrowLeft") navigate(-1);
        if (event.key === "ArrowRight") navigate(1);
        if (event.key === "+" || event.key === "=")
          setScale((value) => clamp(value + 0.25));
        if (event.key === "-") setScale((value) => clamp(value - 0.25));
        if (event.key === "0") reset();
        if (event.key === "Tab") {
          const controls = [
              ...event.currentTarget.querySelectorAll<HTMLButtonElement>(
                "button:not(:disabled)",
              ),
            ],
            at = controls.indexOf(document.activeElement as HTMLButtonElement);
          controls[
            at < 0
              ? event.shiftKey
                ? controls.length - 1
                : 0
              : (at + (event.shiftKey ? -1 : 1) + controls.length) %
                controls.length
          ]?.focus();
        }
      }}
    >
      <div
        className="eppt-image-preview-toolbar"
        role="toolbar"
        aria-label={t("image.preview")}
      >
        <span className="eppt-image-preview-name">
          {image.alt || t("image.fallbackName")}
        </span>
        <button
          type="button"
          aria-label={t("image.zoomOut")}
          onClick={() => setScale((value) => clamp(value - 0.25))}
        >
          −
        </button>
        <button type="button" aria-label={t("image.fit")} onClick={reset}>
          {Math.round(scale * 100)}%
        </button>
        <button
          type="button"
          aria-label={t("image.zoomIn")}
          onClick={() => setScale((value) => clamp(value + 0.25))}
        >
          ＋
        </button>
        <button
          type="button"
          aria-label={t("image.closePreview")}
          onClick={onClose}
        >
          ×
        </button>
      </div>
      <button
        type="button"
        className="eppt-image-preview-previous"
        aria-label={t("image.previous")}
        disabled={index === 0}
        onClick={() => navigate(-1)}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="m15 5-7 7 7 7"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          />
        </svg>
      </button>
      <button
        type="button"
        className="eppt-image-preview-next"
        aria-label={t("image.next")}
        disabled={index === gallery.length - 1}
        onClick={() => navigate(1)}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="m9 5 7 7-7 7"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          />
        </svg>
      </button>
      <div
        ref={viewport}
        className="eppt-image-preview-viewport"
        onClick={(event) => {
          if (event.target === event.currentTarget) onClose();
        }}
      >
        {url && failed !== loadKey ? (
          <img
            key={loadKey}
            src={url}
            alt={image.alt || t("image.fallbackName")}
            draggable={false}
            style={{
              transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
            }}
            onError={() => setFailed(loadKey)}
            onDoubleClick={reset}
            onPointerDown={(event) => {
              if (event.button !== 0) return;
              event.preventDefault();
              root.current?.focus({ preventScroll: true });
              event.currentTarget.setPointerCapture(event.pointerId);
              drag.current = {
                x: event.clientX,
                y: event.clientY,
                left: offset.x,
                top: offset.y,
                swipe: scale === 1 && offset.x === 0 && offset.y === 0,
              };
            }}
            onPointerMove={(event) => {
              const start = drag.current;
              if (start)
                setOffset({
                  x: start.left + event.clientX - start.x,
                  y: start.top + event.clientY - start.y,
                });
            }}
            onPointerUp={(event) => {
              const start = drag.current;
              drag.current = null;
              if (!start?.swipe) return;
              const x = event.clientX - start.x,
                y = event.clientY - start.y;
              if (Math.abs(x) >= 60 && Math.abs(x) >= Math.abs(y) * 1.5)
                navigate(x < 0 ? 1 : -1);
              else setOffset({ x: 0, y: 0 });
            }}
            onPointerCancel={() => {
              drag.current = null;
            }}
          />
        ) : (
          <div role="status" className="eppt-image-preview-error">
            <span>
              {t("image.unavailable", {
                name: image.alt || t("image.fallbackName"),
              })}
            </span>
            <button
              type="button"
              onClick={() => setAttempt((value) => value + 1)}
            >
              {t("image.retry")}
            </button>
          </div>
        )}
      </div>
      <div className="eppt-image-preview-position" role="status">
        {t("image.position", { index: index + 1, count: gallery.length })}
      </div>
    </div>,
    document.body,
  );
}
