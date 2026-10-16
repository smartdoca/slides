import { it, expect } from "vitest";
import { WebSocket } from "ws";
import * as Y from "yjs";
import { wireEncode, wireDecode } from "./websocket";
import { readDocument } from "./yjs-codec";
import { REMOTE_ORIGIN } from "./origins";
import { EditorController } from "../model/controller";

// Integration tests use an isolated test room on the running local demo host.
it.runIf(process.env.EPPT_INTEGRATION === "1")(
  "persists, deduplicates ACKs, synchronizes peers and rejects readonly writes",
  async () => {
    const base = process.env.EPPT_TEST_ORIGIN ?? "ws://127.0.0.1:5173";
    const room = "test-" + crypto.randomUUID(),
      a = new WebSocket(`${base}/eppt-sync`),
      b = new WebSocket(`${base}/eppt-sync?readonly=1`);
    const messages = new Map<WebSocket, any[]>([
      [a, []],
      [b, []],
    ]);
    for (const ws of [a, b])
      ws.on("message", (bytes) =>
        messages.get(ws)!.push(wireDecode(bytes.toString())),
      );
    await Promise.all(
      [a, b].map(
        (ws) =>
          new Promise<void>((resolve, reject) => {
            ws.once("open", () => resolve());
            ws.once("error", reject);
          }),
      ),
    );
    const awaitMessage = async (ws: WebSocket, type: string) => {
      for (let i = 0; i < 100; i++) {
        const list = messages.get(ws)!,
          index = list.findIndex((m) => m.type === type);
        if (index >= 0) return list.splice(index, 1)[0];
        await new Promise((r) => setTimeout(r, 20));
      }
      throw new Error("Timeout: " + type);
    };
    const send = (ws: WebSocket, m: unknown) => ws.send(wireEncode(m));
    try {
      for (const ws of [a, b])
        send(ws, {
          type: "sync-request",
          protocolVersion: 1,
          codec: "eppt",
          codecRevision: 6,
          schemaVersion: 2,
          room,
          id: crypto.randomUUID(),
          vector: Y.encodeStateVector(new Y.Doc()),
        });
      const initial = await awaitMessage(a, "sync-response");
      await awaitMessage(b, "sync-response");
      const doc = new Y.Doc();
      Y.applyUpdate(doc, initial.update, REMOTE_ORIGIN);
      let update!: Uint8Array;
      doc.on("update", (bytes) => (update = bytes));
      doc.getMap("presentation").set("title", "持久化测试");
      const request = {
        type: "update",
        room,
        id: crypto.randomUUID(),
        epochId: initial.epochId,
        update,
      };
      send(a, request);
      const ack = await awaitMessage(a, "ack");
      expect(ack.seq).toBe(1);
      expect((await awaitMessage(b, "update")).update).toEqual(update);
      send(a, request);
      const repeat = await awaitMessage(a, "ack");
      expect(repeat.seq).toBe(ack.seq);
      send(b, { ...request, id: crypto.randomUUID() });
      expect((await awaitMessage(b, "error")).message).toBe("READ_ONLY");
      send(a, {
        type: "sync-request",
        protocolVersion: 1,
        codec: "eppt",
        codecRevision: 6,
        schemaVersion: 2,
        room,
        id: crypto.randomUUID(),
        vector: Y.encodeStateVector(new Y.Doc()),
      });
      const restored = new Y.Doc();
      Y.applyUpdate(restored, (await awaitMessage(a, "sync-response")).update);
      expect(readDocument(restored).title).toBe("持久化测试");
      const controller = new EditorController(doc),
        sid = readDocument(doc).slideOrder[0];
      for (const action of [
        () => controller.add(sid, "table"),
        () => {
          const table = Object.values(
            readDocument(doc).slides[sid].elements,
          ).find((e) => e.type === "table")!;
          if (table.type === "table")
            controller.tableCommand(sid, table.id, {
              kind: "insert-row",
              after: table.rowIds![0],
            });
        },
        ...(
          ["style", "merge", "split", "resize", "paste", "clear"] as const
        ).map((kind) => () => {
          const table = Object.values(
            readDocument(doc).slides[sid].elements,
          ).find(
            (el) => el.type === "table",
          ) as import("../model/types").TableElement;
          const rows = table.rowIds!.slice(1, 3),
            columns = table.columnIds!.slice(0, 2);
          if (kind === "style")
            controller.tableCommand(sid, table.id, {
              kind,
              rows,
              columns,
              style: { bold: true, backgroundColor: "#fff3b0" },
            });
          if (kind === "merge")
            controller.tableCommand(sid, table.id, { kind, rows, columns });
          if (kind === "split")
            controller.tableCommand(sid, table.id, {
              kind,
              targets: table.merges!.map((m) => m.id),
            });
          if (kind === "resize")
            controller.tableCommand(sid, table.id, {
              kind,
              axis: "column",
              sizes: table.columnIds!.map((target, i) => ({
                target,
                size: 120 + i * 40,
              })),
              extent: 480,
            });
          if (kind === "paste")
            controller.tableCommand(sid, table.id, {
              kind,
              row: rows[0],
              column: columns[0],
              payload: {
                version: 1,
                cells: [
                  ["协同", "粘贴"],
                  ["保存", "恢复"],
                ],
              },
            });
          if (kind === "clear")
            controller.tableCommand(sid, table.id, {
              kind,
              rows: [rows[1]],
              columns: [columns[1]],
            });
        }),
      ]) {
        action();
        send(a, {
          type: "update",
          room,
          id: crypto.randomUUID(),
          epochId: initial.epochId,
          update,
        });
        await awaitMessage(a, "ack");
        Y.applyUpdate(
          restored,
          (await awaitMessage(b, "update")).update,
          REMOTE_ORIGIN,
        );
      }
      expect(readDocument(restored)).toEqual(readDocument(doc));
      controller.dispose();
      // A poisoned speculative replica must be discarded, never persisted.
      const invalid = new Y.Doc();
      Y.applyUpdate(invalid, Y.encodeStateAsUpdate(doc));
      let invalidUpdate!: Uint8Array;
      invalid.on("update", (bytes) => {
        invalidUpdate = bytes;
      });
      invalid.getMap("presentation").set("schemaVersion", 999);
      send(a, { ...request, id: crypto.randomUUID(), update: invalidUpdate });
      expect((await awaitMessage(a, "error")).message).toBe("INVALID_DOCUMENT");
      doc.getMap("presentation").set("title", "拒绝非法修改后继续编辑");
      send(a, { ...request, id: crypto.randomUUID(), update });
      await awaitMessage(a, "ack");
      Y.applyUpdate(restored, (await awaitMessage(b, "update")).update);
      expect(readDocument(restored).schemaVersion).toBe(2);
      expect(readDocument(restored).title).toBe("拒绝非法修改后继续编辑");
      invalid.destroy();
      send(a, { ...request, update: new Uint8Array([1, 2]) });
      expect((await awaitMessage(a, "error")).message).toBe(
        "MESSAGE_ID_REUSED",
      );
      send(a, {
        type: "sync-request",
        protocolVersion: 99,
        codec: "eppt",
        codecRevision: 6,
        schemaVersion: 2,
        room,
        id: crypto.randomUUID(),
        vector: Y.encodeStateVector(doc),
      });
      expect((await awaitMessage(a, "error")).message).toBe(
        "UNSUPPORTED_PROTOCOL_OR_SCHEMA",
      );
      send(a, {
        type: "sync-request",
        protocolVersion: 1,
        codec: "eppt",
        schemaVersion: 2,
        room,
        id: crypto.randomUUID(),
        vector: Y.encodeStateVector(doc),
      });
      expect((await awaitMessage(a, "error")).message).toBe(
        "UNSUPPORTED_PROTOCOL_OR_SCHEMA",
      );
    } finally {
      a.close();
      b.close();
    }
  },
  15000,
);
