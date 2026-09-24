import { it, expect } from "vitest";
import { WebSocket } from "ws";
import * as Y from "yjs";
import { wireEncode, wireDecode } from "./websocket";
import { createPresentation } from "../model/create";
import { EditorController } from "../model/controller";
import { createYDocument, readDocument } from "./yjs-codec";
import { exportPptx, importPptx, PPTX_MIME } from "../pptx";
it.runIf(process.env.EPPT_INTEGRATION === "1")(
  "uploads a real PPTX into a new persisted lineage, rebinds media, synchronizes edits and rejects readonly/corrupt uploads",
  async () => {
    const base = process.env.EPPT_TEST_ORIGIN ?? "ws://127.0.0.1:5180",
      http = base.replace(/^ws/, "http"),
      sockets: WebSocket[] = [];
    async function connect(room: string, readonly = false) {
      const ws = new WebSocket(
          base + "/eppt-sync" + (readonly ? "?readonly=1" : ""),
        ),
        queue: any[] = [];
      sockets.push(ws);
      ws.on("message", (data) => queue.push(wireDecode(data.toString())));
      await new Promise<void>((r, j) => {
        ws.once("open", () => r());
        ws.once("error", j);
      });
      const next = async (type: string) => {
        for (let i = 0; i < 150; i++) {
          const n = queue.findIndex((m) => m.type === type);
          if (n >= 0) return queue.splice(n, 1)[0];
          await new Promise((r) => setTimeout(r, 20));
        }
        throw Error("Timeout " + type);
      };
      const sync = () =>
        ws.send(
          wireEncode({
            type: "sync-request",
            protocolVersion: 1,
            codec: "eppt",
            codecRevision: 5,
            schemaVersion: 2,
            room,
            vector: Y.encodeStateVector(new Y.Doc()),
          }),
        );
      sync();
      return { ws, next, sync, initial: await next("sync-response") };
    }
    try {
      const room = "test-upload-source-" + crypto.randomUUID(),
        source = await connect(room),
        ro = await connect(room, true);
      const model = createPresentation(),
        fixture = createYDocument(model),
        c = new EditorController(fixture),
        s = model.slideOrder[0];
      c.add(s, "table");
      c.add(s, "chart");
      c.insert(s, {
        id: "import-image",
        type: "image",
        assetId: "old-id",
        transform: {
          x: 100,
          y: 200,
          width: 900000,
          height: 600000,
          rotation: 0,
        },
      });
      const png =
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=";
      const file = await exportPptx(readDocument(fixture), async () => png);
      const upload = (token: string, body: BodyInit) =>
        fetch(http + "/eppt-import", {
          method: "POST",
          headers: {
            "Content-Type": PPTX_MIME,
            "X-EPPT-Filename": encodeURIComponent("中文上传验收.pptx"),
            "X-EPPT-Session": token,
          },
          body,
        });
      expect(
        (await upload(ro.initial.identity.sessionId, file.blob)).status,
      ).toBe(403);
      expect((await upload("invalid", file.blob)).status).toBe(403);
      expect(
        (
          await upload(
            source.initial.identity.sessionId,
            new Blob(["broken pptx"]),
          )
        ).status,
      ).toBe(400);
      const response = await upload(
        source.initial.identity.sessionId,
        file.blob,
      );
      expect(response.status).toBe(201);
      const result = (await response.json()) as any;
      expect(result.room).not.toBe(room);
      const a = await connect(result.room),
        b = await connect(result.room, true);
      expect(a.initial.epochId).not.toBe(source.initial.epochId);
      const da = new Y.Doc(),
        db = new Y.Doc();
      Y.applyUpdate(da, a.initial.update);
      Y.applyUpdate(db, b.initial.update);
      expect(readDocument(da)).toEqual(readDocument(db));
      expect(readDocument(da).title).toBe("中文上传验收");
      const imported = readDocument(da),
        image = Object.values(
          imported.slides[imported.slideOrder[0]].elements,
        ).find((e) => e.type === "image")!;
      if (image.type !== "image") throw Error("image fixture");
      expect(image.assetId).not.toBe("old-id");
      expect((await fetch(http + "/eppt-assets/" + image.assetId)).status).toBe(
        200,
      );
      let update!: Uint8Array;
      da.on("update", (u) => (update = u));
      da.getMap("presentation").set("title", "导入后编辑");
      a.ws.send(
        wireEncode({
          type: "update",
          room: result.room,
          epochId: a.initial.epochId,
          id: crypto.randomUUID(),
          update,
        }),
      );
      await a.next("ack");
      Y.applyUpdate(db, (await b.next("update")).update);
      expect(readDocument(db).title).toBe("导入后编辑");
      a.sync();
      const restored = new Y.Doc();
      Y.applyUpdate(restored, (await a.next("sync-response")).update);
      expect(readDocument(restored)).toEqual(readDocument(da));
      source.sync();
      expect((await source.next("sync-response")).update).toEqual(
        source.initial.update,
      );
      const roundtrip = await exportPptx(readDocument(restored), async (id) => {
        const r = await fetch(http + "/eppt-assets/" + id);
        return (
          "data:" +
          r.headers.get("content-type") +
          ";base64," +
          Buffer.from(await r.arrayBuffer()).toString("base64")
        );
      });
      expect(
        (await importPptx(await roundtrip.blob.arrayBuffer())).document
          .slideOrder,
      ).toHaveLength(1);
      c.dispose();
    } finally {
      sockets.forEach((s) => s.close());
    }
  },
  20000,
);
