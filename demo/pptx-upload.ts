import type { IncomingMessage, ServerResponse } from "node:http";
import type { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import * as Y from "yjs";
import { importPptx, PPTX_MAX_BYTES } from "../src/pptx";
import { createYDocument } from "../src/collaboration/yjs-codec";
import { validateDocument } from "../src/model/validate";

/** Demo host adapter only. Production must replace session lookup with authenticated Doca ACL. */
export async function uploadPptx(
  req: IncomingMessage,
  res: ServerResponse,
  db: DatabaseSync,
  canWrite: () => boolean,
) {
  const reply = (status: number, body: unknown) => {
    res.statusCode = status;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(body));
  };
  try {
    if (req.method !== "POST") {
      reply(405, { error: "仅支持 POST" });
      return;
    }
    if (!canWrite()) {
      reply(403, { error: "当前会话没有上传权限，请连接后重试。" });
      return;
    }
    const origin = req.headers.origin;
    if (origin && new URL(origin).host !== req.headers.host) {
      reply(403, { error: "不允许跨站上传" });
      return;
    }
    if (Number(req.headers["content-length"] ?? 0) > PPTX_MAX_BYTES) {
      reply(413, { error: "PPTX 文件超过 30 MB" });
      return;
    }
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > PPTX_MAX_BYTES) throw new Error("PPTX 文件超过 30 MB");
      chunks.push(chunk);
    }
    if (!size) throw new Error("文件为空，请重新选择。");
    const parsed = await importPptx(Buffer.concat(chunks));
    if (req.aborted || res.destroyed) return;
    if (!canWrite()) {
      reply(403, { error: "上传权限已失效，未创建文稿。" });
      return;
    }
    const filename = decodeURIComponent(
      String(req.headers["x-eppt-filename"] ?? "演示文稿.pptx"),
    );
    parsed.document.title =
      filename
        .replace(/\.pptx$/i, "")
        .replace(/[\x00-\x1f]/g, "")
        .slice(0, 120) || "导入的演示文稿";
    const bound = new Map<string, string>(),
      stored: { id: string; mime: string; bytes: Uint8Array }[] = [];
    for (const asset of parsed.assets) {
      // Never serve active SVG/unknown file content from this same-origin demo asset endpoint.
      const b = asset.bytes;
      const valid =
        (asset.mime === "image/png" &&
          b.length > 8 &&
          [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => b[i] === v)) ||
        (asset.mime === "image/jpeg" &&
          b[0] === 255 &&
          b[1] === 216 &&
          b[2] === 255) ||
        (asset.mime === "image/gif" &&
          Buffer.from(b.subarray(0, 6))
            .toString()
            .match(/^GIF8[79]a$/));
      if (!valid || b.length > 10 * 1024 * 1024) {
        parsed.issues.push({
          message: `图片 ${asset.name} 未导入：仅接收 10 MB 内有效的 PNG/JPEG/GIF，SVG 等需宿主安全转换。`,
        });
        continue;
      }
      const id = randomUUID();
      bound.set(asset.id, id);
      stored.push({ id, mime: asset.mime, bytes: b });
    }
    for (const slide of Object.values(parsed.document.slides))
      for (const id of [...slide.elementOrder]) {
        const el = slide.elements[id];
        if (el.type !== "image") continue;
        const assetId = bound.get(el.assetId);
        if (assetId) el.assetId = assetId;
        else {
          delete slide.elements[id];
          slide.elementOrder = slide.elementOrder.filter((e) => e !== id);
        }
      }
    validateDocument(parsed.document);
    const doc = createYDocument(parsed.document),
      room = "test-import-" + randomUUID(),
      epoch = randomUUID();
    try {
      db.exec("BEGIN IMMEDIATE");
      try {
        for (const a of stored)
          db.prepare("INSERT INTO assets VALUES (?,?,?)").run(
            a.id,
            a.mime,
            a.bytes,
          );
        // Server-generated IDs only; never accepts a target room or replaces an existing baseline.
        db.prepare("INSERT INTO rooms VALUES (?,?,?,?)").run(
          room,
          epoch,
          0,
          Y.encodeStateAsUpdate(doc),
        );
        db.exec("COMMIT");
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    } finally {
      doc.destroy();
    }
    reply(201, { room, issues: parsed.issues });
  } catch (e) {
    if (!res.destroyed && !res.writableEnded)
      reply(400, { error: e instanceof Error ? e.message : "PPTX 上传失败" });
  }
}
