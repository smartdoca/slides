import type { PresentationDocument } from "./types";

/** One image occurrence in this presentation. No resolved or download URL is stored here. */
export interface PresentationImagePreviewItem {
  readonly id: string;
  readonly slideId: string;
  readonly elementId: string;
  readonly assetId: string;
  readonly alt?: string;
}

export interface PresentationImagePreviewEvent {
  readonly currentId: string;
  readonly gallery: readonly PresentationImagePreviewItem[];
}

export type PresentationImagePreviewHandler = (
  event: PresentationImagePreviewEvent,
) => void | Promise<void>;

/** Ordered native image occurrences across all slides, including hidden slides. */
export function presentationImages(
  document: PresentationDocument,
): PresentationImagePreviewItem[] {
  return document.slideOrder.flatMap((slideId) => {
    const slide = document.slides[slideId];
    return slide.elementOrder.flatMap((elementId) => {
      const image = slide.elements[elementId];
      return image.type === "image"
        ? [
            {
              id: JSON.stringify([slideId, elementId]),
              slideId,
              elementId,
              assetId: image.assetId,
              ...(image.alt === undefined ? {} : { alt: image.alt }),
            },
          ]
        : [];
    });
  });
}

export function presentationImagePreview(
  document: PresentationDocument,
  slideId: string,
  elementId: string,
): PresentationImagePreviewEvent | null {
  const gallery = presentationImages(document),
    current = gallery.find(
      (item) => item.slideId === slideId && item.elementId === elementId,
    );
  return current ? { currentId: current.id, gallery } : null;
}
