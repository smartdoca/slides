import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import * as Y from "yjs";
import {
  CollaborationSession,
  EditorController,
  WebSocketTransport,
  PresentationWorkspace,
  readDocument,
  exportPptx,
  pptxFilename,
  validatePptxFile,
  PPTX_MIME,
  type PresentationPresence,
  type PresentationResources,
  type ConnectionState,
  type SaveState,
} from "../src";
import "../src/react/styles.css";

document.body.style.margin = "0";
function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
async function dataUrl(id: string) {
  const response = await fetch("/eppt-assets/" + encodeURIComponent(id));
  if (!response.ok) throw new Error("图片资源读取失败");
  const blob = await response.blob();
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
const resources: PresentationResources = {
  resolveUrl: (id) => "/eppt-assets/" + encodeURIComponent(id),
  async uploadImage(file, { signal }) {
    const response = await fetch("/eppt-assets", {
      method: "POST",
      headers: { "Content-Type": file.type },
      body: file,
      signal,
    });
    if (!response.ok) throw new Error(await response.text());
    const { id } = await response.json();
    const image = await createImageBitmap(file);
    const result = { id, width: image.width, height: image.height };
    image.close();
    return result;
  },
};
function Demo() {
  const [roomName, setRoomName] = useState(
    new URLSearchParams(location.search).get("room") ?? "demo",
  );
  const [document, setDocument] = useState(() => new Y.Doc());
  const [connection, setConnection] = useState<ConnectionState>("loading");
  const [saved, setSaved] = useState<SaveState>("clean");
  const [error, setError] = useState("");
  const [members, setMembers] = useState<PresentationPresence[]>([]);
  const [notice, setNotice] = useState<string[]>([]);
  const session = useRef<CollaborationSession | null>(null);
  const transport = useMemo(
    () =>
      new WebSocketTransport(
        `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/eppt-sync${location.search.includes("readonly") ? "?readonly=1" : ""}`,
      ),
    [],
  );
  const lastPresence = useRef<number>(0);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (session.current?.outbox.dirty) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);
  useEffect(() => {
    const next = new CollaborationSession({
      room: roomName,
      schemaVersion: 2,
      document,
      transport,
      onConnectionChange: setConnection,
      onSaveStateChange: setSaved,
      onPresence: setMembers,
      onError: (e) => setError(e.message),
    });
    session.current = next;
    next.connect();
    const interval = setInterval(() => {
      if (next.state === "disconnected") next.reconnect();
    }, 2000);
    return () => {
      clearInterval(interval);
      next.dispose();
      session.current = null;
    };
  }, [document, roomName, transport]);
  const presence = useCallback(
    (slideId: string, ids: string[]) => {
      const identity = session.current?.identity;
      if (!identity || session.current?.state !== "ready") return;
      const now = Date.now();
      if (ids.length && now - lastPresence.current < 100) return;
      lastPresence.current = now;
      transport.send({
        type: "presence",
        room: roomName,
        presence: ids.length
          ? {
              ...identity,
              slideId,
              selection: { elementIds: ids, editing: false },
            }
          : null,
      });
    },
    [transport, roomName],
  );
  const ready = !!readDocument(document).size;
  return (
    <>
      {error ? (
        <div
          role="alert"
          style={{
            padding: "10px 24px",
            background: "#fff1d8",
            font: "13px sans-serif",
          }}
        >
          {error} <button onClick={() => setError("")}>关闭</button>
        </div>
      ) : null}
      {notice.length ? (
        <dialog
          open
          style={{
            position: "fixed",
            zIndex: 3000,
            top: 80,
            width: 650,
            maxHeight: "70vh",
            overflow: "auto",
            border: "1px solid #dce2eb",
            borderRadius: 12,
            padding: 24,
            font: "14px/1.7 sans-serif",
          }}
        >
          <h3>文件兼容性报告</h3>
          <ul>
            {notice.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
          <button onClick={() => setNotice([])}>我知道了</button>
        </dialog>
      ) : null}
      {ready ? (
        <PresentationWorkspace
          chrome="demo"
          onTitleChange={(title) => {
            const controller = new EditorController(document);
            controller.title(title);
            controller.dispose();
          }}
          onExportPng={({ blob, filename }) => download(blob, filename)}
          key={document.guid}
          document={document}
          readOnly={
            connection !== "ready" || location.search.includes("readonly")
          }
          resources={resources}
          members={members}
          sessionId={session.current?.identity?.sessionId}
          status={
            connection === "ready"
              ? "已连接"
              : connection === "disconnected"
                ? "正在重连"
                : connection
          }
          saveLabel={
            saved === "clean" && connection === "ready"
              ? "已保存到本地演示服务器"
              : saved === "saving"
                ? "正在保存…"
                : saved === "dirty"
                  ? "有待确认的更改"
                  : "连接中…"
          }
          onReconnect={() => session.current?.reconnect()}
          onPresence={presence}
          onExport={async (format) => {
            const value = readDocument(document);
            if (format === "json")
              download(
                new Blob([JSON.stringify(value, null, 2)], {
                  type: "application/json",
                }),
                value.title + ".json",
              );
            else if (format === "pdf") window.print();
            else {
              const output = await exportPptx(value, dataUrl);
              download(output.blob, pptxFilename(value.title));
              if (output.issues.length)
                setNotice(output.issues.map((i) => i.message));
            }
          }}
          onImport={async (file, { signal }) => {
            validatePptxFile(file);
            const source = session.current;
            if (
              !source?.identity ||
              source.state !== "ready" ||
              location.search.includes("readonly")
            )
              throw new Error("当前无法上传，请连接后重试。");
            if (source.outbox.dirty)
              throw new Error(
                "当前文稿还有未确认的修改，请等待保存完成后再上传。",
              );
            const response = await fetch("/eppt-import", {
              method: "POST",
              headers: {
                "Content-Type": PPTX_MIME,
                "X-EPPT-Filename": encodeURIComponent(file.name),
                "X-EPPT-Session": source.identity.sessionId,
              },
              body: file,
              signal,
            });
            const result = await response.json();
            if (!response.ok)
              throw new Error(result.error ?? "PPTX 上传失败，请重试。");
            signal.throwIfAborted();
            if (source !== session.current)
              throw new Error("文稿已切换，未打开迟到的导入结果。");
            if (source.outbox.dirty)
              throw new Error(
                `原文稿仍有待确认修改，未切换。上传副本已保存：?room=${result.room}`,
              );
            setNotice(result.issues.map((i: { message: string }) => i.message));
            const url = new URL(location.href);
            url.searchParams.set("room", result.room);
            history.replaceState(null, "", url);
            setConnection("loading");
            setSaved("clean");
            setMembers([]);
            setError("");
            setRoomName(result.room);
            // A new empty client receives the server's authoritative persisted baseline.
            setDocument(new Y.Doc());
          }}
        />
      ) : (
        <main style={{ padding: 60, fontFamily: "sans-serif" }}>
          <h2>正在打开演示文稿…</h2>
          <p>首次加载正在与本地协同服务建立连接。</p>
          <button onClick={() => session.current?.reconnect()}>重新连接</button>
        </main>
      )}
    </>
  );
}
const root =
  import.meta.hot?.data.root ?? createRoot(document.getElementById("root")!);
root.render(<Demo />);
if (import.meta.hot)
  import.meta.hot.dispose((data) => {
    data.root = root;
  });
