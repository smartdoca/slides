import type * as Y from "yjs";
import { projectDocument, rootOf } from "../collaboration/yjs-codec";

/** One local read-only projection per Y.Doc, shared by all React consumers. */
class ProjectionStore {
  private cache = new WeakMap<object, unknown>();
  private value;
  private listeners = new Set<() => void>();
  constructor(private doc: Y.Doc) {
    this.value = projectDocument(doc, this.cache);
    rootOf(doc).observeDeep(this.update);
    doc.on("destroy", this.dispose);
  }
  private update = (events: Y.YEvent<any>[]) => {
    for (const event of events) {
      let target: Y.AbstractType<any> | null = event.target;
      while (target) {
        this.cache.delete(target);
        target = target.parent;
      }
    }
    this.value = projectDocument(this.doc, this.cache);
    this.listeners.forEach((listener) => listener());
  };
  getSnapshot = () => this.value;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private dispose = () => {
    rootOf(this.doc).unobserveDeep(this.update);
    this.doc.off("destroy", this.dispose);
    this.listeners.clear();
  };
}
const stores = new WeakMap<Y.Doc, ProjectionStore>();
export function presentationStore(doc: Y.Doc) {
  let store = stores.get(doc);
  if (!store) {
    store = new ProjectionStore(doc);
    stores.set(doc, store);
  }
  return store;
}
