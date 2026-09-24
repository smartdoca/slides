import { expect, it, afterEach, vi } from "vitest";
import * as Y from "yjs";
import { CollaborationSession } from "./session";
import type {
  ClientMessage,
  ServerMessage,
  CollaborationTransport,
} from "./transport";
import { createYDocument, readDocument, patchElement } from "./yjs-codec";
import { createPresentation } from "../model/create";

class TestTransport implements CollaborationTransport {
  sent: ClientMessage[] = [];
  listeners = new Set<(m: ServerMessage) => void>();
  async connect() {}
  send(m: ClientMessage) {
    this.sent.push(m);
  }
  disconnect() {}
  subscribe(fn: (m: ServerMessage) => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  emit(m: ServerMessage) {
    this.listeners.forEach((fn) => fn(m));
  }
}
const sessions: CollaborationSession[] = [];
it.each([undefined, 2, 3, 4, 6])(
  "refuses incompatible codec revision %s before applying document bytes",
  async (codecRevision) => {
    const transport = new TestTransport(),
      document = new Y.Doc(),
      errors: Error[] = [];
    const session = new CollaborationSession({
      room: "room",
      schemaVersion: 2,
      document,
      transport,
      onError: (e) => errors.push(e),
    });
    sessions.push(session);
    await session.connect();
    const before = Y.encodeStateAsUpdate(document);
    transport.emit({
      type: "sync-response",
      protocolVersion: 1,
      room: "room",
      epochId: "epoch",
      codec: "eppt",
      codecRevision,
      schemaVersion: 2,
      seq: 0,
      checkpointSeq: 0,
      update: Y.encodeStateAsUpdate(createYDocument(createPresentation())),
      identity: { sessionId: "s", userId: "u", name: "A", color: "#111111" },
    });
    expect(errors[0]?.message).toContain("CODEC_REVISION_MISMATCH");
    expect(Y.encodeStateAsUpdate(document)).toEqual(before);
  },
);
afterEach(() => {
  sessions.splice(0).forEach((s) => s.dispose());
  vi.useRealTimers();
});
async function setup() {
  const transport = new TestTransport(),
    server = createYDocument(createPresentation()),
    client = new Y.Doc(),
    states: string[] = [];
  const session = new CollaborationSession({
    room: "room",
    schemaVersion: 2,
    document: client,
    transport,
    onSaveStateChange: (s) => states.push(s),
  });
  sessions.push(session);
  await session.connect();
  const sync = (epoch = "epoch") =>
    transport.emit({
      type: "sync-response",
      protocolVersion: 1,
      room: "room",
      epochId: epoch,
      codec: "eppt",
      codecRevision: 5,
      schemaVersion: 2,
      seq: 0,
      checkpointSeq: 0,
      update: Y.encodeStateAsUpdate(server),
      identity: { sessionId: "s", userId: "u", name: "A", color: "#111111" },
    });
  sync();
  const view = readDocument(client),
    slide = view.slideOrder[0],
    id = view.slides[slide].elementOrder[0];
  return {
    transport,
    server,
    client,
    session,
    states,
    sync,
    edit: () =>
      patchElement(client, slide, id, {
        transform: { x: Math.random() * 1000 },
      }),
  };
}
it("retries a lost ACK with unchanged bytes and stops retrying after durable acknowledgement", async () => {
  vi.useFakeTimers();
  const s = await setup();
  s.edit();
  const first = s.session.outbox.peek()!;
  vi.advanceTimersByTime(5001);
  const updates = s.transport.sent.filter((m) => m.type === "update");
  expect(updates).toHaveLength(2);
  expect(updates[1]).toMatchObject({ id: first.id, update: first.bytes });
  expect(s.states.at(-1)).toBe("saving");
  s.transport.emit({
    type: "ack",
    room: "room",
    id: first.id,
    epochId: "epoch",
    seq: 1,
  });
  vi.advanceTimersByTime(15000);
  expect(s.transport.sent.filter((m) => m.type === "update")).toHaveLength(2);
  expect(s.states.at(-1)).toBe("clean");
});
it("rejects unknown negotiated schemas without accepting new document bytes", async () => {
  const s = await setup(),
    before = Y.encodeStateAsUpdate(s.client);
  s.transport.emit({
    type: "sync-response",
    protocolVersion: 1,
    room: "room",
    epochId: "epoch",
    codec: "eppt",
    codecRevision: 5,
    schemaVersion: 999,
    seq: 1,
    checkpointSeq: 1,
    update: Y.encodeStateAsUpdate(s.server),
    identity: { sessionId: "s", userId: "u", name: "A", color: "#111111" },
  });
  expect(s.session.state).toBe("error");
  expect(Y.encodeStateAsUpdate(s.client)).toEqual(before);
});
it("retains original IDs/bytes until matching durable ACK; sync is not an ACK", async () => {
  const s = await setup();
  s.edit();
  const first = s.session.outbox.peek()!;
  s.edit();
  expect(s.session.outbox.pending.length).toBe(2);
  s.sync();
  expect(s.session.outbox.pending.length).toBe(2);
  expect(s.session.outbox.peek()).toBe(first);
  s.transport.emit({
    type: "ack",
    room: "room",
    id: "unknown",
    epochId: "epoch",
    seq: 1,
  });
  expect(s.session.outbox.pending.length).toBe(2);
  s.transport.emit({
    type: "ack",
    room: "room",
    id: first.id,
    epochId: "wrong",
    seq: 1,
  });
  expect(s.session.outbox.pending.length).toBe(2);
  s.transport.emit({
    type: "ack",
    room: "room",
    id: first.id,
    epochId: "epoch",
    seq: 1,
  });
  expect(s.session.outbox.pending.length).toBe(1);
  s.transport.emit({
    type: "ack",
    room: "room",
    id: first.id,
    epochId: "epoch",
    seq: 1,
  });
  expect(s.session.outbox.pending.length).toBe(1);
  const second = s.session.outbox.peek()!;
  s.transport.emit({
    type: "ack",
    room: "room",
    id: second.id,
    epochId: "epoch",
    seq: 2,
  });
  expect(s.states.at(-1)).toBe("clean");
});
it("reconnect replays pending bytes after sync, and wrong room cannot acknowledge them", async () => {
  const s = await setup();
  s.edit();
  const first = s.session.outbox.peek()!;
  s.transport.emit({ type: "disconnected" });
  await s.session.reconnect();
  s.sync();
  const resent = s.transport.sent.at(-1);
  expect(resent?.type).toBe("update");
  if (resent?.type === "update") {
    expect(resent.id).toBe(first.id);
    expect(resent.update).toEqual(first.bytes);
  }
  s.transport.emit({
    type: "ack",
    room: "foreign",
    id: first.id,
    epochId: "epoch",
    seq: 2,
  });
  expect(s.session.outbox.dirty).toBe(true);
});
it("refuses changed epochs even without pending edits; does not mutate the existing doc", async () => {
  const s = await setup(),
    before = Y.encodeStateAsUpdate(s.client);
  s.sync("replacement");
  expect(s.session.state).toBe("error");
  expect(Y.encodeStateAsUpdate(s.client)).toEqual(before);
});
it("remote updates and repeated deletion synchronization never enter outbox", async () => {
  const s = await setup();
  const root = s.server.getMap("presentation"),
    slides = root.get("slides") as Y.Map<any>,
    id = (root.get("slideOrder") as Y.Array<string>).get(0);
  slides.delete(id);
  (root.get("slideOrder") as Y.Array<string>).delete(0, 1);
  const update = Y.encodeStateAsUpdate(s.server, Y.encodeStateVector(s.client));
  s.transport.emit({ type: "update", room: "room", epochId: "epoch", update });
  s.sync();
  s.sync();
  expect(s.session.outbox.pending).toHaveLength(0);
  expect(s.transport.sent.filter((m) => m.type === "update")).toHaveLength(0);
  expect(readDocument(s.client).slideOrder).toHaveLength(0);
});
