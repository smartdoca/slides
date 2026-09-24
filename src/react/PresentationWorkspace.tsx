import {
  forwardRef,
  useImperativeHandle,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Editor, Transforms, Element as SlateElement } from "slate";
import { flushSync } from "react-dom";
import type * as Y from "yjs";
import { YjsEditor } from "@slate-yjs/core";
import { EditorController } from "../model/controller";
import { createId } from "../model/create";
import {
  emuToPx,
  pxToEmu,
  type TextLeaf,
  type SlideElement,
} from "../model/types";
import {
  PresentationEditor,
  usePresentation,
  type PresentationEditorHandle,
} from "./PresentationEditor";
import { SlidePreview } from "./SlidePreview";
import { CommitInput } from "./CommitInput";
import { CommitTextarea } from "./CommitTextarea";
import { ImageCropDialog } from "./ImageCropDialog";
import { InsertPalette, ToolIcon } from "./InsertPalette";
import { SlideRail } from "./SlideRail";
import { TextFormatPanel } from "./TextFormatPanel";
import { runTextCommand } from "./text-commands";
import type { TextParagraph } from "../model/types";
import { presentationOrder } from "../model/slides";
import { FloatingToolbar } from "./FloatingToolbar";
import { CommentPin } from "./CommentPin";
import { LayoutPicker } from "./LayoutPicker";
import { createSlideLayout, type LayoutKind } from "../model/layouts";
import { ChartDataEditor } from "./ChartDataEditor";
import { ColorPicker } from "./ColorPicker";
import { ElementMenu } from "./ElementMenu";
import { SHAPES } from "../model/shapes";
import { ChartOptions } from "./ChartOptions";
import { PptxImportDialog } from "./PptxImportDialog";
import type { PresentationImportContext } from "../file-exchange";
import type { PresentationPresence } from "../collaboration/transport";
import {
  captureAnchor,
  resolveAnchor,
  commentCandidates,
  type CommentAnchor,
  type CommentMarker,
} from "../model/anchors";
import type { EditorSelection } from "../model/types";
import { readDocument } from "../collaboration/yjs-codec";

export interface PresentationResources {
  uploadImage(
    file: File,
    context: { signal: AbortSignal },
  ): Promise<{ id: string; width: number; height: number }>;
  resolveUrl(id: string): string;
}
export interface PresentationWorkspaceProps {
  /** Embedded by default; demo chrome is opt-in and has no business authority. */
  chrome?: "embedded" | "demo";
  onTitleChange?: (title: string) => void;
  panels?: { slides?: boolean; properties?: boolean; notes?: boolean };
  onPanelsChange?: (panels: {
    slides: boolean;
    properties: boolean;
    notes: boolean;
  }) => void;
  presentation?: boolean;
  onPresentationChange?: (value: boolean) => void;
  onSelectionChange?: (selection: EditorSelection) => void;
  renderCommentAction?: (anchor: CommentAnchor) => ReactNode;
  commentMarkers?: CommentMarker[];
  onCommentAnchorClick?: (candidates: CommentMarker[]) => void;
  onExportPng?: (result: {
    blob: Blob;
    filename: string;
    mime: "image/png";
  }) => void | Promise<void>;
  document: Y.Doc;
  readOnly?: boolean;
  resources?: PresentationResources;
  saveLabel?: string;
  status?: string;
  members?: PresentationPresence[];
  sessionId?: string;
  onPresence?: (slideId: string, ids: string[]) => void;
  onExport?: (format: "pptx" | "json" | "pdf") => Promise<void> | void;
  onImport?: (file: File, context: PresentationImportContext) => Promise<void>;
  onReconnect?: () => void;
}
export interface PresentationWorkspaceHandle {
  getSelection(): EditorSelection;
  captureAnchor(): CommentAnchor | null;
  revealAnchor(anchor: CommentAnchor): boolean;
  setPresentation(value: boolean): void;
  setPanels(value: {
    slides?: boolean;
    properties?: boolean;
    notes?: boolean;
  }): void;
  exportCurrentPng(): Promise<Blob>;
  /** Host explicitly completes the native edit before taking an export snapshot. */
  commitTextEdit(): void;
}
export const PresentationWorkspace = forwardRef<
  PresentationWorkspaceHandle,
  PresentationWorkspaceProps
