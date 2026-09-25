import {
  forwardRef,
  useImperativeHandle,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  createTranslator,
  htmlLang,
  I18nProvider,
  noticeFromError,
  phraseText,
  type Phrase,
} from "../i18n";
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
  /** Interface language. Defaults to Chinese. Unknown codes use English. */
  locale?: string;
  /** Replaces individual catalog keys. Does not change document content. */
  messages?: Record<string, string>;
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
  const t = useMemo(
    () => createTranslator(props.locale, props.messages),
    [props.locale, props.messages],
  );
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
  const [message, setMessage] = useState<Phrase | null>(null);
  const [busy, setBusy] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [cropping, setCropping] = useState<{
    slideId: string;
    id: string;
  } | null>(null);
  const [textEditor, setTextEditor] = useState<Editor | null>(null);
  const [, refreshFormat] = useState(0);
  const [tab, setTab] = useState<
    "insert" | "home" | "design" | "animation" | "file"
  >("insert");
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
      setMessage(null);
    try {
      await action();
    } catch (error) {
      setMessage(noticeFromError(error));
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
      setMessage({ key: "alert.pptxReady" });
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
      if (!editorHandle.current) throw new Error(t("error.slideNotReady"));
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
      controller.addSlide(
      slideId,
      createSlideLayout(kind, value.size, dark, {
        blank: t("layout.blank"),
        cover: t("layout.cover"),
        agenda: t("layout.agenda"),
        columns: t("layout.columns"),
        title: t("layout.sampleTitle"),
        subtitle: t("layout.sampleSubtitle"),
        agendaHeading: t("layout.sampleAgenda"),
        agendaItem: t("layout.sampleAgendaItem"),
        columnsHeading: t("layout.sampleColumns"),
        topic1: t("layout.sampleTopic1"),
        topic2: t("layout.sampleTopic2"),
        body: t("layout.body"),
      }),
    ),
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
      setMessage({ key: "alert.allHidden" });
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
        throw new Error(t("error.slideDeleted"));
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
    <I18nProvider value={t}>
    <div
      lang={htmlLang(props.locale)}
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
              aria-label={t("menu.title")}
              key={value.id}
              value={value.title}
              onCommit={(title) =>
                props.onTitleChange?.(title || t("menu.untitled"))
              }
              disabled={disabled || !props.onTitleChange}
            />
            <span className="eppt-save">
              <i />
              {props.saveLabel ?? t("menu.localDoc")}
            </span>
          </div>
          <nav className="eppt-document-menu" aria-label={t("menu.document")}>
            {(
              [
                ["file", "menu.file"],
                ["home", "menu.home"],
                ["design", "menu.design"],
              ] as const
            ).map(([item, label]) => (
              <button
                key={item}
                aria-pressed={tab === item}
                onClick={() => setTab(tab === item ? "insert" : item)}
              >
                {t(label)}
                <span>⌄</span>
              </button>
            ))}
          </nav>
          <div className="eppt-history-actions">
            <button
              aria-label={t("toolbar.undo")}
              title={t("toolbar.undoShortcut")}
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
              aria-label={t("toolbar.redo")}
              title={t("toolbar.redoShortcut")}
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
                title={t("menu.reconnect")}
              >
                {t("menu.reconnectButton")}
              </button>
            ) : null}
            <button
              disabled={disabled || !props.onImport}
              onClick={() => setImportOpen(true)}
            >
              {t("menu.upload")}
            </button>
            <button onClick={downloadPptx} disabled={busy || !props.onExport}>
              {busy ? t("menu.downloadBusy") : t("menu.download")}
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
              <ToolIcon kind="present" /> {t("toolbar.present")}
            </button>
          </div>
        </header>
      )}
      <div
        className={
          "eppt-toolbar " +
          (tab === "insert" ? "eppt-ribbon" : "eppt-ribbon-options")
        }
      >
        <LayoutPicker
          disabled={disabled}
          onPick={insertLayout}
          collapsed={railCollapsed}
          onCollapse={() => setRailCollapsed(!railCollapsed)}
        />
        <div className={props.chrome !== "demo" ? "eppt-flat-tools" : "eppt-toolbar-inline"}>
        <div ref={setPageToolsContainer} className="eppt-page-tools" role="group" aria-label={t("toolbar.slideActions")} />
        {props.chrome !== "demo" && (
          <>
            <button
              className="eppt-present-action" title={t("toolbar.present")} aria-label={t("toolbar.present")}
              disabled={!slide}
              onClick={() => {
                setStep(0);
                setSelected([]);
                setPresenting(true);
              }}
            >
              <ToolIcon kind="present" />
            </button>
            <div className="eppt-toolgroup eppt-history-actions" role="group" aria-label={t("toolbar.history")}>
              <button title={t("toolbar.undoShortcutShort")} aria-label={t("toolbar.undo")}
                disabled={disabled || !controller.history.undoStack.length}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  if (textEditor && YjsEditor.isYjsEditor(textEditor)) YjsEditor.flushLocalChanges(textEditor);
                  controller.undo();
                }}><ToolIcon kind="undo" /></button>
              <button title={t("toolbar.redoShortcutShort")} aria-label={t("toolbar.redo")}
                disabled={disabled || !controller.history.redoStack.length}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => controller.redo()}><ToolIcon kind="redo" /></button>
            </div>
          </>
        )}
        {tab !== "insert" && (
          <button
            className="eppt-back-tools"
            onClick={() => setTab("insert")}
            title={t("toolbar.back")}
          >
            {t("toolbar.backLabel")}
          </button>
        )}
        {tab === "home" && props.chrome === "demo" ? (
          <div className={props.chrome !== "demo" ? "eppt-toolbar-dropdown" : "eppt-toolbar-inline"} role="group" aria-label={t("toolbar.editSettings")}>
            <div className="eppt-toolgroup">
              <button
                title={t("toolbar.undoShortcutShort")}
                disabled={disabled || !controller.history.undoStack.length}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  if (textEditor && YjsEditor.isYjsEditor(textEditor))
                    YjsEditor.flushLocalChanges(textEditor);
                  controller.undo();
                }}
              >
                {t("toolbar.undoText")}
              </button>
              <button
                title={t("toolbar.redoShortcutShort")}
                disabled={disabled || !controller.history.redoStack.length}
                onClick={() => controller.redo()}
              >
                {t("toolbar.redoIcon")}
              </button>
            </div>
            <div className="eppt-toolgroup">
              <button
                disabled={disabled}
                onClick={() => switchSlide(controller.addSlide(slideId))}
              >
                {t("toolbar.newSlide")}
              </button>
              <button
                disabled={disabled || !slide}
                onClick={() => switchSlide(controller.addSlide(slideId, slide))}
              >
                {t("toolbar.duplicateSlide")}
              </button>
            </div>
            <div className="eppt-toolgroup">
              <select
                aria-label={t("toolbar.font")}
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
                aria-label={t("toolbar.fontSize")}
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
                  title={[t("toolbar.bold"), t("toolbar.italic"), t("toolbar.underline")][i]}
                  disabled={disabled}
                  className={marks?.[mark] ? "active" : ""}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => format({ [mark]: !marks?.[mark] })}
                >
                  {["B", "I", "U"][i]}
                </button>
              ))}
              <input
                aria-label={t("toolbar.textColor")}
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
                {t("toolbar.duplicateElement")}
              </button>
              <button
                disabled={disabled || !selected.length}
                onClick={() => {
                  controller.remove(slideId, selected);
                  select([]);
                }}
              >
                {t("toolbar.delete")}
              </button>
            </div>
          </div>
        ) : null}
        {tab === "insert" ? (
          <>
            <button
              className="eppt-insert-tool"
              disabled={disabled}
              onClick={() => add("text")}
            >
              <ToolIcon kind="text" />
              <span>{t("toolbar.text")}</span>
            </button>
            <InsertPalette
              kind="shape"
              label={t("insert.shape")}
              disabled={disabled}
              items={[
                ...SHAPES.map((shape) => ({
                  id: shape.id,
                  label: t(`shape.${shape.id}`),
                  group: shape.group,
                })),
                { id: "line", label: t("shape.line"), group: "线条" },
              ]}
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
              <span>{t("toolbar.image")}</span>
            </button>
            <InsertPalette
              kind="chart"
              label={t("insert.chart")}
              disabled={disabled}
              items={[
                { id: "bar", label: t("chart.bar") },
                { id: "bar-stacked", label: t("chart.barStacked") },
                { id: "bar-percent", label: t("chart.barPercent") },
                { id: "line", label: t("chart.line"), icon: "chartLine" },
                { id: "line-smooth", label: t("chart.lineSmooth") },
                { id: "line-step", label: t("chart.lineStep") },
                { id: "pie", label: t("chart.pie") },
                { id: "doughnut", label: t("chart.doughnut") },
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
                                name: t("chart.seriesDefault", { index: 1 }),
                                values: [32, 54, 46, 78],
                                color: "#527eff",
                              },
                              {
                                name: t("chart.seriesDefault", { index: 2 }),
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
              <span>{t("toolbar.table")}</span>
            </button>
            <button
              className="eppt-insert-tool"
              aria-pressed={showProperties}
              onClick={() => setShowProperties(!showProperties)}
            >
              <ToolIcon kind="format" />
              <span>{t("toolbar.format")}</span>
            </button>
            <button className="eppt-insert-tool" onClick={() => setTab("animation")}>
              <ToolIcon kind="animation" />
              <span>{t("toolbar.animation")}</span>
            </button>
          </>
        ) : null}
        {props.chrome !== "demo" || tab === "design" ? (
          <div className={props.chrome !== "demo" ? "eppt-design-actions" : "eppt-toolbar-inline"} role="group" aria-label={t("toolbar.pageSettings")}>
            {props.chrome === "demo" && <label>
              <input
                type="checkbox"
                checked={snapping}
                onChange={(e) => setSnapping(e.target.checked)}
              />{" "}
              {t("toolbar.snap")}
            </label>}
            <label title={t("toolbar.pageBackground")}>
              {t("toolbar.pageBackground")}{" "}
              <input
                type="color"
                aria-label={t("toolbar.pageBackground")}
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
            <label title={t("toolbar.pageSizeHint")}>
              {t("toolbar.pageSize")}{" "}
              <select
                aria-label={t("toolbar.pageSize")}
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
                <option value="wide">{t("toolbar.sizeWide")}</option>
                <option value="standard">{t("toolbar.sizeStandard")}</option>
                <option value="custom" disabled>
                  {t("toolbar.sizeCustom")}
                </option>
              </select>
            </label>
            {props.chrome === "demo" && <span className="eppt-muted">
              {t("toolbar.sizeNote")}
            </span>}
          </div>
        ) : null}
        {tab === "animation" ? (
          <>
            <label>
              {t("toolbar.entrance")}{" "}
              <select
                aria-label={t("toolbar.entrance")}
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
                <option value="none">{t("toolbar.animNone")}</option>
                <option value="appear">{t("toolbar.animAppear")}</option>
                <option value="fade">{t("toolbar.animFade")}</option>
                <option value="fly">{t("toolbar.animFly")}</option>
              </select>
            </label>
            <span className="eppt-muted">
              {t("toolbar.animHint")}
            </span>
            {element?.animation ? (
              <>
                <label>
                  {t("toolbar.animStart")}{" "}
                  <select
                    aria-label={t("toolbar.animTrigger")}
                    disabled={disabled}
                    value={element.animation.trigger}
                    onChange={(e) =>
                      controller.patch(slideId, element.id, {
                        animation: { trigger: e.target.value },
                      })
                    }
                  >
                    <option value="on-click">{t("toolbar.onClick")}</option>
                    <option value="after-previous">{t("toolbar.afterPrevious")}</option>
                  </select>
                </label>
                <label>
                  {t("toolbar.duration")}
                  <input
                    aria-label={t("toolbar.durationLabel")}
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
        {tab === "file" ? (
          <>
            <button
              disabled={disabled || !props.onImport}
              onClick={() => setImportOpen(true)}
            >
              {t("toolbar.importPptx")}
            </button>
            <button disabled={busy || !props.onExport} onClick={downloadPptx}>
              {t("toolbar.savePptx")}
            </button>
            <button
              disabled={!props.onExport}
              onClick={() => runAsync(() => props.onExport?.("pdf"))}
            >
              {t("toolbar.printPdf")}
            </button>
            <span className="eppt-muted">
              {t("toolbar.importNote")}
            </span>
          </>
        ) : null}
        {tab === "file" ? (
          <button
            disabled={busy || !props.onExportPng}
            onClick={() =>
              runAsync(async () => {
                if (textEditor && YjsEditor.isYjsEditor(textEditor))
                  YjsEditor.flushLocalChanges(textEditor);
                const blob = await editorHandle.current?.exportPng();
                if (!blob) throw new Error(t("error.slideNotReady"));
                await props.onExportPng?.({
                  blob,
                  filename: value.title + ".png",
                  mime: "image/png",
                });
                setMessage({
                  key: "alert.pngReady",
                  vars: { size: Math.ceil(blob.size / 1024) },
                });
              })
            }
          >
            {t("toolbar.currentPng")}
          </button>
        ) : null}
        <div className="eppt-zoom-control">
          <button onClick={() => setZoom(Math.max(0.25, scale - 0.1))}>
            −
          </button>
          <select
            aria-label={t("toolbar.zoom")}
            value={zoom}
            onChange={(e) =>
              setZoom(e.target.value === "fit" ? "fit" : Number(e.target.value))
            }
          >
            <option value="fit">{t("toolbar.zoomFit", { percent: Math.round(scale * 100) })}</option>
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
          {phraseText(t, message)}
          <button onClick={() => setMessage(null)}>{t("alert.close")}</button>
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
                (element?.type !== "table" && tab !== "insert")) && (
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
                  hidden={tab !== "insert" || presenting}
                  interacting={canvasInteracting}
                  getTransform={(id) => editorHandle.current?.getElementTransform?.(id)}
                >
                  {element?.type === "text" ? (
                    <>
                      <select
                        aria-label={t("float.font")}
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
                        aria-label={t("float.size")}
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
                            aria-label={[t("toolbar.bold"), t("toolbar.italic"), t("toolbar.underline")][i]}
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
                        label={t("toolbar.textColor")} mark="text"
                        value={marks?.color ?? element.fill ?? "#202124"}
                        disabled={disabled}
                        onChange={(color) => format({ color })}
                      />
                      <ColorPicker
                        label={t("color.highlight")} mark="highlight"
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
                        label={t("color.textBackground")}
                        value={element.background}
                        clearable
                        disabled={disabled}
                        onChange={(background) =>
                          controller.patch(slideId, element.id, { background })
                        }
                      />
                      <select
                        aria-label={t("float.align")}
                        disabled={disabled}
                        value={element.paragraphs[0]?.align ?? "left"}
                        onChange={(e) =>
                          paragraphFormat({
                            align: e.target.value as
                              "left" | "center" | "right",
                          })
                        }
                      >
                        <option value="left">{t("float.alignLeft")}</option>
                        <option value="center">{t("float.alignCenter")}</option>
                        <option value="right">{t("float.alignRight")}</option>
                      </select>
                    </>
                  ) : element?.type === "image" ? (
                    <>
                      <button
                        disabled={disabled || !props.resources}
                        onClick={() => setCropping({ slideId, id: element.id })}
                      >
                        {t("float.crop")}
                      </button>
                      <button
                        disabled={disabled}
                        onClick={() =>
                          controller.patch(slideId, element.id, {
                            transform: { flipH: !element.transform.flipH },
                          })
                        }
                      >
                        {t("float.flipH")}
                      </button>
                    </>
                  ) : (
                    <span>
                      {selected.length > 1
                        ? t("selection.count", { count: selected.length })
                        : element?.type === "chart"
                          ? t("float.chart")
                          : t("float.shape")}
                    </span>
                  )}
                  <button
                    aria-pressed={showProperties}
                    onClick={() => setShowProperties(!showProperties)}
                  >
                    {showProperties ? t("float.less") : t("float.more")}
                  </button>
                  {commentAnchor && props.renderCommentAction?.(commentAnchor)}
                </FloatingToolbar>
              )}
            <span className="eppt-slide-label">
              {slide
                ? t("canvas.slide", { index: value.slideOrder.indexOf(slideId) + 1 })
                : t("canvas.emptyDeck")}{" "}
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
                    onError={(e) => setMessage(noticeFromError(e))}
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
                <h2>{t("canvas.startTitle")}</h2>
                <button
                  className="eppt-primary"
                  disabled={disabled}
                  onClick={() => switchSlide(controller.addSlide())}
                >
                  {t("canvas.start")}
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
              aria-label={t("canvas.notesResize")}
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
              {t("canvas.notes")}
            </label>
            <textarea
              id="eppt-notes"
              aria-label={t("canvas.notes")}
              value={slide?.notes ?? ""}
              disabled={disabled || !slide}
              onChange={(e) =>
                controller.slideProperty(slideId, "notes", e.target.value)
              }
              placeholder={t("canvas.notesPlaceholder")}
            />
          </div>
        </main>
        <aside className="eppt-properties" hidden={!showProperties}>
          <div className="eppt-aside-heading">
            {element ? t("props.element") : t("props.canvas")}
            <button
              aria-label={t("props.collapse")}
              onClick={() => setShowProperties(false)}
            >
              ×
            </button>
          </div>
          {element ? (
            <>
              <div className="eppt-prop-title">
                {(
                  {
                    text: t("props.text"),
                    shape: t("props.shape"),
                    image: t("props.image"),
                    line: t("props.line"),
                    table: t("props.table"),
                    chart: t("props.chart"),
                  } as const
                )[element.type]}
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
                      {[
                        t("props.x"),
                        t("props.y"),
                        t("props.width"),
                        t("props.height"),
                        t("props.rotation"),
                      ][i]}
                      <CommitInput
                        aria-label={
                          [
                            t("props.xLabel"),
                            t("props.yLabel"),
                            t("props.widthLabel"),
                            t("props.heightLabel"),
                            t("props.rotationLabel"),
                          ][i]
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
                  {t("props.fill")}
                  <input
                    aria-label={t("props.fill")}
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
                  <div className="eppt-prop-title">{t("props.imageTitle")}</div>
                  <button
                    disabled={disabled || !props.resources}
                    onClick={() => setCropping({ slideId, id: element.id })}
                  >
                    {t("float.crop")}
                  </button>
                  <button
                    disabled={disabled || !element.crop}
                    onClick={() =>
                      controller.patch(slideId, element.id, {
                        crop: [0, 0, 0, 0],
                      })
                    }
                  >
                    {t("props.resetCrop")}
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
                      {t("float.flipH")}
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
                      {t("props.flipV")}
                    </button>
                  </div>
                </>
              ) : null}
              {element.type === "line" ? (
                <label className="eppt-field">
                  <input
                    type="checkbox"
                    aria-label={t("props.arrow")}
                    disabled={disabled}
                    checked={element.arrow ?? false}
                    onChange={(e) =>
                      controller.patch(slideId, element.id, {
                        arrow: e.target.checked,
                      })
                    }
                  />
                  {t("props.arrow")}
                </label>
              ) : null}
              <label className="eppt-field">
                {t("props.opacity")}
                <input
                  aria-label={t("props.opacityLabel")}
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
                {t("props.lock")}
              </label>
              <div className="eppt-prop-title">{t("props.alignTitle")}</div>
              {element.type === "text" ? (
                <>
                  <TextFormatPanel element={element} marks={marks}
                    paragraph={(textEditor && textEditor.selection ? textEditor.children[textEditor.selection.anchor.path[0]] as TextParagraph : element.paragraphs[0]) ?? element.paragraphs[0]}
                    disabled={disabled || !!element.locked} format={format} paragraphFormat={paragraphFormat}
                    setPadding={padding => controller.patch(slideId, element.id, { padding })} />
                  <label className="eppt-field">
                    {t("props.vertical")}
                    <select
                      aria-label={t("props.verticalLabel")}
                      disabled={disabled}
                      value={element.verticalAlign ?? "top"}
                      onChange={(e) =>
                        controller.patch(slideId, element.id, {
                          verticalAlign: e.target.value,
                        })
                      }
                    >
                      <option value="top">{t("props.top")}</option>
                      <option value="middle">{t("props.middle")}</option>
                      <option value="bottom">{t("props.bottom")}</option>
                    </select>
                  </label>
                  <div className="eppt-prop-title">{t("props.paragraph")}</div>
                  <div className="eppt-align">
                    {(["left", "center", "right", "justify"] as const).map(
                      (align, i) => (
                        <button
                          key={align}
                          disabled={disabled}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => paragraphFormat({ align })}
                        >
                          {[t("float.alignLeft"), t("float.alignCenter"), t("float.alignRight"), t("props.justify")][i]}
                        </button>
                      ),
                    )}
                    <button
                      disabled={disabled}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => paragraphFormat({ bullet: true, list: "bullet" })}
                    >
                      {t("props.bullet")}
                    </button>
                    <button
                      disabled={disabled}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => paragraphFormat({ bullet: false, list: "none" })}
                    >
                      {t("props.clearList")}
                    </button>
                  </div>
                </>
              ) : null}
              {element.type === "chart" ? (
                <label className="eppt-field">
                  {t("chart.type")}
                  <select
                    aria-label={t("chart.type")}
                    value={element.chartType}
                    disabled={disabled}
                    onChange={(e) => {
                      if (
                        ["pie", "doughnut"].includes(e.target.value) &&
                        (element.values.some((v) => v < 0) ||
                          !element.values.some((v) => v > 0))
                      ) {
                        setMessage({ key: "alert.pieBlocked" });
                        return;
                      }
                      controller.patch(slideId, element.id, {
                        chartType: e.target.value,
                      });
                    }}
                  >
                    <option value="bar">{t("chart.bar")}</option>
                    <option value="line">{t("chart.line")}</option>
                    <option
                      value="pie"
                      disabled={(element.series?.length ?? 1) > 1}
                    >
                      {t("chart.pieSingle")}
                    </option>
                    <option
                      value="doughnut"
                      disabled={(element.series?.length ?? 1) > 1}
                    >
                      {t("chart.doughnutSingle")}
                    </option>
                  </select>
                </label>
              ) : null}
              {element.type === "shape" || element.type === "line" ? (
                <>
                  <label className="eppt-field">
                    {t("props.borderColor")}
                    <input
                      type="color"
                      aria-label={t("props.borderColor")}
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
                    {t("props.borderWidth")}
                    <input
                      type="number"
                      aria-label={t("props.borderWidth")}
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
                    {[t("props.alignLeft"), t("props.alignCenter"), t("props.alignRight"), t("props.alignTop"), t("props.alignMiddle"), t("props.alignBottom")][i]}
                  </button>
                ))}
              </div>
              {element.type === "table" && (
                <p className="eppt-hint">
                  {t("table.hint")}
                </p>
              )}
            </>
          ) : (
            <div className="eppt-hint">
              {t("props.hintSelect")}
              <br />
              {t("props.hintEdit")}
              <br />
              {t("props.hintShift")}
            </div>
          )}
          {selected.length > 1 ? (
            <>
              <div className="eppt-prop-title">{t("props.multi")}</div>
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
                    {[t("props.alignLeft"), t("props.alignCenter"), t("props.alignRight"), t("props.alignTop"), t("props.alignMiddle"), t("props.alignBottom")][i]}
                  </button>
                ))}
                <button
                  disabled={disabled || selected.length < 3}
                  onClick={() =>
                    controller.distribute(slideId, selected, "horizontal")
                  }
                >
                  {t("props.distributeH")}
                </button>
                <button
                  disabled={disabled || selected.length < 3}
                  onClick={() =>
                    controller.distribute(slideId, selected, "vertical")
                  }
                >
                  {t("props.distributeV")}
                </button>
              </div>
            </>
          ) : null}
          <div className="eppt-page-actions">
            <button
              disabled={disabled || selected.length < 2}
              onClick={() => controller.group(slideId, selected)}
            >
              {t("props.group")}
            </button>
            <button
              disabled={
                disabled || !selected.some((id) => slide?.elements[id]?.groupId)
              }
              onClick={() => controller.ungroup(slideId, selected)}
            >
              {t("props.ungroup")}
            </button>
          </div>
          <details>
            <summary>{t("props.layers")}</summary>
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
                            text: t("props.text"),
                            shape: t("props.shape"),
                            image: t("props.image"),
                            line: t("props.line"),
                            table: t("props.table"),
                            chart: t("props.chart"),
                          }[slide.elements[id].type]
                        ))}
                  {slide.elements[id].locked ? " 🔒" : ""}
                </button>
              ))}
            </div>
          </details>
        </aside>
      </div>
      <footer className="eppt-status">
        <span>
          {selected.length ? t("status.selected", { count: selected.length }) : t("status.ready")} ·{" "}
          {t("status.elementCount", { count: slide?.elementOrder.length ?? 0 })}
        </span>
        <span>{t("status.shortcuts")}</span>
        <span>
          {props.readOnly ? t("status.readonly") : t("status.editing")} · {props.status ?? t("status.ready")}
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
                label: [t("context.front"), t("context.forward"), t("context.backward"), t("context.back")][i],
                disabled,
                run: () => controller.arrange(slideId, contextMenu.ids, action),
              }),
            ),
            {
              label: t("context.copy"),
              separator: true,
              disabled,
              run: () => select(controller.duplicate(slideId, contextMenu.ids)),
            },
            {
              label: t("context.group"),
              disabled: disabled || contextMenu.ids.length < 2,
              run: () => controller.group(slideId, contextMenu.ids),
            },
            {
              label: t("context.ungroup"),
              disabled:
                disabled ||
                !contextMenu.ids.some((id) => slide.elements[id]?.groupId),
              run: () => controller.ungroup(slideId, contextMenu.ids),
            },
            {
              label: contextMenu.ids.every((id) => slide.elements[id]?.locked)
                ? t("context.unlock")
                : t("context.lock"),
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
              label: t("context.format"),
              separator: true,
              run: () => setShowProperties(true),
            },
            {
              label: t("context.delete"),
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
          aria-label={t("present.label")}
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
            {t("present.exit")}
          </button>
          <span className="eppt-present-count">
            <button
              onClick={(e) => {
                e.stopPropagation();
                previousPresentedSlide();
              }}
            >
              {t("present.prev")}
            </button>
            {showOrder.indexOf(slideId) + 1} / {showOrder.length}
            <button
              onClick={(e) => {
                e.stopPropagation();
                next();
              }}
            >
              {t("present.next")}
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                void presentationRoot.current
                  ?.requestFullscreen?.()
                  .catch(() =>
                    setMessage({ key: "alert.noFullscreen" }),
                  );
              }}
            >
              {t("present.fullscreen")}
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
    </I18nProvider>
  );
});
