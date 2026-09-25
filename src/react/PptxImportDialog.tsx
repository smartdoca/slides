import { useEffect, useRef, useState } from "react";
import { displayMessage, useT } from "../i18n";
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
  const t = useT();
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
        setError(e instanceof Error ? e.message : "import.failed");
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
        <h2 id="eppt-import-title">{t("import.title")}</h2>
        <button aria-label={t("import.close")} onClick={cancel}>
          ×
        </button>
      </header>
      <p>{t("import.intro")}</p>
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
            setError("import.oneFile");
            return;
          }
          choose(e.dataTransfer.files[0]);
        }}
      >
        <span aria-hidden="true">↑</span>
        <strong>{file ? file.name : t("import.drop")}</strong>
        <small>
          {file
            ? `${(file.size / 1024 / 1024).toFixed(2)} MB`
            : t("import.limit")}
        </small>
        <button
          disabled={busy || disabled}
          onClick={() => input.current?.click()}
        >
          {file ? t("import.rechoose") : t("import.choose")}
        </button>
        <input
          ref={input}
          hidden
          type="file"
          aria-label={t("import.file")}
          accept=".pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation"
          onChange={(e) => {
            choose(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </div>
      {error && (
        <p role="alert" className="eppt-import-error">
          {displayMessage(t, error)}
        </p>
      )}
      {busy && <p role="status">{t("import.busy")}</p>}
      <footer>
        <button onClick={cancel}>
          {busy ? t("import.cancelUpload") : t("import.cancel")}
        </button>
        <button
          className="eppt-primary"
          disabled={!file || busy || disabled}
          onClick={() => void submit()}
        >
          {busy ? t("import.importing") : t("import.open")}
        </button>
      </footer>
    </dialog>
  );
}
