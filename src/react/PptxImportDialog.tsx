import { useEffect, useRef, useState } from "react";
import {
  validatePptxFile,
  type PresentationImportContext,
} from "../file-exchange";

export function PptxImportDialog({
  onImport,
  onClose,
  disabled = false,
}: {
  onImport: (file: File, context: PresentationImportContext) => Promise<void>;
  onClose: () => void;
  disabled?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    input = useRef<HTMLInputElement>(null),
    task = useRef<AbortController | null>(null);
  const [file, setFile] = useState<File | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [over, setOver] = useState(false);
  useEffect(() => {
    dialog.current?.showModal();
    return () => task.current?.abort();
  }, []);
  useEffect(() => {
    if (disabled) {
      task.current?.abort();
      onClose();
    }
  }, [disabled]);
  function choose(next?: File) {
    if (!next || busy) return;
    try {
      validatePptxFile(next);
      setFile(next);
      setError("");
    } catch (e) {
      setFile(null);
      setError((e as Error).message);
    }
  }
  function cancel() {
    task.current?.abort();
    onClose();
  }
  async function submit() {
    if (!file || busy || disabled) return;
    const request = new AbortController();
    task.current = request;
    setBusy(true);
    setError("");
    try {
      await onImport(file, { signal: request.signal });
      if (!request.signal.aborted) onClose();
    } catch (e) {
      if (!request.signal.aborted)
        setError(e instanceof Error ? e.message : "上传失败，请重试。");
    } finally {
      if (!request.signal.aborted) {
        setBusy(false);
        task.current = null;
      }
    }
  }
  return (
    <dialog
      ref={dialog}
      className="eppt-import-dialog"
      aria-labelledby="eppt-import-title"
      onCancel={(e) => {
        e.preventDefault();
        cancel();
      }}
    >
      <header>
        <h2 id="eppt-import-title">上传 PPTX</h2>
        <button aria-label="关闭上传窗口" onClick={cancel}>
          ×
        </button>
      </header>
      <p>
        上传后创建独立文稿，不覆盖当前内容。文字、图形、表格和支持的图表可继续编辑；复杂效果可能简化，并提供兼容性报告。
      </p>
      <div
        className={"eppt-import-drop " + (over ? "is-over" : "")}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          if (e.dataTransfer.files.length > 1) {
            setError("每次请选择一个 PPTX 文件。");
            return;
          }
          choose(e.dataTransfer.files[0]);
        }}
      >
        <span aria-hidden="true">↑</span>
        <strong>{file ? file.name : "将 PPTX 文件拖到这里"}</strong>
        <small>
          {file
            ? `${(file.size / 1024 / 1024).toFixed(2)} MB`
            : "仅支持 .pptx，最大 30 MB"}
        </small>
        <button
          disabled={busy || disabled}
          onClick={() => input.current?.click()}
        >
          {file ? "重新选择文件" : "选择 PPTX 文件"}
        </button>
        <input
          ref={input}
          hidden
          type="file"
          aria-label="PPTX 文件"
          accept=".pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation"
          onChange={(e) => {
            choose(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </div>
      {error && (
        <p role="alert" className="eppt-import-error">
          {error}
        </p>
      )}
      {busy && <p role="status">正在上传并解析文件，请稍候…</p>}
      <footer>
        <button onClick={cancel}>{busy ? "取消上传" : "取消"}</button>
        <button
          className="eppt-primary"
          disabled={!file || busy || disabled}
          onClick={() => void submit()}
        >
          {busy ? "正在导入…" : "上传并打开"}
        </button>
      </footer>
    </dialog>
  );
}
