import type * as Y from "yjs";
import { presentationStore } from "./projection-store";
import type { PresentationDocument, Slide } from "./types";

/** Local projection cache. No temporary URLs, selections or presence are persisted. */
export class SlidePreviewStore {
  private value: PresentationDocument;
  private unsubscribe: () => void;
  private listeners = new Set<(slideIds: string[]) => void>();
  constructor(private doc: Y.Doc) {
    this.value = presentationStore(doc).getSnapshot();
    this.unsubscribe = presentationStore(doc).subscribe(this.update);
  }
  private update = () => {
    const next = presentationStore(this.doc).getSnapshot(),
      changed: string[] = [];
    const resized =
      JSON.stringify(next.size) !== JSON.stringify(this.value.size);
    for (const id of new Set([...this.value.slideOrder, ...next.slideOrder])) {
      if (next.slides[id] !== this.value.slides[id] || resized)
        changed.push(id);
    }
    this.value = next;
    if (changed.length) this.listeners.forEach((fn) => fn(changed));
  };
  /** Caller owns this fixed single-slide snapshot; deleted slides return null. */
  getSnapshot(
    slideId: string,
  ): { size: PresentationDocument["size"]; slide: Slide } | null {
    const slide = this.value.slides[slideId];
    return slide ? structuredClone({ size: this.value.size, slide }) : null;
  }
  subscribe(listener: (slideIds: string[]) => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  dispose() {
    this.unsubscribe();
    this.listeners.clear();
  }
}
