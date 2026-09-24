import { describe, expect, it } from "vitest";
import { UpdateOutbox } from "./outbox";

describe("UpdateOutbox", () => {
  it("only acknowledges the exact head message and epoch", () => {
    const outbox = new UpdateOutbox();
    outbox.enqueue({ id: "a", epochId: "e1", bytes: new Uint8Array([1]) });
    outbox.enqueue({ id: "b", epochId: "e1", bytes: new Uint8Array([2]) });
    expect(outbox.acknowledge("b", "e1")).toBeUndefined();
    expect(outbox.acknowledge("a", "wrong")).toBeUndefined();
    expect(outbox.pending).toHaveLength(2);
    expect(outbox.acknowledge("a", "e1")?.id).toBe("a");
    expect(outbox.peek()?.id).toBe("b");
  });
});
