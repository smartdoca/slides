import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { createPresentation } from "../model/create";
import { LOCAL_ORIGIN, REMOTE_ORIGIN } from "./origins";
import { createYDocument, readDocument, updateElement } from "./yjs-codec";

describe("eppt Yjs codec", () => {
  it("roundtrips a presentation", () => {
    const value = createPresentation();
    expect(readDocument(createYDocument(value))).toEqual(value);
  });

  it("converges without treating remote apply as local", () => {
    const source = createYDocument(createPresentation());
    const target = new Y.Doc();
    const origins: unknown[] = [];
    target.on("update", (_update, origin) => origins.push(origin));
    Y.applyUpdate(target, Y.encodeStateAsUpdate(source), REMOTE_ORIGIN);
    const value = readDocument(source);
    const slide = value.slides[value.slideOrder[0]];
    const element = slide.elements[slide.elementOrder[0]];
    updateElement(
      source,
      slide.id,
      { ...element, transform: { ...element.transform, x: 42 } },
      LOCAL_ORIGIN,
    );
    Y.applyUpdate(
      target,
      Y.encodeStateAsUpdate(source, Y.encodeStateVector(target)),
      REMOTE_ORIGIN,
    );
    expect(readDocument(target)).toEqual(readDocument(source));
    expect(origins.every((origin) => origin === REMOTE_ORIGIN)).toBe(true);
  });
});
