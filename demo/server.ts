import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { randomUUID, createHash } from "node:crypto";
import { WebSocketServer, WebSocket } from "ws";
import * as Y from "yjs";
import type { ViteDevServer } from "vite";
import { createYDocument } from "../src/collaboration/yjs-codec";
import { createPresentation } from "../src/model/create";
import { validateDocument } from "../src/model/validate";
import { wireDecode, wireEncode } from "../src/collaboration/websocket";
import { uploadPptx } from "./pptx-upload";
import { presentationStore } from "../src/model/projection-store";

/** Local demo host only: production must replace the fixed room with authenticated Doca ACL. */
export function attachDemoServer(server: ViteDevServer) {
  mkdirSync(".demo-data", { recursive: true });
  const db = new DatabaseSync(".demo-data/presentations-v2.sqlite");
  db.exec(
    "PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS rooms (id TEXT PRIMARY KEY, epoch TEXT, seq INTEGER, state BLOB); CREATE TABLE IF NOT EXISTS messages (room TEXT, epoch TEXT, id TEXT, hash TEXT, seq INTEGER, PRIMARY KEY(room,epoch,id)); CREATE TABLE IF NOT EXISTS assets (id TEXT PRIMARY KEY, mime TEXT, bytes BLOB)",
  );
  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: 8 * 1024 * 1024,
  });
  const rooms = new Map<
    string,
    {
      doc: Y.Doc;
      epoch: string;
      seq: number;
      state: Uint8Array;
      candidate?: Y.Doc;
    }
  >();
  const sessions = new Map<
    WebSocket,
    {
      sessionId: string;
      userId: string;
      name: string;
      color: string;
      room?: string;
      presence?: any;
      readonly: boolean;
    }
  >();
  const send = (ws: WebSocket, data: unknown) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(wireEncode(data));
  };
  const broadcast = (room: string, data: unknown, except?: WebSocket) => {
    for (const [ws, s] of sessions)
      if (s.room === room && ws !== except) send(ws, data);
  };
  const presence = (room: string) =>
    broadcast(room, {
      type: "presence",
      room,
      sessions: [...sessions.values()]
        .filter((s) => s.room === room && !s.readonly && s.presence)
        .map((s) => ({
          ...s.presence,
          sessionId: s.sessionId,
          userId: s.userId,
          name: s.name,
          color: s.color,
        })),
    });
  server.httpServer?.on("upgrade", (req, socket, head) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (url.pathname === "/eppt-sync")
      wss.handleUpgrade(req, socket, head, (ws) =>
        wss.emit("connection", ws, req),
      );
  });
  wss.on("connection", (ws, req) => {
    const id = randomUUID();
    const color = ["#325af0", "#df5593", "#089e87", "#d88916"][
      sessions.size % 4
    ];
    const session = {
      sessionId: id,
      userId: "demo-user",
      name: "演示用户 " + (sessions.size + 1),
      color,
      readonly:
        new URL(req.url!, "http://localhost").searchParams.get("readonly") ===
        "1",
      room: undefined as string | undefined,
      presence: undefined as any,
    };
    sessions.set(ws, session);
    ws.on("message", (data) => {
      try {
        const message = wireDecode(data.toString()) as any;
        if (
          message.type === "sync-request" &&
          (message.protocolVersion !== 1 ||
            message.codec !== "eppt" ||
            message.codecRevision !== 5 ||
            message.schemaVersion !== 2)
        )
          throw new Error("UNSUPPORTED_PROTOCOL_OR_SCHEMA");
        if (!/^(demo|test-[a-z0-9-]{1,80})$/.test(message.room))
          throw new Error("ROOM_DENIED");
        let room = rooms.get(message.room);
        if (!room) {
          const stored = db
            .prepare("SELECT * FROM rooms WHERE id=?")
            .get(message.room) as any;
          const doc = stored
            ? new Y.Doc()
            : createYDocument(createPresentation());
          if (stored) Y.applyUpdate(doc, stored.state);
          room = {
            doc,
            epoch: stored?.epoch ?? randomUUID(),
            seq: stored?.seq ?? 0,
            state: stored?.state ?? Y.encodeStateAsUpdate(doc),
          };
          if (!stored)
            db.prepare("INSERT INTO rooms VALUES (?,?,?,?)").run(
              message.room,
              room.epoch,
              0,
              room.state,
            );
          rooms.set(message.room, room);
        }
        if (message.type === "sync-request") {
          if (message.epochId && message.epochId !== room.epoch)
            throw new Error("EPOCH_MISMATCH");
          session.room = message.room;
          send(ws, {
            type: "sync-response",
            protocolVersion: 1,
            room: message.room,
            epochId: room.epoch,
            codec: "eppt",
            codecRevision: 5,
            schemaVersion: 2,
            seq: room.seq,
            checkpointSeq: room.seq,
            update: Y.encodeStateAsUpdate(room.doc, message.vector),
            identity: {
              sessionId: session.sessionId,
              userId: session.userId,
              name: session.name,
              color: session.color,
            },
          });
        } else if (message.type === "update") {
          if (session.readonly || session.room !== message.room)
            throw new Error("READ_ONLY");
          if (message.epochId !== room.epoch) throw new Error("EPOCH_MISMATCH");
          if (
            !(message.update instanceof Uint8Array) ||
            typeof message.id !== "string"
          )
            throw new Error("INVALID_UPDATE");
          const hash = createHash("sha256")
            .update(message.update)
            .digest("hex");
          const existing = db
            .prepare(
              "SELECT hash,seq FROM messages WHERE room=? AND epoch=? AND id=?",
            )
            .get(message.room, room.epoch, message.id) as any;
          if (existing) {
            if (existing.hash !== hash) throw new Error("MESSAGE_ID_REUSED");
            send(ws, {
              type: "ack",
              id: message.id,
              room: message.room,
              epochId: room.epoch,
              seq: existing.seq,
            });
            return;
          }
          // Retain an isolated validation replica between accepted updates. Never
          // publish it: the authoritative replica advances only after COMMIT.
          let bytes: Uint8Array, changed: boolean, seq: number;
          try {
            if (!room.candidate) {
              room.candidate = new Y.Doc();
              Y.applyUpdate(room.candidate, room.state);
            }
            const projection = presentationStore(room.candidate);
            Y.applyUpdate(room.candidate, message.update);
            validateDocument(projection.getSnapshot());
            bytes = Y.encodeStateAsUpdate(room.candidate);
            changed = !Buffer.from(bytes).equals(Buffer.from(room.state));
            seq = room.seq + (changed ? 1 : 0);
            db.exec("BEGIN IMMEDIATE");
            try {
              db.prepare("UPDATE rooms SET seq=?, state=? WHERE id=?").run(
                seq,
                bytes,
                message.room,
              );
              db.prepare("INSERT INTO messages VALUES (?,?,?,?,?)").run(
                message.room,
                room.epoch,
                message.id,
                hash,
                seq,
              );
              db.exec("COMMIT");
            } catch (error) {
              db.exec("ROLLBACK");
              throw error;
            }
          } catch (error) {
            // Rejected content / failed persistence must not poison later edits.
            room.candidate?.destroy();
            room.candidate = undefined;
            throw error;
          }
          Y.applyUpdate(room.doc, message.update);
          room.seq = seq;
          room.state = bytes;
          send(ws, {
            type: "ack",
            id: message.id,
            room: message.room,
            epochId: room.epoch,
            seq,
          });
          if (changed)
            broadcast(
              message.room,
              {
                type: "update",
                room: message.room,
                epochId: room.epoch,
                update: message.update,
              },
              ws,
            );
        } else if (message.type === "presence") {
          if (session.readonly || session.room !== message.room) return;
          const p = message.presence;
          if (
            p &&
            (!Array.isArray(p.selection?.elementIds) ||
              p.selection.elementIds.length > 100)
          )
            return;
          session.presence = p
            ? {
                slideId: String(p.slideId),
                selection: {
                  elementIds: p.selection.elementIds.filter(
                    (id: unknown) => typeof id === "string",
                  ),
                  editing: p.selection.editing === true,
                },
              }
            : null;
          presence(message.room);
        }
      } catch (error) {
        send(ws, {
          type: "error",
          code: "REJECTED",
          message: error instanceof Error ? error.message : String(error),
        });
      }
    });
    ws.on("close", () => {
      sessions.delete(ws);
      if (session.room) {
        presence(session.room);
        if (![...sessions.values()].some((s) => s.room === session.room)) {
          const idle = rooms.get(session.room);
          idle?.candidate?.destroy();
          if (idle) idle.candidate = undefined;
        }
      }
    });
  });
  server.middlewares.use("/eppt-import", (req, res) => {
    const canWrite = () =>
      [...sessions.values()].some(
        (s) =>
          s.sessionId === req.headers["x-eppt-session"] &&
          !s.readonly &&
          !!s.room,
      );
    void uploadPptx(req, res, db, canWrite);
  });
  server.middlewares.use("/eppt-assets", (req, res, next) => {
    if (req.method === "POST") {
      const mime = req.headers["content-type"] ?? "";
      if (
        !["image/png", "image/jpeg", "image/gif", "image/webp"].includes(mime)
      ) {
        res.statusCode = 415;
        res.end("仅支持 PNG/JPEG/GIF/WebP");
        return;
      }
      let size = 0;
      const chunks: Buffer[] = [];
      req.on("data", (chunk) => {
        size += chunk.length;
        if (size > 10 * 1024 * 1024) {
          res.statusCode = 413;
          res.end("图片超过 10 MB");
          req.destroy();
        } else chunks.push(chunk);
      });
      req.on("end", () => {
        if (res.writableEnded) return;
        const id = randomUUID();
        db.prepare("INSERT INTO assets VALUES (?,?,?)").run(
          id,
          mime,
          Buffer.concat(chunks),
        );
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ id }));
      });
    } else if (req.method === "GET") {
      const id = (req.url ?? "").replace(/^\//, "").split("?")[0];
      const asset = db
        .prepare("SELECT * FROM assets WHERE id=?")
        .get(id) as any;
      if (!asset) {
        res.statusCode = 404;
        res.end("Not found");
        return;
      }
      res.setHeader("Content-Type", asset.mime);
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.end(asset.bytes);
    } else next();
  });
  server.httpServer?.on("close", () => {
    wss.close();
    rooms.forEach((r) => {
      r.doc.destroy();
      r.candidate?.destroy();
    });
    db.close();
  });
}
