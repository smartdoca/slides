import { useEffect, useRef, useState } from "react";
import { useT } from "../i18n";
import type { ImageCrop } from "../model/types";
import { UNCROPPED } from "../model/image";

export function ImageCropDialog({
  url,
  initial,
  onApply,
  onClose,
}: {
  url: string;
  initial?: ImageCrop;
  onApply(crop: ImageCrop): void;
  onClose(): void;
}) {
  const [crop, setCrop] = useState<ImageCrop>([...(initial ?? UNCROPPED)]);
  const [ratio, setRatio] = useState(4 / 3);
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const t = useT();
  const panel = useRef<HTMLDivElement>(null);
  const surface = useRef<HTMLDivElement>(null);
  const dragging = useRef<{
    x: number;
    y: number;
    crop: ImageCrop;
    handle: string;
  } | null>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    return () => previous?.focus();
  }, []);
  const edge = (index: number, value: number) => {
    if (!Number.isFinite(value)) return;
    setCrop((old) => {
      const next = [...old] as ImageCrop;
      next[index] = Math.max(0, Math.min(0.99 - old[(index + 2) % 4], value));
      return next;
    });
  };
  return (
    <div
      className="eppt-modal-backdrop"
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Escape") {
          e.preventDefault();
          onClose();
        }
        if (e.key === "Tab") {
          const controls = Array.from(
            panel.current?.querySelectorAll<HTMLElement>(
              "button:not(:disabled), input:not(:disabled)",
            ) ?? [],
          );
          const index = controls.indexOf(document.activeElement as HTMLElement);
          if (
            (e.shiftKey && index <= 0) ||
            (!e.shiftKey && (index < 0 || index === controls.length - 1))
          ) {
            e.preventDefault();
            (e.shiftKey ? controls.at(-1) : controls[0])?.focus();
          }
        }
      }}
    >
      <div
        className="eppt-crop-dialog"
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={t("crop.title")}
        tabIndex={-1}
      >
        <h2>{t("crop.title")}</h2>
        <p>{t("crop.help")}</p>
        {failed ? <p role="alert">{t("crop.failed")}</p> : null}
        <div
          ref={surface}
          className="eppt-crop-surface"
          style={{
            width: Math.min(480, 260 * ratio),
            maxWidth: "100%",
            aspectRatio: ratio,
          }}
          onPointerMove={(e) => {
            const start = dragging.current,
              bounds = surface.current?.getBoundingClientRect();
            if (!start || !bounds) return;
            const dx = (e.clientX - start.x) / bounds.width,
              dy = (e.clientY - start.y) / bounds.height;
            const [l, t, r, b] = start.crop;
            const next = [l, t, r, b] as ImageCrop;
            if (start.handle === "move") {
              const x = Math.max(-l, Math.min(r, dx)),
                y = Math.max(-t, Math.min(b, dy));
              next[0] = l + x;
              next[2] = r - x;
              next[1] = t + y;
              next[3] = b - y;
            } else {
              if (start.handle.includes("w"))
                next[0] = Math.max(0, Math.min(0.99 - r, l + dx));
              if (start.handle.includes("e"))
                next[2] = Math.max(0, Math.min(0.99 - l, r - dx));
              if (start.handle.includes("n"))
                next[1] = Math.max(0, Math.min(0.99 - b, t + dy));
              if (start.handle.includes("s"))
                next[3] = Math.max(0, Math.min(0.99 - t, b - dy));
            }
            setCrop(next);
          }}
          onPointerUp={() => {
            dragging.current = null;
          }}
          onPointerCancel={() => {
            dragging.current = null;
          }}
          onPointerDown={(e) => {
            const handle = (e.target as HTMLElement).dataset.cropHandle;
            if (!handle) return;
            e.preventDefault();
            dragging.current = {
              x: e.clientX,
              y: e.clientY,
              crop: [...crop],
              handle,
            };
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
        >
          <img
            src={url}
            alt={t("crop.preview")}
            draggable={false}
            onLoad={(e) => {
              setRatio(
                e.currentTarget.naturalWidth / e.currentTarget.naturalHeight,
              );
              setLoaded(true);
            }}
            onError={() => setFailed(true)}
          />
          <div
            className="eppt-crop-selection"
            data-crop-handle="move"
            style={{
              left: crop[0] * 100 + "%",
              top: crop[1] * 100 + "%",
              right: crop[2] * 100 + "%",
              bottom: crop[3] * 100 + "%",
            }}
          >
            {["nw", "ne", "sw", "se"].map((handle) => (
              <span
                key={handle}
                data-crop-handle={handle}
                className={"eppt-crop-handle " + handle}
              />
            ))}
          </div>
        </div>
        <div className="eppt-field-grid">
          {(
            [
              t("crop.left"),
              t("crop.top"),
              t("crop.right"),
              t("crop.bottom"),
            ] as const
          ).map((label, i) => (
            <label key={i}>
              {t("crop.edge", { edge: label })}
              <input
                aria-label={t("crop.edgeLabel", { edge: label })}
                type="number"
                min="0"
                max={Math.round((0.99 - crop[(i + 2) % 4]) * 1000) / 10}
                step="0.1"
                value={Math.round(crop[i] * 1000) / 10}
                onChange={(e) => edge(i, Number(e.target.value) / 100)}
              />
            </label>
          ))}
        </div>
        <div className="eppt-crop-actions">
          <button onClick={() => setCrop([...UNCROPPED])}>{t("crop.reset")}</button>
          <button onClick={onClose}>{t("crop.cancel")}</button>
          <button
            className="eppt-primary"
            disabled={failed || !loaded}
            onClick={() => onApply(crop)}
          >
            {t("crop.apply")}
          </button>
        </div>
      </div>
    </div>
  );
}