>(function PresentationWorkspace(props, ref) {
  const value = usePresentation(props.document);
  const [printing, setPrinting] = useState(false);
  useEffect(() => {
    // display:none does not avoid rendering thousands of hidden slide elements.
    const before = () => flushSync(() => setPrinting(true));
    const after = () => setPrinting(false);
    window.addEventListener("beforeprint", before);
    window.addEventListener("afterprint", after);
    return () => {
      window.removeEventListener("beforeprint", before);
      window.removeEventListener("afterprint", after);
    };
  }, []);
  const controller = useMemo(
    () => new EditorController(props.document),
    [props.document],
  );
  const [active, setActive] = useState(value.slideOrder[0]);
  const [selected, setSelected] = useState<string[]>([]);
  const [zoom, setZoom] = useState<number | "fit">("fit");
  const [available, setAvailable] = useState({ width: 900, height: 650 });
  const [localPresenting, setLocalPresenting] = useState(false);
  const presenting = props.presentation ?? localPresenting;
  const setPresenting = (next: boolean) => {
    setLocalPresenting(next);
    props.onPresentationChange?.(next);
  };
  const [step, setStep] = useState(0);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [cropping, setCropping] = useState<{
    slideId: string;
    id: string;
  } | null>(null);
  const [textEditor, setTextEditor] = useState<Editor | null>(null);
  const [, refreshFormat] = useState(0);
  const [tab, setTab] = useState("插入");
  const [localProperties, setLocalProperties] = useState(false);
  const [localRail, setLocalRail] = useState(false);
  const [pageToolsContainer, setPageToolsContainer] = useState<HTMLDivElement | null>(null);
  const [localNotes, setLocalNotes] = useState(true);
  const showProperties = props.panels?.properties ?? localProperties;
  const railCollapsed = !(props.panels?.slides ?? !localRail);
  const showNotes = props.panels?.notes ?? localNotes;
  const setPanels = (next: {
    slides?: boolean;
    properties?: boolean;
    notes?: boolean;
  }) => {
    const panels = {
      slides: !railCollapsed,
      properties: showProperties,
      notes: showNotes,
      ...next,
    };
    setLocalRail(!panels.slides);
    setLocalProperties(panels.properties);
    setLocalNotes(panels.notes);
    props.onPanelsChange?.(panels);
  };
  const setShowProperties = (next: boolean) => setPanels({ properties: next });
  const setRailCollapsed = (next: boolean) => setPanels({ slides: !next });
  const [notesHeight, setNotesHeight] = useState(48);
  const [canvasInteracting, setCanvasInteracting] = useState(false);
  const [snapping, setSnapping] = useState(true);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    ids: string[];
  } | null>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const stageFrame = useRef<HTMLDivElement>(null);
  const editorHandle = useRef<PresentationEditorHandle>(null);
  const imageInput = useRef<HTMLInputElement>(null);
  const workspace = useRef<HTMLDivElement>(null);
  const presentationRoot = useRef<HTMLDivElement>(null);
  const aborts = useRef(new Set<AbortController>());
  const clipboard = useRef<SlideElement[]>([]);
  const mode = useRef(props.readOnly);
  mode.current = props.readOnly || presenting;
  controller.setReadOnly(!!props.readOnly || presenting);
  const slideId = value.slides[active] ? active : value.slideOrder[0];
  const slide = value.slides[slideId];
  const showOrder = presentationOrder(value);
  const element =
    selected.length === 1 ? slide?.elements[selected[0]] : undefined;
  const size = {
    width: emuToPx(value.size.width),
    height: emuToPx(value.size.height),
  };
  const fit = Math.min(
    (available.width - 64) / size.width,
    (available.height - 64) / size.height,
  );
  const scale = zoom === "fit" ? Math.max(0.15, Math.min(1.5, fit)) : zoom;
  const disabled = !!props.readOnly || busy || presenting;
  const cropTarget = cropping
    ? value.slides[cropping.slideId]?.elements[cropping.id]
    : undefined;
  useEffect(() => {
    setCropping(null);
    setContextMenu(null);
  }, [props.readOnly, props.document, slideId]);
  const runAsync = async (action: () => Promise<void> | void) => {
    setBusy(true);
    setMessage("");
    try {
      await action();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };
  const downloadPptx = () =>
    runAsync(async () => {
      if (!props.onExport) return;
      if (textEditor && YjsEditor.isYjsEditor(textEditor))
        YjsEditor.flushLocalChanges(textEditor);
      await props.onExport("pptx");
      setMessage("PPTX 已生成，请查看浏览器下载。");
    });
  const select = (ids: string[]) => {
    const expanded = controller.expandSelection(slideId, ids);
    setSelected(expanded);
    props.onSelectionChange?.(
      expanded.length
        ? { type: "elements", slideId, elementIds: expanded }
        : null,
    );
    if (!props.readOnly && !presenting) props.onPresence?.(slideId, expanded);
  };
  const switchSlide = (id: string) => {
    setActive(id);
    setSelected([]);
    setStep(0);
    props.onSelectionChange?.(null);
    if (!props.readOnly && !presenting) props.onPresence?.(id, []);
  };
  const selection: EditorSelection = selected.length
    ? {
        type: "elements",
        slideId,
        elementIds: selected.filter((id) => slide?.elements[id]),
      }
    : null;
  const commentAnchor = captureAnchor(selection);
  useImperativeHandle(ref, () => ({
    getSelection: () => selection,
    captureAnchor: () => captureAnchor(selection),
    revealAnchor: (anchor) => {
      const resolved = resolveAnchor(props.document, anchor);
      if (!resolved) return false;
      setActive(resolved.slideId);
      setSelected(
        ("elementIds" in resolved
          ? (resolved.elementIds ?? [])
          : "elementId" in resolved
            ? [resolved.elementId]
            : []
        ).filter((id): id is string => !!id),
      );
      setZoom("fit");
      return true;
    },
    setPresentation: setPresenting,
    setPanels,
    commitTextEdit: () => {
      if (textEditor && YjsEditor.isYjsEditor(textEditor))
        YjsEditor.flushLocalChanges(textEditor);
      editorHandle.current?.finishTextEdit();
    },
    exportCurrentPng: async () => {
      if (!editorHandle.current) throw new Error("当前幻灯片尚未就绪");
      return editorHandle.current.exportPng();
    },
  }));
  const openElementMenu = ({
    elementId,
    x,
    y,
  }: {
    elementId: string;
    x: number;
    y: number;
  }) => {
    const ids = selected.includes(elementId)
      ? selected
      : controller.expandSelection(slideId, [elementId]);
    select(ids);
    setContextMenu({ x, y, ids });
  };
  const insertLayout = (kind: LayoutKind, dark: boolean) => {
    if (disabled) return;
    switchSlide(
      controller.addSlide(slideId, createSlideLayout(kind, value.size, dark)),
    );
  };
  const add = (kind: Parameters<EditorController["add"]>[1]) => {
    if (slide) select([controller.add(slideId, kind)]);
  };
  const format = (marks: Omit<TextLeaf, "text">) => {
    if (disabled) return;
    if (textEditor)
      runTextCommand(textEditor, controller, () => {
        for (const [key, val] of Object.entries(marks)) Editor.addMark(textEditor, key, val);
      });
    else controller.formatText(slideId, selected, marks);
    refreshFormat((n) => n + 1);
  };
  const marks = textEditor
    ? (Editor.marks(textEditor) as TextLeaf | null)
    : element?.type === "text"
      ? element.paragraphs[0]?.children[0]
      : null;
  const paragraphFormat = (format: Partial<Omit<TextParagraph, "type" | "children">>) => {
    if (disabled) return;
    if (textEditor)
      runTextCommand(textEditor, controller, () => {
        Transforms.setNodes(textEditor, format as Partial<SlateElement>, { match: (n) => SlateElement.isElement(n) });
      });
    else controller.paragraphFormat(slideId, selected, format);
    refreshFormat((n) => n + 1);
  };
  useEffect(
    () => () => {
      controller.dispose();
      aborts.current.forEach((a) => a.abort());
    },
    [controller],
  );
  useEffect(() => {
    if (!viewport.current) return;
    const observer = new ResizeObserver(([entry]) =>
      setAvailable({
        width: (entry.target as HTMLElement).clientWidth,
        height: (entry.target as HTMLElement).clientHeight,
      }),
    );
    observer.observe(viewport.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (props.readOnly) {
      setSelected([]);
      setTextEditor(null);
      aborts.current.forEach((a) => a.abort());
      props.onPresence?.(slideId, []);
    }
  }, [props.readOnly]);
  useEffect(() => {
    const blur = () => props.onPresence?.(slideId, []);
    window.addEventListener("blur", blur);
    return () => window.removeEventListener("blur", blur);
  }, [slideId, props.onPresence]);
  function next() {
    const count =
      slide?.elementOrder.filter((id) => slide.elements[id].animation).length ??
      0;
    if (step < count) setStep(step + 1);
    else {
      const index = showOrder.indexOf(slideId);
      if (index < showOrder.length - 1)
        switchSlide(showOrder[index + 1]);
    }
  }
  const previousPresentedSlide = () => {
    if (showOrder.length) switchSlide(showOrder[Math.max(0, showOrder.indexOf(slideId) - 1)]);
  };
  useEffect(() => {
    if (!presenting) return;
    if (!showOrder.length) {
      setPresenting(false);
      setMessage("所有幻灯片均已隐藏，请先取消隐藏再放映。");
    } else if (!showOrder.includes(slideId)) {
      const index = value.slideOrder.indexOf(slideId);
      switchSlide(showOrder.find(id => value.slideOrder.indexOf(id) >= index) ?? showOrder[0]);
    }
  }, [presenting, slideId, JSON.stringify(showOrder)]);
  useEffect(() => {
    if (!presenting || !slide) return;
    const animations = slide.elementOrder
      .map((id) => slide.elements[id].animation)
      .filter(Boolean);
    if (animations[step]?.trigger !== "after-previous") return;
    const timer = setTimeout(
      () => setStep((n) => n + 1),
      step ? (animations[step - 1]?.duration ?? 0.5) * 1000 : 0,
    );
    return () => clearTimeout(timer);
  }, [presenting, step, slide]);
  useEffect(() => {
    if (!presenting) return;
    props.onPresence?.(slideId, []);
    presentationRoot.current?.focus();
    const presentedNode = presentationRoot.current;
    const previousFocus = workspace.current;
    let enteredFullscreen = false;
    const changed = () => {
      if (window.document.fullscreenElement === presentationRoot.current)
        enteredFullscreen = true;
      else if (enteredFullscreen) setPresenting(false);
    };
    window.document.addEventListener("fullscreenchange", changed);
    return () => {
      window.document.removeEventListener("fullscreenchange", changed);
      if (presentedNode && window.document.fullscreenElement === presentedNode)
        void window.document.exitFullscreen().catch(() => {});
      previousFocus?.focus({ preventScroll: true });
    };
  }, [presenting]);
  async function upload(file: File) {
    if (!props.resources || disabled || !slide) return;
    const target = slideId;
    const cancel = new AbortController();
    aborts.current.add(cancel);
    try {
      const asset = await props.resources.uploadImage(file, {
        signal: cancel.signal,
      });
      if (cancel.signal.aborted || mode.current) return;
      if (!readDocument(controller.doc).slideOrder.includes(target))
        throw new Error("目标幻灯片已删除，未插入迟到的图片。");
      const width = Math.min(600, asset.width),
        height = (width * asset.height) / asset.width;
      const id = createId("image");
      controller.insert(target, {
        id,
        type: "image",
        assetId: asset.id,
        alt: file.name,
        transform: {
          x: pxToEmu(160),
          y: pxToEmu(140),
          width: pxToEmu(width),
          height: pxToEmu(height),
          rotation: 0,
        },
      });
      select([id]);
    } finally {
      aborts.current.delete(cancel);
    }
  }
  return (
    <div
      className={
        "eppt-workspace " +
        (props.chrome === "demo" ? "eppt-demo-chrome" : "eppt-embedded")
      }
      ref={workspace}
      onKeyDown={(e) => {
        const target = e.target as HTMLElement;
        if (
          target.closest(".eppt-slides") &&
          !disabled &&
          (e.ctrlKey || e.metaKey) &&
          e.key.toLowerCase() === "z"
        ) {
          e.preventDefault();
          e.shiftKey ? controller.redo() : controller.undo();
          return;
        }
        if (
          target.closest(
            'input,textarea,select,[contenteditable="true"],.eppt-slides',
          ) ||
          disabled ||
          presenting
        )
          return;
        const modifier = e.ctrlKey || e.metaKey,
          key = e.key.toLowerCase();
        if ((e.shiftKey && key === "f10") || key === "contextmenu") {
          const frame = stageFrame.current?.getBoundingClientRect();
          const el = slide?.elements[selected[0]];
          if (frame && el) {
            e.preventDefault();
            openElementMenu({
              elementId: el.id,
              x: frame.left + emuToPx(el.transform.x) * scale,
              y: frame.top + emuToPx(el.transform.y) * scale,
            });
          }
          return;
        }
        if (modifier && key === "z") {
          e.preventDefault();
          e.shiftKey ? controller.redo() : controller.undo();
        }
        if (modifier && key === "y") {
          e.preventDefault();
          controller.redo();
        }
        if (modifier && key === "a") {
          e.preventDefault();
          select(slide?.elementOrder ?? []);
        }
        if (modifier && key === "d") {
          e.preventDefault();
          select(controller.duplicate(slideId, selected));
        }
        if (modifier && (key === "c" || key === "x")) {
          e.preventDefault();
          clipboard.current = selected.map((id) =>
            structuredClone(slide.elements[id]),
          );
          if (key === "x") controller.remove(slideId, selected);
        }
        if (modifier && key === "v") {
          e.preventDefault();
          select(controller.paste(slideId, clipboard.current));
        }
        if (e.key === "Delete" || e.key === "Backspace") {
          e.preventDefault();
          controller.remove(slideId, selected);
          select([]);
        }
        if (e.key.startsWith("Arrow")) {
          e.preventDefault();
          const d = e.shiftKey ? 10 : 1;
          controller.nudge(
            slideId,
            selected,
            e.key === "ArrowLeft" ? -d : e.key === "ArrowRight" ? d : 0,
            e.key === "ArrowUp" ? -d : e.key === "ArrowDown" ? d : 0,
          );
        }
        if (e.key === "Escape") select([]);
      }}
      tabIndex={-1}
    >
      {props.chrome === "demo" && (
        <header className="eppt-header">
          <div className="eppt-logo">
            e<span>ppt</span>
          </div>
          <div className="eppt-title">
            <CommitInput
              aria-label="文稿标题"
              key={value.id}
              value={value.title}
              onCommit={(title) =>
                props.onTitleChange?.(title || "未命名演示文稿")
              }
              disabled={disabled || !props.onTitleChange}
            />
            <span className="eppt-save">
              <i />
              {props.saveLabel ?? "本地文档"}
            </span>
          </div>
          <nav className="eppt-document-menu" aria-label="文稿菜单">
            {(["文件", "开始", "设计"] as const).map((item) => (
              <button
                key={item}
                aria-pressed={tab === item}
                onClick={() => setTab(tab === item ? "插入" : item)}
              >
                {item === "开始" ? "编辑" : item}
                <span>⌄</span>
              </button>
            ))}
          </nav>
          <div className="eppt-history-actions">
            <button
              aria-label="撤销"
              title="撤销 ⌘ / Ctrl Z"
              disabled={disabled || !controller.history.undoStack.length}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                if (textEditor && YjsEditor.isYjsEditor(textEditor))
                  YjsEditor.flushLocalChanges(textEditor);
                controller.undo();
              }}
            >
              <ToolIcon kind="undo" />
            </button>
            <button
              aria-label="重做"
              title="重做 ⇧⌘Z / Ctrl Y"
              disabled={disabled || !controller.history.redoStack.length}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => controller.redo()}
            >
              <ToolIcon kind="redo" />
            </button>
          </div>
          <div className="eppt-header-actions">
            <div className="eppt-members">
              {(props.members ?? []).map((m) => (
                <span
                  key={m.sessionId}
                  title={m.name}
                  style={{ background: m.color }}
                >
                  {m.name.slice(-1)}
                </span>
              ))}
            </div>
            {props.onReconnect && props.status !== "已连接" ? (
              <button
                onClick={props.onReconnect}
                title="重连并补拉未确认的更新"
              >
                重新连接
              </button>
            ) : null}
            <button
              disabled={disabled || !props.onImport}
              onClick={() => setImportOpen(true)}
            >
              上传 PPTX
            </button>
            <button onClick={downloadPptx} disabled={busy || !props.onExport}>
              {busy ? "正在处理…" : "下载 PPTX"}
            </button>
            <button
              className="eppt-primary"
              onClick={() => {
                setPresenting(true);
                setStep(0);
                select([]);
              }}
              disabled={!slide}
            >
              <ToolIcon kind="present" /> 开始放映
            </button>
          </div>
        </header>
      )}
      <div
        className={
          "eppt-toolbar " +
          (tab === "插入" ? "eppt-ribbon" : "eppt-ribbon-options")
        }
      >
        <LayoutPicker
          disabled={disabled}
          onPick={insertLayout}
          collapsed={railCollapsed}
          onCollapse={() => setRailCollapsed(!railCollapsed)}
        />
        <div className={props.chrome !== "demo" ? "eppt-flat-tools" : "eppt-toolbar-inline"}>
        <div ref={setPageToolsContainer} className="eppt-page-tools" role="group" aria-label="幻灯片操作" />
        {props.chrome !== "demo" && (
          <>
            <button
              className="eppt-present-action" title="开始放映" aria-label="开始放映"
              disabled={!slide}
              onClick={() => {
                setStep(0);
                setSelected([]);
                setPresenting(true);
              }}
            >
              <ToolIcon kind="present" />
            </button>
            <div className="eppt-toolgroup eppt-history-actions" role="group" aria-label="历史操作">
              <button title="撤销 ⌘Z" aria-label="撤销"
                disabled={disabled || !controller.history.undoStack.length}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  if (textEditor && YjsEditor.isYjsEditor(textEditor)) YjsEditor.flushLocalChanges(textEditor);
                  controller.undo();
                }}><ToolIcon kind="undo" /></button>
              <button title="重做 ⇧⌘Z" aria-label="重做"
                disabled={disabled || !controller.history.redoStack.length}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => controller.redo()}><ToolIcon kind="redo" /></button>
            </div>
          </>
        )}
        {tab !== "插入" && (
          <button
            className="eppt-back-tools"
            onClick={() => setTab("插入")}
            title="返回插入工具"
          >
            ‹ 返回
          </button>
        )}
        {tab === "开始" && props.chrome === "demo" ? (
          <div className={props.chrome !== "demo" ? "eppt-toolbar-dropdown" : "eppt-toolbar-inline"} role="group" aria-label="编辑设置">
            <div className="eppt-toolgroup">
              <button
                title="撤销 ⌘Z"
                disabled={disabled || !controller.history.undoStack.length}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  if (textEditor && YjsEditor.isYjsEditor(textEditor))
                    YjsEditor.flushLocalChanges(textEditor);
                  controller.undo();
                }}
              >
                ↶ 撤销
              </button>
              <button
                title="重做 ⇧⌘Z"
                disabled={disabled || !controller.history.redoStack.length}
                onClick={() => controller.redo()}
              >
                ↷
              </button>
            </div>
            <div className="eppt-toolgroup">
              <button
                disabled={disabled}
                onClick={() => switchSlide(controller.addSlide(slideId))}
              >
                ＋ 新建幻灯片
              </button>
              <button
                disabled={disabled || !slide}
                onClick={() => switchSlide(controller.addSlide(slideId, slide))}
              >
                复制页面
              </button>
            </div>
            <div className="eppt-toolgroup">
              <select
                aria-label="字体"
                disabled={disabled}
                value={marks?.fontFamily ?? "Arial"}
                onChange={(e) => format({ fontFamily: e.target.value })}
              >
                {[
                  "Arial",
                  "Microsoft YaHei",
                  "SimSun",
                  "Georgia",
                  "Times New Roman",
                ].map((f) => (
                  <option key={f}>{f}</option>
                ))}
              </select>
              <input
                aria-label="字号"
                type="number"
                min="6"
                max="200"
                value={marks?.fontSize ?? 24}
                onChange={(e) => {
                  const v = +e.target.value;
                  if (v >= 6 && v <= 200) format({ fontSize: v });
                }}
                disabled={disabled}
              />
              {(["bold", "italic", "underline"] as const).map((mark, i) => (
                <button
                  key={mark}
                  title={["加粗", "斜体", "下划线"][i]}
                  disabled={disabled}
                  className={marks?.[mark] ? "active" : ""}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => format({ [mark]: !marks?.[mark] })}
                >
                  {["B", "I", "U"][i]}
                </button>
              ))}
              <input
                aria-label="文字颜色"
                type="color"
                value={marks?.color ?? "#202124"}
                disabled={disabled}
                onChange={(e) => format({ color: e.target.value })}
              />
            </div>
            <div className="eppt-toolgroup">
              <button
                disabled={disabled || !selected.length}
                onClick={() => select(controller.duplicate(slideId, selected))}
              >
                复制元素
              </button>
              <button
                disabled={disabled || !selected.length}
                onClick={() => {
                  controller.remove(slideId, selected);
                  select([]);
                }}
              >
                删除
              </button>
            </div>
          </div>
        ) : null}
        {tab === "插入" ? (
          <>
            <button
              className="eppt-insert-tool"
              disabled={disabled}
              onClick={() => add("text")}
            >
              <ToolIcon kind="text" />
              <span>文本</span>
            </button>
            <InsertPalette
              kind="shape"
              label="图形"
              disabled={disabled}
              items={[...SHAPES, { id: "line", label: "直线", group: "线条" }]}
              onPick={(kind) =>
                add(kind as Parameters<EditorController["add"]>[1])
              }
            />
            <button
              className="eppt-insert-tool"
              disabled={disabled || !props.resources}
              onClick={() => imageInput.current?.click()}
            >
              <ToolIcon kind="image" />
              <span>图片</span>
            </button>
            <InsertPalette
              kind="chart"
              label="图表"
              disabled={disabled}
              items={[
                { id: "bar", label: "柱状图" },
                { id: "bar-stacked", label: "堆积柱状图" },
                { id: "bar-percent", label: "百分比堆积图" },
                { id: "line", label: "折线图", icon: "chartLine" },
                { id: "line-smooth", label: "平滑折线图" },
                { id: "line-step", label: "阶梯折线图" },
                { id: "pie", label: "饼图" },
                { id: "doughnut", label: "环形图" },
              ]}
              onPick={(chartType) => {
                let id = "";
                controller.run(() => {
                  const [type, variant] = chartType.split("-");
                  id = controller.add(
                    slideId,
                    "chart",
                    type as "bar" | "line" | "pie" | "doughnut",
                  );
                  if (variant)
                    controller.patch(
                      slideId,
                      id,
                      type === "bar"
                        ? {
                            stacking: variant,
                            series: [
                              {
                                name: "系列 1",
                                values: [32, 54, 46, 78],
                                color: "#527eff",
                              },
                              {
                                name: "系列 2",
                                values: [48, 36, 62, 52],
                                color: "#ff8a24",
                              },
                            ],
                          }
                        : { curve: variant },
                    );
                });
                select([id]);
                setShowProperties(true);
              }}
            />
            <button
              className="eppt-insert-tool"
              disabled={disabled}
              onClick={() => {
                add("table");
                setShowProperties(false);
              }}
            >
              <ToolIcon kind="table" />
              <span>表格</span>
            </button>
            <button
              className="eppt-insert-tool"
              aria-pressed={showProperties}
              onClick={() => setShowProperties(!showProperties)}
            >
              <ToolIcon kind="format" />
              <span>格式</span>
            </button>
            <button className="eppt-insert-tool" onClick={() => setTab("动画")}>
              <ToolIcon kind="animation" />
              <span>动画</span>
            </button>
          </>
        ) : null}
        {props.chrome !== "demo" || tab === "设计" ? (
          <div className={props.chrome !== "demo" ? "eppt-design-actions" : "eppt-toolbar-inline"} role="group" aria-label="页面设置">
            {props.chrome === "demo" && <label>
              <input
                type="checkbox"
                checked={snapping}
                onChange={(e) => setSnapping(e.target.checked)}
              />{" "}
              对齐吸附与等距参考线
            </label>}
            <label title="页面背景">
              页面背景{" "}
              <input
                type="color"
                aria-label="页面背景"
                value={slide?.background ?? "#ffffff"}
                disabled={disabled || !slide}
                onChange={(e) =>
                  controller.slideProperty(
                    slideId,
                    "background",
                    e.target.value,
                  )
                }
              />
            </label>
            <label title="页面尺寸；改变尺寸保留元素原位置，可撤销">
              页面尺寸{" "}
              <select
                aria-label="页面尺寸"
                disabled={disabled}
                value={
                  size.width === 1280 && size.height === 720
                    ? "wide"
                    : size.width === 960 && size.height === 720
                      ? "standard"
                      : "custom"
                }
                onChange={(e) => {
                  if (e.target.value === "wide") controller.pageSize(1280, 720);
                  if (e.target.value === "standard")
                    controller.pageSize(960, 720);
                }}
              >
                <option value="wide">宽屏 16:9</option>
                <option value="standard">标准 4:3</option>
                <option value="custom" disabled>
                  自定义
                </option>
              </select>
            </label>
            {props.chrome === "demo" && <span className="eppt-muted">
              改变画布尺寸保留元素原位置，可撤销。
            </span>}
          </div>
        ) : null}
        {tab === "动画" ? (
          <>
            <label>
              入场效果{" "}
              <select
                aria-label="入场效果"
                disabled={disabled || !element}
                value={element?.animation?.effect ?? "none"}
                onChange={(e) =>
                  element &&
                  controller.patch(slideId, element.id, {
                    animation:
                      e.target.value === "none"
                        ? undefined
                        : {
                            effect: e.target.value,
                            duration: 0.5,
                            trigger: "on-click",
                          },
                  })
                }
              >
                <option value="none">无动画</option>
                <option value="appear">出现</option>
                <option value="fade">淡入</option>
                <option value="fly">飞入</option>
              </select>
            </label>
            <span className="eppt-muted">
              放映时单击逐个播放；当前动画仅用于网页放映。
            </span>
            {element?.animation ? (
              <>
                <label>
                  开始{" "}
                  <select
                    aria-label="动画开始方式"
                    disabled={disabled}
                    value={element.animation.trigger}
                    onChange={(e) =>
                      controller.patch(slideId, element.id, {
                        animation: { trigger: e.target.value },
                      })
                    }
                  >
                    <option value="on-click">单击时</option>
                    <option value="after-previous">上一动画之后</option>
                  </select>
                </label>
                <label>
                  时长（秒）
                  <input
                    aria-label="动画时长"
                    type="number"
                    min="0.1"
                    max="10"
                    step="0.1"
                    disabled={disabled}
                    value={element.animation.duration}
                    onChange={(e) => {
                      const duration = +e.target.value;
                      if (duration >= 0.1 && duration <= 10)
                        controller.patch(slideId, element.id, {
                          animation: { duration },
                        });
                    }}
                  />
                </label>
              </>
            ) : null}
          </>
        ) : null}
        {tab === "文件" ? (
          <>
            <button
              disabled={disabled || !props.onImport}
              onClick={() => setImportOpen(true)}
            >
              从 PPTX 文件导入
            </button>
            <button disabled={busy || !props.onExport} onClick={downloadPptx}>
              另存为 PPTX
            </button>
            <button
              disabled={!props.onExport}
              onClick={() => runAsync(() => props.onExport?.("pdf"))}
            >
              打印 / 存为 PDF
            </button>
            <span className="eppt-muted">
              导入会打开新文档，原协作文档保留。
            </span>
          </>
        ) : null}
        {tab === "文件" ? (
          <button
            disabled={busy || !props.onExportPng}
            onClick={() =>
              runAsync(async () => {
                if (textEditor && YjsEditor.isYjsEditor(textEditor))
                  YjsEditor.flushLocalChanges(textEditor);
                const blob = await editorHandle.current?.exportPng();
                if (!blob) throw new Error("当前幻灯片尚未就绪");
                await props.onExportPng?.({
                  blob,
                  filename: value.title + ".png",
                  mime: "image/png",
                });
                setMessage(
                  `PNG 已生成（${Math.ceil(blob.size / 1024)} KB），请查看浏览器下载。`,
                );
              })
            }
          >
            当前页 PNG
          </button>
        ) : null}
        <div className="eppt-zoom-control">
          <button onClick={() => setZoom(Math.max(0.25, scale - 0.1))}>
            −
          </button>
          <select
            aria-label="缩放"
            value={zoom}
            onChange={(e) =>
              setZoom(e.target.value === "fit" ? "fit" : Number(e.target.value))
            }
          >
            <option value="fit">{Math.round(scale * 100)}% · 适应</option>
            {typeof zoom === "number" &&
            ![0.25, 0.5, 0.75, 1, 1.5, 2].includes(zoom) ? (
              <option value={zoom}>{Math.round(zoom * 100)}%</option>
            ) : null}
            {[0.25, 0.5, 0.75, 1, 1.5, 2].map((n) => (
              <option value={n} key={n}>
                {n * 100}%
              </option>
            ))}
          </select>
          <button onClick={() => setZoom(Math.min(2, scale + 0.1))}>＋</button>
        </div>
        </div>
      </div>
      <input
        hidden
        type="file"
        ref={imageInput}
        accept="image/png,image/jpeg,image/gif,image/webp"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) runAsync(() => upload(file));
          e.target.value = "";
        }}
      />
      {importOpen && props.onImport && (
        <PptxImportDialog
          onImport={props.onImport}
          disabled={disabled}
          onClose={() => setImportOpen(false)}
        />
      )}
      {message ? (
        <div className="eppt-alert" role="alert">
          {message}
          <button onClick={() => setMessage("")}>关闭</button>
        </div>
      ) : null}
      <div className="eppt-body">
        <SlideRail
          value={value}
          active={slideId}
          disabled={disabled}
          controller={controller}
          select={switchSlide}
          resolveAsset={props.resources?.resolveUrl}
          collapsed={railCollapsed}
          toolbarContainer={pageToolsContainer}
          onReveal={() => setRailCollapsed(false)}
        />
        <main className="eppt-main">
          <div
            className="eppt-canvas-area"
            ref={viewport}
            onPointerDown={() =>
              viewport.current
                ?.closest<HTMLElement>(".eppt-workspace")
                ?.focus({ preventScroll: true })
            }
          >
            {commentAnchor &&
              props.renderCommentAction &&
              !presenting &&
              (props.readOnly ||
                (element?.type !== "table" && tab !== "插入")) && (
                <FloatingToolbar
                  frame={stageFrame}
                  viewport={viewport}
                  elements={selected
                    .map((id) => slide?.elements[id])
                    .filter((el): el is SlideElement => !!el)}
                  scale={scale}
                  interacting={canvasInteracting}
                  getTransform={(id) => editorHandle.current?.getElementTransform?.(id)}
                >
                  {props.renderCommentAction(commentAnchor)}
                </FloatingToolbar>
              )}
            {!!selected.length &&
              !props.readOnly &&
              element?.type !== "table" && (
                <FloatingToolbar
                  frame={stageFrame}
                  viewport={viewport}
                  elements={selected
                    .map((id) => slide?.elements[id])
                    .filter((el): el is SlideElement => !!el)}
                  scale={scale}
                  hidden={tab !== "插入" || presenting}
                  interacting={canvasInteracting}
                  getTransform={(id) => editorHandle.current?.getElementTransform?.(id)}
                >
                  {element?.type === "text" ? (
                    <>
                      <select
                        aria-label="快捷字体"
                        value={marks?.fontFamily ?? "Arial"}
                        onChange={(e) => format({ fontFamily: e.target.value })}
                        disabled={disabled}
                      >
                        {["Arial", "Microsoft YaHei", "SimSun", "Georgia"].map(
                          (font) => (
                            <option key={font}>{font}</option>
                          ),
                        )}
                      </select>
                      <CommitInput
                        aria-label="快捷字号"
                        type="number"
                        min="6"
                        max="200"
                        value={String(marks?.fontSize ?? 24)}
                        disabled={disabled}
                        onCommit={(value) => {
                          const n = +value;
                          if (n >= 6 && n <= 200) format({ fontSize: n });
                        }}
                      />
                      {(["bold", "italic", "underline"] as const).map(
                        (mark, i) => (
                          <button
                            key={mark}
                            aria-label={["加粗", "斜体", "下划线"][i]}
                            aria-pressed={!!marks?.[mark]}
                            className={marks?.[mark] ? "active" : ""}
                            disabled={disabled}
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => format({ [mark]: !marks?.[mark] })}
                          >
                            {["B", "I", "U"][i]}
                          </button>
                        ),
                      )}
                      <ColorPicker
                        label="文字颜色"
                        value={marks?.color ?? element.fill ?? "#202124"}
                        disabled={disabled}
                        onChange={(color) => format({ color })}
                      />
                      <ColorPicker
                        label="文字高亮"
                        value={marks?.backgroundColor}
                        clearable
                        disabled={disabled}
                        onChange={(backgroundColor) =>
                          format({
                            backgroundColor: backgroundColor ?? "transparent",
                          })
                        }
                      />
                      <ColorPicker
                        label="文本框背景"
                        value={element.background}
                        clearable
                        disabled={disabled}
                        onChange={(background) =>
                          controller.patch(slideId, element.id, { background })
                        }
                      />
                      <select
                        aria-label="快捷段落对齐"
                        disabled={disabled}
                        value={element.paragraphs[0]?.align ?? "left"}
                        onChange={(e) =>
                          paragraphFormat({
                            align: e.target.value as
                              "left" | "center" | "right",
                          })
                        }
                      >
                        <option value="left">左对齐</option>
                        <option value="center">居中</option>
                        <option value="right">右对齐</option>
                      </select>
                    </>
                  ) : element?.type === "image" ? (
                    <>
                      <button
                        disabled={disabled || !props.resources}
                        onClick={() => setCropping({ slideId, id: element.id })}
                      >
                        裁剪图片
                      </button>
                      <button
                        disabled={disabled}
                        onClick={() =>
                          controller.patch(slideId, element.id, {
                            transform: { flipH: !element.transform.flipH },
                          })
                        }
                      >
                        水平翻转
                      </button>
                    </>
                  ) : (
                    <span>
                      {selected.length > 1
                        ? `已选择 ${selected.length} 个对象`
                        : element?.type === "chart"
                          ? "图表"
                          : "形状与对象"}
                    </span>
                  )}
                  <button
                    aria-pressed={showProperties}
                    onClick={() => setShowProperties(!showProperties)}
                  >
                    {showProperties ? "收起格式" : "更多格式"}
                  </button>
                  {commentAnchor && props.renderCommentAction?.(commentAnchor)}
                </FloatingToolbar>
              )}
            <span className="eppt-slide-label">
              {slide
                ? `幻灯片 ${value.slideOrder.indexOf(slideId) + 1}`
                : "空演示文稿"}{" "}
              <span>
                {Math.round(size.width)} × {Math.round(size.height)}
              </span>
            </span>
            {slide ? (
              <div
                className="eppt-stage-frame"
                ref={stageFrame}
                style={{
                  width: size.width * scale,
                  height: size.height * scale,
                }}
              >
                <div
                  style={{
                    transform: `scale(${scale})`,
                    transformOrigin: "0 0",
                    width: size.width,
                    height: size.height,
                  }}
                >
                  <PresentationEditor
                    ref={editorHandle}
                    document={props.document}
                    controller={controller}
                    slideId={slideId}
                    mode={props.readOnly || presenting ? "readonly" : "edit"}
                    selectedIds={selected}
                    tableActions={!presenting && commentAnchor ? props.renderCommentAction?.(commentAnchor) : null}
                    resolveAsset={props.resources?.resolveUrl}
                    onSelectionChange={(s) =>
                      select(s?.type === "elements" ? s.elementIds : [])
                    }
                    onTextEditor={(e) => {
                      setTextEditor(e);
                      refreshFormat((n) => n + 1);
                    }}
                    onError={(e) => setMessage(e.message)}
                    onInteractionChange={setCanvasInteracting}
                    viewScale={scale}
                    snapping={snapping}
                    onContextMenu={openElementMenu}
                  />
                  {!presenting &&
                    props.onCommentAnchorClick &&
                    (props.commentMarkers ?? []).map((marker) => {
                      const resolved = resolveAnchor(
                        props.document,
                        marker.anchor,
                      );
                      if (!resolved || resolved.slideId !== slideId)
                        return null;
                      return (
                        <CommentPin
                          key={marker.id}
                          elementIds={"elementIds" in resolved ? resolved.elementIds ?? [] : "elementId" in resolved && resolved.elementId ? [resolved.elementId] : []}
                          transforms={"elementIds" in resolved
                            ? (resolved.elementIds ?? []).map(id => slide.elements[id].transform)
                            : [resolved.transform]}
                          interacting={canvasInteracting}
                          getTransform={(id) => editorHandle.current?.getElementTransform?.(id)}
                          onClick={() =>
                            props.onCommentAnchorClick?.(
                              commentCandidates(
                                props.document,
                                props.commentMarkers ?? [],
                                marker.anchor,
                              ),
                            )
                          }
                        >
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-5 4V5a2 2 0 0 1 2-2h15a2 2 0 0 1 2 2z" /></svg>
                        </CommentPin>
                      );
                    })}
                  {!props.readOnly && !presenting
                    ? (props.members ?? [])
                        .filter(
                          (m) =>
                            m.sessionId !== props.sessionId &&
                            m.slideId === slideId,
                        )
                        .flatMap((m) =>
                          (m.selection?.elementIds ?? []).map((id) => {
                            const el = slide.elements[id];
                            if (!el) return null;
                            return (
                              <div
                                key={m.sessionId + id}
                                className="eppt-remote"
                                style={{
                                  left: emuToPx(el.transform.x),
                                  top: emuToPx(el.transform.y),
                                  width: emuToPx(el.transform.width),
                                  height: emuToPx(el.transform.height),
                                  borderColor: m.color,
                                  transform: `rotate(${el.transform.rotation}deg)`,
                                }}
                              >
                                <span style={{ background: m.color }}>
                                  {m.name}
                                </span>
                              </div>
                            );
                          }),
                        )
                    : null}
                </div>
              </div>
            ) : (
              <div className="eppt-empty">
                <h2>从第一张幻灯片开始</h2>
                <button
                  className="eppt-primary"
                  disabled={disabled}
                  onClick={() => switchSlide(controller.addSlide())}
                >
                  新建幻灯片
                </button>
              </div>
            )}
          </div>
          <div
            className="eppt-notes"
            hidden={!showNotes}
            style={{ height: notesHeight }}
          >
            <div
              className="eppt-notes-resize"
              role="separator"
              aria-label="调整备注区域高度"
              aria-orientation="horizontal"
              aria-valuemin={48}
              aria-valuemax={240}
              aria-valuenow={notesHeight}
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "ArrowUp" || e.key === "ArrowDown") {
                  e.preventDefault();
                  e.stopPropagation();
                  setNotesHeight(
                    Math.max(
                      48,
                      Math.min(
                        240,
                        notesHeight + (e.key === "ArrowUp" ? 24 : -24),
                      ),
                    ),
                  );
                }
              }}
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
              }}
              onPointerMove={(e) => {
                if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                  const bottom =
                    e.currentTarget.parentElement!.getBoundingClientRect()
                      .bottom;
                  setNotesHeight(
                    Math.max(48, Math.min(240, bottom - e.clientY)),
                  );
                }
              }}
            >
              <span />
            </div>
            <label className="eppt-sr-only" htmlFor="eppt-notes">
              演讲者备注
            </label>
            <textarea
              id="eppt-notes"
              aria-label="演讲者备注"
              value={slide?.notes ?? ""}
              disabled={disabled || !slide}
              onChange={(e) =>
                controller.slideProperty(slideId, "notes", e.target.value)
              }
              placeholder="点击添加演示者备注"
            />
          </div>
        </main>
        <aside className="eppt-properties" hidden={!showProperties}>
          <div className="eppt-aside-heading">
            {element ? "元素属性" : "画布与图层"}
            <button
              aria-label="收起属性面板"
              onClick={() => setShowProperties(false)}
            >
              ×
            </button>
          </div>
          {element ? (
            <>
              <div className="eppt-prop-title">
                {
                  (
                    {
                      text: "文本框",
                      shape: "形状",
                      image: "图片",
                      line: "线条",
                      table: "表格",
                      chart: "图表",
                    } as const
                  )[element.type]
                }
              </div>
              {element.type === "chart" && (
                <ChartDataEditor
                  key={element.id + "-data"}
                  element={element}
                  disabled={disabled}
                  onApply={(labels, values, series) =>
                    controller.patch(slideId, element.id, {
                      labels,
                      values,
                      series,
                      color: series[0].color ?? element.color,
                    })
                  }
                />
              )}
              {element.type === "chart" && (
                <ChartOptions
                  key={element.id + "-options"}
                  element={element}
                  disabled={disabled}
                  onChange={(patch) =>
                    controller.patch(slideId, element.id, patch)
                  }
                />
              )}
              <div className="eppt-field-grid">
                {(["x", "y", "width", "height", "rotation"] as const).map(
                  (k, i) => (
                    <label key={k}>
                      {["X", "Y", "宽度", "高度", "旋转 °"][i]}
                      <CommitInput
                        aria-label={
                          ["X坐标", "Y坐标", "宽度", "高度", "旋转"][i]
                        }
                        type="number"
                        disabled={disabled || element.locked}
                        value={String(
                          Math.round(
                            100 *
                              (k === "rotation"
                                ? element.transform[k]
                                : emuToPx(element.transform[k])),
                          ) / 100,
                        )}
                        onCommit={(value) => {
                          if (!value.trim()) return;
                          const v = Number(value);
                          if (
                            !Number.isFinite(v) ||
                            (["width", "height"].includes(k) && v <= 0)
                          )
                            return;
                          controller.patch(slideId, element.id, {
                            transform: {
                              [k]: k === "rotation" ? v : pxToEmu(v),
                            },
                          });
                        }}
                      />
                    </label>
                  ),
                )}
              </div>
              {element.type === "shape" ? (
                <label className="eppt-field">
                  填充颜色
                  <input
                    aria-label="填充颜色"
                    type="color"
                    value={element.fill ?? "#325af0"}
                    disabled={disabled}
                    onChange={(e) =>
                      controller.patch(slideId, element.id, {
                        fill: e.target.value,
                      })
                    }
                  />
                </label>
              ) : null}
              {element.type === "image" ? (
                <>
                  <div className="eppt-prop-title">图片</div>
                  <button
                    disabled={disabled || !props.resources}
                    onClick={() => setCropping({ slideId, id: element.id })}
                  >
                    裁剪图片
                  </button>
                  <button
                    disabled={disabled || !element.crop}
                    onClick={() =>
                      controller.patch(slideId, element.id, {
                        crop: [0, 0, 0, 0],
                      })
                    }
                  >
                    重置裁剪
                  </button>
                  <div className="eppt-align">
                    <button
                      disabled={disabled}
                      aria-pressed={element.transform.flipH ?? false}
                      onClick={() =>
                        controller.patch(slideId, element.id, {
                          transform: { flipH: !element.transform.flipH },
                        })
                      }
                    >
                      水平翻转
                    </button>
                    <button
                      disabled={disabled}
                      aria-pressed={element.transform.flipV ?? false}
                      onClick={() =>
                        controller.patch(slideId, element.id, {
                          transform: { flipV: !element.transform.flipV },
                        })
                      }
                    >
                      垂直翻转
                    </button>
                  </div>
                </>
              ) : null}
              {element.type === "line" ? (
                <label className="eppt-field">
                  <input
                    type="checkbox"
                    aria-label="末端箭头"
                    disabled={disabled}
                    checked={element.arrow ?? false}
                    onChange={(e) =>
                      controller.patch(slideId, element.id, {
                        arrow: e.target.checked,
                      })
                    }
                  />
                  末端箭头
                </label>
              ) : null}
              <label className="eppt-field">
                透明度
                <input
                  aria-label="不透明度"
                  type="range"
                  min="0"
                  max="100"
                  value={(element.opacity ?? 1) * 100}
                  disabled={disabled}
                  onChange={(e) =>
                    controller.patch(slideId, element.id, {
                      opacity: Number(e.target.value) / 100,
                    })
                  }
                />
              </label>
              <label className="eppt-field">
                <input
                  type="checkbox"
                  checked={element.locked ?? false}
                  disabled={disabled}
                  onChange={(e) =>
                    controller.patch(slideId, element.id, {
                      locked: e.target.checked,
                    })
                  }
                />
                锁定位置
              </label>
              <div className="eppt-prop-title">对齐到幻灯片</div>
              {element.type === "text" ? (
                <>
                  <TextFormatPanel element={element} marks={marks}
                    paragraph={(textEditor && textEditor.selection ? textEditor.children[textEditor.selection.anchor.path[0]] as TextParagraph : element.paragraphs[0]) ?? element.paragraphs[0]}
                    disabled={disabled || !!element.locked} format={format} paragraphFormat={paragraphFormat}
                    setPadding={padding => controller.patch(slideId, element.id, { padding })} />
                  <label className="eppt-field">
                    垂直对齐
                    <select
                      aria-label="文字垂直对齐"
                      disabled={disabled}
                      value={element.verticalAlign ?? "top"}
                      onChange={(e) =>
                        controller.patch(slideId, element.id, {
                          verticalAlign: e.target.value,
                        })
                      }
                    >
                      <option value="top">顶端</option>
                      <option value="middle">中部</option>
                      <option value="bottom">底端</option>
                    </select>
                  </label>
                  <div className="eppt-prop-title">段落</div>
                  <div className="eppt-align">
                    {(["left", "center", "right", "justify"] as const).map(
                      (align, i) => (
                        <button
                          key={align}
                          disabled={disabled}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => paragraphFormat({ align })}
                        >
                          {["左对齐", "居中", "右对齐", "两端"][i]}
                        </button>
                      ),
                    )}
                    <button
                      disabled={disabled}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => paragraphFormat({ bullet: true, list: "bullet" })}
                    >
                      项目符号
                    </button>
                    <button
                      disabled={disabled}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => paragraphFormat({ bullet: false, list: "none" })}
                    >
                      清除列表
                    </button>
                  </div>
                </>
              ) : null}
              {element.type === "chart" ? (
                <label className="eppt-field">
                  图表类型
                  <select
                    aria-label="图表类型"
                    value={element.chartType}
                    disabled={disabled}
                    onChange={(e) => {
                      if (
                        ["pie", "doughnut"].includes(e.target.value) &&
                        (element.values.some((v) => v < 0) ||
                          !element.values.some((v) => v > 0))
                      ) {
                        setMessage(
                          "当前数据包含负数或全为零，不能切换为饼图或环形图",
                        );
                        return;
                      }
                      controller.patch(slideId, element.id, {
                        chartType: e.target.value,
                      });
                    }}
                  >
                    <option value="bar">柱状图</option>
                    <option value="line">折线图</option>
                    <option
                      value="pie"
                      disabled={(element.series?.length ?? 1) > 1}
                    >
                      饼图（单系列）
                    </option>
                    <option
                      value="doughnut"
                      disabled={(element.series?.length ?? 1) > 1}
                    >
                      环形图（单系列）
                    </option>
                  </select>
                </label>
              ) : null}
              {element.type === "shape" || element.type === "line" ? (
                <>
                  <label className="eppt-field">
                    边框颜色
                    <input
                      type="color"
                      aria-label="边框颜色"
                      value={element.stroke ?? "#325af0"}
                      disabled={disabled}
                      onChange={(e) =>
                        controller.patch(slideId, element.id, {
                          stroke: e.target.value,
                        })
                      }
                    />
                  </label>
                  <label className="eppt-field">
                    边框宽度
                    <input
                      type="number"
                      aria-label="边框宽度"
                      value={element.strokeWidth ?? 0}
                      min="0"
                      max="40"
                      disabled={disabled}
                      onChange={(e) => {
                        const width = +e.target.value;
                        if (width >= 0 && width <= 40)
                          controller.patch(slideId, element.id, {
                            strokeWidth: width,
                          });
                      }}
                    />
                  </label>
                </>
              ) : null}
              <div className="eppt-align">
                {(
                  [
                    "left",
                    "center",
                    "right",
                    "top",
                    "middle",
                    "bottom",
                  ] as const
                ).map((a, i) => (
                  <button
                    key={a}
                    disabled={disabled}
                    onClick={() => controller.align(slideId, selected, a)}
                  >
                    {["左", "中", "右", "顶", "居中", "底"][i]}
                  </button>
                ))}
              </div>
              {element.type === "table" && (
                <p className="eppt-hint">
                  点击画布单元格编辑；表格右边和下方的 ＋ 可直接增加行列。
                </p>
              )}
            </>
          ) : (
            <div className="eppt-hint">
              选择元素调整位置和样式。
              <br />
              双击文本进入编辑。
              <br />
              按住 Shift 可选择多个元素。
            </div>
          )}
          {selected.length > 1 ? (
            <>
              <div className="eppt-prop-title">多选排列</div>
              <div className="eppt-align">
                {(
                  [
                    "left",
                    "center",
                    "right",
                    "top",
                    "middle",
                    "bottom",
                  ] as const
                ).map((axis, i) => (
                  <button
                    key={axis}
                    disabled={disabled}
                    onClick={() => controller.align(slideId, selected, axis)}
                  >
                    {["左", "中", "右", "顶", "居中", "底"][i]}
                  </button>
                ))}
                <button
                  disabled={disabled || selected.length < 3}
                  onClick={() =>
                    controller.distribute(slideId, selected, "horizontal")
                  }
                >
                  横向分布
                </button>
                <button
                  disabled={disabled || selected.length < 3}
                  onClick={() =>
                    controller.distribute(slideId, selected, "vertical")
                  }
                >
                  纵向分布
                </button>
              </div>
            </>
          ) : null}
          <div className="eppt-page-actions">
            <button
              disabled={disabled || selected.length < 2}
              onClick={() => controller.group(slideId, selected)}
            >
              组合
            </button>
            <button
              disabled={
                disabled || !selected.some((id) => slide?.elements[id]?.groupId)
              }
              onClick={() => controller.ungroup(slideId, selected)}
            >
              取消组合
            </button>
          </div>
          <details>
            <summary>选择窗格</summary>
            <div className="eppt-layers">
              {[...(slide?.elementOrder ?? [])].reverse().map((id) => (
                <button
                  className={selected.includes(id) ? "active" : ""}
                  key={id}
                  onClick={(e) =>
                    select(
                      e.shiftKey
                        ? selected.includes(id)
                          ? selected.filter((item) => item !== id)
                          : [...selected, id]
                        : [id],
                    )
                  }
                >
                  <span>{slide.elements[id].type === "text" ? "T" : "◇"}</span>
                  {slide.elements[id].name ??
                    (slide.elements[id].type === "text"
                      ? slide.elements[id].paragraphs[0]?.children
                          .map((c) => c.text)
                          .join("")
                      : (
                          {
                            shape: "形状",
                            image: "图片",
                            line: "线条",
                            table: "表格",
                            chart: "图表",
                          } as Record<string, string>
                        )[slide.elements[id].type])}
                  {slide.elements[id].locked ? " 🔒" : ""}
                </button>
              ))}
            </div>
          </details>
        </aside>
      </div>
      <footer className="eppt-status">
        <span>
          {selected.length ? `已选择 ${selected.length} 个元素` : "就绪"} ·{" "}
          {slide?.elementOrder.length ?? 0} 个元素
        </span>
        <span>快捷键：⌘/Ctrl Z 撤销 · Delete 删除 · 方向键微调</span>
        <span>
          {props.readOnly ? "只读" : "编辑"} · {props.status ?? "就绪"}
        </span>
      </footer>
      {contextMenu && (
        <ElementMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => {
            setContextMenu(null);
            workspace.current?.focus({ preventScroll: true });
          }}
          actions={[
            ...(["front", "forward", "backward", "back"] as const).map(
              (action, i) => ({
                label: ["置于顶层", "上移一层", "下移一层", "置于底层"][i],
                disabled,
                run: () => controller.arrange(slideId, contextMenu.ids, action),
              }),
            ),
            {
              label: "复制对象",
              separator: true,
              disabled,
              run: () => select(controller.duplicate(slideId, contextMenu.ids)),
            },
            {
              label: "组合",
              disabled: disabled || contextMenu.ids.length < 2,
              run: () => controller.group(slideId, contextMenu.ids),
            },
            {
              label: "取消组合",
              disabled:
                disabled ||
                !contextMenu.ids.some((id) => slide.elements[id]?.groupId),
              run: () => controller.ungroup(slideId, contextMenu.ids),
            },
            {
              label: contextMenu.ids.every((id) => slide.elements[id]?.locked)
                ? "解锁对象"
                : "锁定对象",
              disabled,
              run: () => {
                const locked = !contextMenu.ids.every(
                  (id) => slide.elements[id]?.locked,
                );
                controller.run(() =>
                  contextMenu.ids.forEach((id) =>
                    controller.patch(slideId, id, { locked }),
                  ),
                );
              },
            },
            {
              label: "设置格式",
              separator: true,
              run: () => setShowProperties(true),
            },
            {
              label: "删除对象",
              disabled,
              run: () => {
                controller.remove(slideId, contextMenu.ids);
                select([]);
              },
            },
          ]}
        />
      )}
      {!disabled &&
      cropping &&
      cropTarget?.type === "image" &&
      props.resources ? (
        <ImageCropDialog
          key={cropping.id}
          url={props.resources.resolveUrl(cropTarget.assetId)}
          initial={cropTarget.crop}
          onClose={() => setCropping(null)}
          onApply={(crop) => {
            controller.patch(cropping.slideId, cropping.id, { crop });
            setCropping(null);
          }}
        />
      ) : null}
      {presenting && slide && !slide.hidden ? (
        <div
          className="eppt-present"
          role="dialog"
          aria-modal="true"
          aria-label="幻灯片放映"
          tabIndex={-1}
          ref={presentationRoot}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.stopPropagation();
              setPresenting(false);
            }
            if ((e.target as HTMLElement).closest("button")) return;
            if (
              ["ArrowRight", "ArrowDown", " ", "ArrowLeft", "ArrowUp"].includes(
                e.key,
              )
            ) {
              e.preventDefault();
              e.stopPropagation();
              if (["ArrowLeft", "ArrowUp"].includes(e.key))
                previousPresentedSlide();
              else next();
            }
          }}
          onClick={next}
        >
          <div
            style={{
              width:
                size.width *
                Math.min(
                  window.innerWidth / size.width,
                  window.innerHeight / size.height,
                ),
              height:
                size.height *
                Math.min(
                  window.innerWidth / size.width,
                  window.innerHeight / size.height,
                ),
            }}
          >
            <div
              style={{
                transform: `scale(${Math.min(window.innerWidth / size.width, window.innerHeight / size.height)})`,
                transformOrigin: "0 0",
              }}
            >
              <SlidePreview
                document={value}
                slide={slide}
                resolveAsset={props.resources?.resolveUrl}
                step={step}
              />
            </div>
          </div>
          <button
            className="eppt-present-exit"
            onClick={(e) => {
              e.stopPropagation();
              setPresenting(false);
            }}
          >
            退出放映 Esc
          </button>
          <span className="eppt-present-count">
            <button
              onClick={(e) => {
                e.stopPropagation();
                previousPresentedSlide();
              }}
            >
              上一页
            </button>
            {showOrder.indexOf(slideId) + 1} / {showOrder.length}
            <button
              onClick={(e) => {
                e.stopPropagation();
                next();
              }}
            >
              下一页
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                void presentationRoot.current
                  ?.requestFullscreen?.()
                  .catch(() =>
                    setMessage("当前环境不支持全屏，可继续窗口放映。"),
                  );
              }}
            >
              全屏
            </button>
          </span>
        </div>
      ) : null}
      <style>{`@media print { @page { size: ${size.width / 96}in ${size.height / 96}in; margin: 0; } .eppt-print .eppt-preview { width: ${size.width}px !important; height: ${size.height}px !important; zoom: 1; } }`}</style>
      <div className="eppt-print">
        {printing &&
          value.slideOrder.map((id) => (
            <SlidePreview
              key={id}
              document={value}
              slide={value.slides[id]}
              resolveAsset={props.resources?.resolveUrl}
            />
          ))}
      </div>
    </div>
  );
});
