import { validChart } from "./chart";
import * as Y from "yjs";
import { createId, createTextElement } from "./create";
import {
  pxToEmu,
  type SlideElement,
  type Slide,
  type TextLeaf,
  type TextParagraph,
} from "./types";
import {
  elementsOf,
  encodeElement,
  encodeSlide,
  patchElement,
  readDocument,
  readSlide,
  rootOf,
  slideOf,
  slidesOf,
  textOf,
  elementOf,
} from "../collaboration/yjs-codec";
import { LOCAL_ORIGIN, LocalTextOrigin } from "../collaboration/origins";
import { validCrop } from "./image";
import { TABLE_OP, tableIds, type TableOperation } from "./table";
import type { ShapeKind } from "./shapes";
import { findText, replaceMatches, type TextMatch } from "./anchors";
import { validParagraphFormat, validTextMarks } from "./text-format";

export class EditorController {
  readonly history: Y.UndoManager;
  private readOnly = false;
  constructor(readonly doc: Y.Doc) {
    this.history = new Y.UndoManager(rootOf(doc), {
      trackedOrigins: new Set<unknown>([LOCAL_ORIGIN, LocalTextOrigin]),
      captureTimeout: 400,
    });
  }
  setReadOnly(value: boolean) {
    this.readOnly = value;
  }
  get isReadOnly() {
    return this.readOnly;
  }
  expandSelection(slide: string, ids: string[]): string[] {
    const view = readSlide(this.doc, slide);
    if (!view) return [];
    const groups = new Set(
      ids.map((id) => view.elements[id]?.groupId).filter(Boolean),
    );
    return view.elementOrder.filter(
      (id) =>
        ids.includes(id) ||
        (!!view.elements[id].groupId && groups.has(view.elements[id].groupId)),
    );
  }
  group(slide: string, ids: string[]) {
    const groupId = createId("group"),
      expanded = this.expandSelection(slide, ids);
    if (expanded.length < 2) return;
    this.run(() =>
      expanded.forEach((id) => patchElement(this.doc, slide, id, { groupId })),
    );
    return groupId;
  }
  ungroup(slide: string, ids: string[]) {
    this.run(() =>
      this.expandSelection(slide, ids).forEach((id) =>
        patchElement(this.doc, slide, id, { groupId: undefined }),
      ),
    );
  }
  run(action: () => void) {
    if (this.readOnly) return;
    this.history.stopCapturing();
    this.doc.transact(action, LOCAL_ORIGIN);
    this.history.stopCapturing();
  }
  undo() {
    if (!this.readOnly) this.history.undo();
  }
  redo() {
    if (!this.readOnly) this.history.redo();
  }
  find(query: string) {
    return findText(this.doc, query);
  }
  replaceMatch(match: TextMatch, replacement: string) {
    let count = 0;
    this.run(() => {
      count = replaceMatches(this.doc, [match], replacement);
    });
    return count;
  }
  replaceAll(query: string, replacement: string) {
    let count = 0;
    this.run(() => {
      count = replaceMatches(this.doc, findText(this.doc, query), replacement);
    });
    return count;
  }
  dispose() {
    this.history.destroy();
  }
  patch(slide: string, id: string, patch: Record<string, unknown>) {
    if (
      patch.padding !== undefined &&
      (typeof patch.padding !== "number" ||
        !Number.isFinite(patch.padding) ||
        patch.padding < 0 ||
        patch.padding > 200)
    )
      throw new Error("INVALID_TEXT_PADDING");
    if (patch.crop !== undefined && !validCrop(patch.crop)) return;
    const current = readSlide(this.doc, slide)?.elements[id];
    if (!current) return;
    if (current.type === "table" && "cells" in patch) return;
    if (current.type === "chart" && !validChart({ ...current, ...patch }))
      return;
    this.run(() => patchElement(this.doc, slide, id, patch));
  }
  title(title: string) {
    this.run(() => {
      if (rootOf(this.doc).get("title") !== title)
        rootOf(this.doc).set("title", title);
    });
  }
  pageSize(width: number, height: number) {
    if (
      !Number.isFinite(width) ||
      !Number.isFinite(height) ||
      width < 100 ||
      height < 100 ||
      width > 10000 ||
      height > 10000
    )
      return;
    this.run(() => {
      const size = rootOf(this.doc).get("size") as Y.Map<number>;
      if (size.get("width") !== pxToEmu(width))
        size.set("width", pxToEmu(width));
      if (size.get("height") !== pxToEmu(height))
        size.set("height", pxToEmu(height));
    });
  }
  paste(slide: string, elements: SlideElement[]) {
    const ids: string[] = [];
    this.run(() => {
      const groups = new Map<string, string>();
      for (const source of elements) {
        const el = structuredClone(source);
        el.id = createId(el.type);
        if (el.groupId) {
          if (!groups.has(el.groupId))
            groups.set(el.groupId, createId("group"));
          el.groupId = groups.get(el.groupId);
        }
        el.transform.x += pxToEmu(24);
        el.transform.y += pxToEmu(24);
        this.insert(slide, el);
        ids.push(el.id);
      }
    });
    return ids;
  }
  distribute(slide: string, ids: string[], axis: "horizontal" | "vertical") {
    this.run(() => {
      const view = readSlide(this.doc, slide),
        position = axis === "horizontal" ? "x" : "y",
        extent = axis === "horizontal" ? "width" : "height";
      const elements = ids
        .map((id) => view?.elements[id])
        .filter((el): el is SlideElement => !!el && !el.locked)
        .sort((a, b) => a.transform[position] - b.transform[position]);
      if (elements.length < 3) return;
      const first = elements[0].transform,
        last = elements.at(-1)!.transform,
        total = elements.reduce((sum, el) => sum + el.transform[extent], 0);
      const gap =
        (last[position] + last[extent] - first[position] - total) /
        (elements.length - 1);
      let cursor = first[position];
      for (const el of elements) {
        patchElement(this.doc, slide, el.id, {
          transform: { [position]: Math.round(cursor) },
        });
        cursor += el.transform[extent] + gap;
      }
    });
  }
  paragraphFormat(
    slide: string,
    ids: string[],
    format: Partial<Omit<TextParagraph, "type" | "children">>,
  ) {
    if (!validParagraphFormat(format))
      throw new Error("INVALID_PARAGRAPH_FORMAT");
    this.run(() =>
      ids.forEach((id) => {
        const text = textOf(this.doc, slide, id);
        if (!text) return;
        for (const delta of text.toDelta())
          if (delta.insert instanceof Y.XmlText)
            for (const [key, value] of Object.entries(format))
              if (delta.insert.getAttribute(key) !== value)
                delta.insert.setAttribute(key, value);
      }),
    );
  }
  slideProperty(
    id: string,
    field: "background" | "notes" | "name",
    value: string,
  ) {
    this.run(() => {
      const slide = slideOf(this.doc, id);
      if (slide && slide.get(field) !== value) slide.set(field, value);
    });
  }
  addSlide(after?: string, source?: Slide): string {
    const currentOrder = (
      rootOf(this.doc).get("slideOrder") as Y.Array<string>
    ).toArray();
    if (
      !this.readOnly &&
      [...new Set(currentOrder)].filter(
        (sid) => slideOf(this.doc, sid)?.get("deleted") !== true,
      ).length >= 500
    )
      throw new Error("最多支持 500 页");
    const id = createId("slide");
    this.run(() => {
      const slide: Slide = {
        id,
        ...(source?.name ? { name: source.name } : {}),
        ...(source?.hidden !== undefined ? { hidden: source.hidden } : {}),
        ...(source?.sectionId ? { sectionId: source.sectionId } : {}),
        background: source?.background ?? "#ffffff",
        notes: source?.notes ?? "",
        elements: {},
        elementOrder: [],
      };
      const groups = new Map<string, string>();
      for (const eid of source?.elementOrder ?? []) {
        const copy = structuredClone(source!.elements[eid]);
        copy.id = createId(copy.type);
        if (copy.groupId) {
          if (!groups.has(copy.groupId))
            groups.set(copy.groupId, createId("group"));
          copy.groupId = groups.get(copy.groupId);
        }
        slide.elements[copy.id] = copy;
        slide.elementOrder.push(copy.id);
      }
      slidesOf(this.doc).set(id, encodeSlide(slide));
      const order = rootOf(this.doc).get("slideOrder") as Y.Array<string>;
      const index = after ? order.toArray().indexOf(after) + 1 : order.length;
      order.insert(Math.max(0, index), [id]);
    });
    return id;
  }
  deleteSlide(id: string) {
    this.run(() => {
      // Tombstone preserves nested CRDT identities and concurrent remote edits for undo.
      slideOf(this.doc, id)?.set("deleted", true);
      this.removeFromOrder(
        rootOf(this.doc).get("slideOrder") as Y.Array<string>,
        [id],
      );
    });
  }
  /** Batch page commands are one local transaction and one undo step. */
  deleteSlides(ids: string[]) {
    this.run(() => {
      for (const id of new Set(ids))
        slideOf(this.doc, id)?.set("deleted", true);
      this.removeFromOrder(
        rootOf(this.doc).get("slideOrder") as Y.Array<string>,
        ids,
      );
    });
  }
  duplicateSlides(ids: string[]): string[] {
    if (this.readOnly) return [];
    const view = readDocument(this.doc),
      wanted = new Set(ids);
    const sources = view.slideOrder.filter((id) => wanted.has(id));
    if (view.slideOrder.length + sources.length > 500)
      throw new Error("复制后超过 500 页限制");
    const copies: string[] = [];
    this.run(() => {
      let after = sources.at(-1);
      for (const id of sources) {
        after = this.addSlide(after, view.slides[id]);
        copies.push(after);
      }
    });
    return copies;
  }
  moveSlidesBefore(
    ids: string[],
    before: string | null,
    sectionId?: string | null,
  ) {
    if (this.readOnly) return;
    if (sectionId != null && !rootOf(this.doc).has("section:" + sectionId))
      throw new Error("分节不存在");
    const order = rootOf(this.doc).get("slideOrder") as Y.Array<string>;
    const isLive = (id: string) =>
      !!slideOf(this.doc, id) && slideOf(this.doc, id)!.get("deleted") !== true;
    const current = [...new Set(order.toArray())].filter(isLive),
      selected = new Set(ids);
    const moving = current.filter((id) => selected.has(id));
    if (!moving.length || (before && !current.includes(before))) return;
    if (before && selected.has(before))
      before =
        current
          .slice(current.indexOf(before))
          .find((id) => !selected.has(id)) ?? null;
    const remaining = current.filter((id) => !selected.has(id));
    const next = [...remaining];
    next.splice(before ? next.indexOf(before) : next.length, 0, ...moving);
    const reordered = next.some((id, index) => id !== current[index]);
    const reassigned =
      sectionId !== undefined &&
      moving.some(
        (id) => (slideOf(this.doc, id)?.get("sectionId") ?? null) !== sectionId,
      );
    if (!reordered && !reassigned) return;
    this.run(() => {
      if (reordered) {
        this.removeFromOrder(order, moving);
        const index = before ? order.toArray().indexOf(before) : order.length;
        order.insert(index < 0 ? order.length : index, moving);
      }
      if (reassigned) this.assignSection(moving, sectionId!);
    });
  }
  setSlidesHidden(ids: string[], hidden: boolean) {
    if (typeof hidden !== "boolean") throw new Error("INVALID_SLIDE_HIDDEN");
    this.run(() => {
      for (const id of new Set(ids)) {
        const slide = slideOf(this.doc, id);
        if (
          slide &&
          slide.get("deleted") !== true &&
          !!slide.get("hidden") !== hidden
        )
          slide.set("hidden", hidden);
      }
    });
  }
  createSection(name: string, ids: string[]): string | null {
    if (this.readOnly) return null;
    const trimmed = name.trim();
    if (!trimmed || trimmed.length > 200)
      throw new Error("分节名称需为 1–200 个字符");
    const root = rootOf(this.doc),
      id = createId("section");
    if (
      [...root.keys()].filter((key) => key.startsWith("section:")).length >= 500
    )
      throw new Error("最多支持 500 个分节");
    this.run(() => {
      root.set("section:" + id, trimmed);
      this.assignSection(ids, id);
    });
    return id;
  }
  renameSection(id: string, name: string) {
    const trimmed = name.trim();
    if (!trimmed || trimmed.length > 200)
      throw new Error("分节名称需为 1–200 个字符");
    const root = rootOf(this.doc),
      key = "section:" + id;
    if (
      !root.has(key) &&
      !readDocument(this.doc).slideOrder.some(
        (sid) => slideOf(this.doc, sid)?.get("sectionId") === id,
      )
    )
      return;
    this.run(() => {
      if (root.get(key) !== trimmed) root.set(key, trimmed);
    });
  }
  /** Remove only the section organization; slides and nested CRDTs stay intact. */
  deleteSection(id: string) {
    this.run(() => {
      rootOf(this.doc).delete("section:" + id);
      slidesOf(this.doc).forEach((slide) => {
        if (slide.get("sectionId") === id) slide.delete("sectionId");
      });
    });
  }
  assignSection(ids: string[], sectionId: string | null) {
    if (sectionId !== null && !rootOf(this.doc).has("section:" + sectionId))
      throw new Error("分节不存在");
    this.run(() => {
      for (const id of new Set(ids)) {
        const slide = slideOf(this.doc, id);
        if (!slide || slide.get("deleted") === true) continue;
        if (sectionId === null) slide.delete("sectionId");
        else if (slide.get("sectionId") !== sectionId)
          slide.set("sectionId", sectionId);
      }
    });
  }
  moveSlide(id: string, direction: -1 | 1) {
    this.run(() =>
      this.moveInOrder(
        rootOf(this.doc).get("slideOrder") as Y.Array<string>,
        id,
        direction,
      ),
    );
  }
  /** Move a stable slide identity before another slide, or to the end. */
  moveSlideBefore(id: string, before: string | null) {
    const isLive = (sid: string) => {
      const slide = slideOf(this.doc, sid);
      return !!slide && slide.get("deleted") !== true;
    };
    if (!isLive(id) || before === id || (before && !isLive(before))) return;
    const order = rootOf(this.doc).get("slideOrder") as Y.Array<string>;
    const current = [...new Set(order.toArray())].filter(isLive);
    const next = current.filter((item) => item !== id);
    next.splice(before ? next.indexOf(before) : next.length, 0, id);
    if (next.join("\0") === current.join("\0")) return;
    this.run(() => {
      const order = rootOf(this.doc).get("slideOrder") as Y.Array<string>;
      this.removeFromOrder(order, [id]);
      const index = before ? order.toArray().indexOf(before) : order.length;
      order.insert(index < 0 ? order.length : index, [id]);
    });
  }
  insert(slide: string, element: SlideElement) {
    this.run(() => {
      const map = elementsOf(this.doc, slide);
      if (!map) return;
      map.set(element.id, encodeElement(element));
      (slideOf(this.doc, slide)!.get("elementOrder") as Y.Array<string>).push([
        element.id,
      ]);
    });
    return element.id;
  }
  add(
    slide: string,
    kind:
      | ShapeKind
      | "text"
      | "rect"
      | "ellipse"
      | "roundRect"
      | "triangle"
      | "diamond"
      | "line"
      | "table"
      | "chart",
    chartType: "bar" | "line" | "pie" | "doughnut" = "bar",
  ) {
    const base = {
      id: createId(kind),
      transform: {
        x: pxToEmu(140),
        y: pxToEmu(150),
        width: pxToEmu(300),
        height: pxToEmu(180),
        rotation: 0,
      },
    };
    let element: SlideElement;
    if (kind === "text") element = createTextElement();
    else if (kind === "line")
      element = {
        ...base,
        type: "line",
        transform: { ...base.transform, height: pxToEmu(1) },
        stroke: "#3b4f77",
        strokeWidth: 2,
      };
    else if (kind === "table")
      element = {
        ...base,
        type: "table",
        transform: {
          ...base.transform,
          width: pxToEmu(640),
          height: pxToEmu(260),
        },
        cells: [
          ["项目", "本期", "目标"],
          ["产品", "72", "90"],
          ["增长", "46", "60"],
        ],
        headerFill: "#325af0",
      };
    else if (kind === "chart")
      element = {
        ...base,
        type: "chart",
        transform: {
          ...base.transform,
          width: pxToEmu(480),
          height: pxToEmu(300),
        },
        chartType,
        labels: ["第一季", "第二季", "第三季", "第四季"],
        values: [32, 54, 46, 78],
        color: "#325af0",
      };
    else
      element = {
        ...base,
        type: "shape",
        shape: kind,
        fill: "#325af0",
        stroke: "#325af0",
        strokeWidth: 0,
      };
    return this.insert(slide, element);
  }
  remove(slide: string, ids: string[]) {
    this.run(() => {
      ids.forEach((id) =>
        elementsOf(this.doc, slide)?.get(id)?.set("deleted", true),
      );
      const order = slideOf(this.doc, slide)?.get("elementOrder") as
        Y.Array<string> | undefined;
      if (order) this.removeFromOrder(order, ids);
    });
  }
  duplicate(slide: string, ids: string[]): string[] {
    const next: string[] = [];
    this.run(() => {
      const source = readSlide(this.doc, slide);
      const groups = new Map<string, string>();
      for (const id of this.expandSelection(slide, ids)) {
        if (!source?.elements[id]) continue;
        const copy = structuredClone(source.elements[id]);
        copy.id = createId(copy.type);
        if (copy.groupId) {
          if (!groups.has(copy.groupId))
            groups.set(copy.groupId, createId("group"));
          copy.groupId = groups.get(copy.groupId);
        }
        copy.transform.x += pxToEmu(24);
        copy.transform.y += pxToEmu(24);
        elementsOf(this.doc, slide)!.set(copy.id, encodeElement(copy));
        (slideOf(this.doc, slide)!.get("elementOrder") as Y.Array<string>).push(
          [copy.id],
        );
        next.push(copy.id);
      }
    });
    return next;
  }
  layer(slide: string, id: string, direction: -1 | 1) {
    this.run(() =>
      this.moveInOrder(
        slideOf(this.doc, slide)!.get("elementOrder") as Y.Array<string>,
        id,
        direction,
      ),
    );
  }
  arrange(
    slide: string,
    ids: string[],
    action: "front" | "back" | "forward" | "backward",
  ) {
    const view = readSlide(this.doc, slide);
    if (!view) return;
    const selected = new Set(this.expandSelection(slide, ids)),
      next = [...view.elementOrder];
    if (action === "front" || action === "back") {
      const moving = next.filter((id) => selected.has(id)),
        rest = next.filter((id) => !selected.has(id));
      next.splice(
        0,
        next.length,
        ...(action === "front" ? [...rest, ...moving] : [...moving, ...rest]),
      );
    } else if (action === "forward") {
      for (let i = next.length - 2; i >= 0; i--)
        if (selected.has(next[i]) && !selected.has(next[i + 1]))
          [next[i], next[i + 1]] = [next[i + 1], next[i]];
    } else
      for (let i = 1; i < next.length; i++)
        if (selected.has(next[i]) && !selected.has(next[i - 1]))
          [next[i], next[i - 1]] = [next[i - 1], next[i]];
    if (next.join() === view.elementOrder.join()) return;
    this.run(() => {
      const order = slideOf(this.doc, slide)!.get(
        "elementOrder",
      ) as Y.Array<string>;
      // Move selected IDs only; preserve independent elements and their CRDT identities.
      this.removeFromOrder(order, [...selected]);
      for (let i = 0; i < next.length; i++)
        if (selected.has(next[i])) {
          const after = next
            .slice(i + 1)
            .find((id) => order.toArray().includes(id));
          order.insert(after ? order.toArray().indexOf(after) : order.length, [
            next[i],
          ]);
        }
    });
  }
  tableCommand(
    slide: string,
    id: string,
    command:
      | {
          kind: "cell";
          row: string;
          column: string;
          value: string;
          expected?: string;
        }
      | { kind: "insert-row" | "insert-column"; after: string | null }
      | { kind: "delete-row" | "delete-column"; target: string },
  ): boolean {
    const el = readSlide(this.doc, slide)?.elements[id];
    if (this.readOnly || el?.type !== "table" || el.locked) return false;
    const t = tableIds(el),
      axis = command.kind.endsWith("row") ? t.rowIds : t.columnIds;
    if (command.kind === "cell") {
      const row = t.rowIds.indexOf(command.row),
        col = t.columnIds.indexOf(command.column);
      if (row < 0 || col < 0 || command.value.length > 100000) return false;
      if (
        command.expected !== undefined &&
        el.cells[row][col] !== command.expected
      )
        return false;
      if (el.cells[row][col] === command.value) return true;
    } else if ("target" in command) {
      if (axis.length <= 1 || !axis.includes(command.target)) return false;
    } else if (
      axis.length >= 100 ||
      (command.after !== null && !axis.includes(command.after))
    )
      return false;
    this.run(() => {
      const target = elementOf(this.doc, slide, id)!;
      let clock = 0;
      target.forEach((v, key) => {
        if (key.startsWith(TABLE_OP))
          clock = Math.max(
            clock,
            Number(
              (v instanceof Y.Map ? v.get("clock") : (v as any).clock) ?? 0,
            ),
          );
      });
      const opId = createId("table-op"),
        { expected, ...content } = command as typeof command & {
          expected?: string;
        };
      const op: TableOperation = { ...content, id: opId, clock: clock + 1 };
      target.set(TABLE_OP + opId, op);
    });
    return true;
  }
  nudge(slide: string, ids: string[], dx: number, dy: number) {
    this.run(() => {
      const view = readSlide(this.doc, slide);
      ids.forEach((id) => {
        const el = view?.elements[id];
        if (el && !el.locked)
          patchElement(this.doc, slide, id, {
            transform: {
              x: el.transform.x + pxToEmu(dx),
              y: el.transform.y + pxToEmu(dy),
            },
          });
      });
    });
  }
  align(
    slide: string,
    ids: string[],
    axis: "left" | "center" | "right" | "top" | "middle" | "bottom",
  ) {
    this.run(() => {
      const page = readSlide(this.doc, slide);
      const pageSize = rootOf(this.doc).get("size") as Y.Map<number>;
      ids.forEach((id) => {
        const el = page?.elements[id];
        if (!el || el.locked) return;
        const t = el.transform;
        const horizontal = ["left", "center", "right"].includes(axis);
        const span = pageSize.get(horizontal ? "width" : "height")!;
        const size = horizontal ? t.width : t.height;
        const pos = ["left", "top"].includes(axis)
          ? 0
          : ["right", "bottom"].includes(axis)
            ? span - size
            : (span - size) / 2;
        patchElement(this.doc, slide, id, {
          transform: { [horizontal ? "x" : "y"]: Math.round(pos) },
        });
      });
    });
  }
  formatText(slide: string, ids: string[], marks: Omit<TextLeaf, "text">) {
    if (!validTextMarks(marks)) throw new Error("INVALID_TEXT_MARKS");
    this.run(() =>
      ids.forEach((id) => {
        const root = textOf(this.doc, slide, id);
        if (!root) return;
        for (const insert of root.toDelta()) {
          const paragraph = insert.insert;
          if (paragraph instanceof Y.XmlText && paragraph.length)
            paragraph.format(0, paragraph.length, marks);
        }
      }),
    );
  }
  private removeFromOrder(order: Y.Array<string>, ids: string[]) {
    for (let i = order.length - 1; i >= 0; i--)
      if (ids.includes(order.get(i))) order.delete(i, 1);
  }
  private moveInOrder(order: Y.Array<string>, id: string, direction: number) {
    const current = order.toArray().indexOf(id);
    if (current < 0) return;
    const target = Math.max(0, Math.min(order.length - 1, current + direction));
    if (current === target) return;
    this.removeFromOrder(order, [id]);
    order.insert(target, [id]);
  }
}
