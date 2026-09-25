import { Fragment, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  noticeFromError,
  phraseText,
  useT,
  type Phrase,
} from "../i18n";
import type { PresentationDocument } from "../model/types";
import { emuToPx } from "../model/types";
import type { EditorController } from "../model/controller";
import { SlidePreview } from "./SlidePreview";
import { CommitInput } from "./CommitInput";
import { slideOutline } from "../model/slides";
import { createPortal } from "react-dom";
import { ToolIcon } from "./InsertPalette";
import { SectionHeading } from "./SectionHeading";

type SlideDrop = {
  id: string;
  after: boolean;
  sectionId: string | null;
  heading?: boolean;
};

export function SlideRail({
  value,
  active,
  disabled,
  controller,
  select,
  resolveAsset,
  collapsed,
  toolbarContainer,
  onReveal,
}: {
  value: PresentationDocument;
  active: string;
  disabled: boolean;
  controller: EditorController;
  select: (id: string) => void;
  resolveAsset?: (id: string) => string;
  collapsed: boolean;
  toolbarContainer?: HTMLElement | null;
  onReveal?: () => void;
}) {
  const pane = useRef<HTMLElement>(null);
  const [picked, setPicked] = useState<string[]>([active]);
  const pickedIds = value.slideOrder.filter((id) => picked.includes(id));
  const anchor = useRef(active);
  const [outline, setOutline] = useState(false);
  const [folded, setFolded] = useState<string[]>([]);
  const [sectionEditor, setSectionEditor] = useState<{
    anchorId: string;
    ids: string[];
    name: string;
  } | null>(null);
  const sectionFormRef = useRef<HTMLFormElement>(null);
  useLayoutEffect(() => {
    if (sectionEditor)
      sectionFormRef.current?.scrollIntoView({ block: "nearest" });
  }, [sectionEditor?.anchorId, collapsed]);
  useEffect(() => {
    setPicked((ids) =>
      ids.includes(active)
        ? ids.filter((id) => value.slides[id])
        : active
          ? [active]
          : [],
    );
    const section = value.slides[active]?.sectionId;
    if (section) setFolded((ids) => ids.filter((id) => id !== section));
  }, [active]);
  const choose = (
    id: string,
    modifiers: {
      shiftKey?: boolean;
      metaKey?: boolean;
      ctrlKey?: boolean;
    } = {},
  ) => {
    let next: string[];
    if (modifiers.shiftKey) {
      const a = Math.max(0, value.slideOrder.indexOf(anchor.current));
      const b = value.slideOrder.indexOf(id);
      const range = value.slideOrder.slice(Math.min(a, b), Math.max(a, b) + 1);
      next =
        modifiers.metaKey || modifiers.ctrlKey
          ? [...new Set([...pickedIds, ...range])]
          : range;
    } else if (modifiers.metaKey || modifiers.ctrlKey) {
      next = pickedIds.includes(id)
        ? pickedIds.filter((item) => item !== id)
        : [...pickedIds, id];
      if (!next.length) next = [id];
      anchor.current = id;
    } else {
      next = [id];
      anchor.current = id;
    }
    setPicked(next);
    select(next.includes(id) ? id : next.at(-1)!);
  };
  const targets = (id: string) => (pickedIds.includes(id) ? pickedIds : [id]);
  const safely = (action: () => void) => {
    try {
      action();
    } catch (error) {
      setNotice(noticeFromError(error));
    }
  };
  const duplicate = (ids: string[]) =>
    safely(() => {
      const copies = controller.duplicateSlides(ids);
      if (copies.length) {
        setPicked(copies);
        select(copies[0]);
        setNotice({ key: "rail.duplicated", vars: { count: copies.length } });
      }
    });
  const remove = (ids: string[]) => {
    const index = value.slideOrder.indexOf(ids[0]),
      remaining = value.slideOrder.filter((id) => !ids.includes(id));
    controller.deleteSlides(ids);
    const next = remaining[Math.min(Math.max(0, index), remaining.length - 1)];
    setPicked(next ? [next] : []);
    if (next) select(next);
    setNotice({ key: "rail.deleted", vars: { count: ids.length } });
  };
  const [thumbnailWidth, setThumbnailWidth] = useState(160);
  useLayoutEffect(() => {
    const root = pane.current;
    if (!root || collapsed) return;
    const measure = () => {
      const width = root.querySelector<HTMLElement>(".eppt-thumb")?.clientWidth;
      if (width) setThumbnailWidth(width);
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    return () => observer.disconnect();
  }, [collapsed, value.slideOrder.length, outline]);
  const [visible, setVisible] = useState<Set<string>>(() => new Set());
  // Keep lightweight rows for accessible keyboard navigation and drag targets;
  // mount expensive previews only near the viewport, including on scroll back.
  const orderKey = JSON.stringify(value.slideOrder);
  useEffect(() => {
    const root = pane.current;
    if (!root || collapsed || typeof IntersectionObserver === "undefined")
      return;
    const observer = new IntersectionObserver(
      (entries) => {
        setVisible((previous) => {
          const next = new Set(previous);
          for (const entry of entries) {
            const id = (entry.target as HTMLElement).dataset.slideId!;
            if (entry.isIntersecting) next.add(id);
            else next.delete(id);
          }
          return next;
        });
      },
      { root, rootMargin: "240px 0px" },
    );
    root
      .querySelectorAll("[data-slide-id]")
      .forEach((row) => observer.observe(row));
    return () => observer.disconnect();
  }, [orderKey, collapsed, outline, folded]);
  const [drag, setDrag] = useState<string | null>(null);
  const [drop, setDrop] = useState<SlideDrop | null>(null);
  const [menu, setMenu] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const popup = menuRef.current;
    const row = popup?.parentElement;
    if (!popup || !row) return;
    const r = row.getBoundingClientRect();
    popup.style.left = `${Math.max(8, Math.min(r.left + 20, window.innerWidth - popup.offsetWidth - 8))}px`;
    popup.style.top = `${Math.max(8, Math.min(r.bottom - 8, window.innerHeight - popup.offsetHeight - 8))}px`;
    popup.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
  }, [menu]);
  const [notice, setNotice] = useState<Phrase | null>(null);
  const t = useT();
  const [renaming, setRenaming] = useState<string | null>(null);
  const scrollSpeed = useRef(0);
  const pointerDrag = useRef<{
    id: string;
    startX: number;
    startY: number;
    x: number;
    y: number;
    moving: boolean;
    target: SlideDrop | null;
  } | null>(null);
  const suppressClick = useRef(false);
  const locateDrop = (x: number, y: number) => {
    const bounds = pane.current?.getBoundingClientRect();
    if (
      !bounds ||
      x < bounds.left ||
      x > bounds.right ||
      y < bounds.top ||
      y > bounds.bottom
    )
      return null;
    const rows = Array.from(
      pane.current!.querySelectorAll<HTMLElement>(
        "[data-slide-id], [data-section-start]",
      ),
    ).filter((row) => !row.hidden);
    const row =
      rows.find((row) => y < row.getBoundingClientRect().bottom) ?? rows.at(-1);
    if (!row) return null;
    const r = row.getBoundingClientRect();
    scrollSpeed.current =
      y < bounds.top + 45 ? -7 : y > bounds.bottom - 45 ? 7 : 0;
    if (row.dataset.sectionStart)
      return {
        id: row.dataset.sectionStart,
        after: false,
        sectionId: row.dataset.sectionId!,
        heading: true,
      };
    const id = row.dataset.slideId!;
    return {
      id,
      after: y > r.top + r.height / 2,
      sectionId: value.slides[id]?.sectionId ?? null,
    };
  };
  const finish = () => {
    pointerDrag.current = null;
    setDrag(null);
    setDrop(null);
    scrollSpeed.current = 0;
  };
  useEffect(() => {
    if (disabled) {
      finish();
      setMenu(null);
      setRenaming(null);
      setSectionEditor(null);
    }
  }, [disabled]);
  useEffect(() => {
    if (!drag) return;
    let raf: number;
    const tick = () => {
      if (pane.current) pane.current.scrollTop += scrollSpeed.current;
      const p = pointerDrag.current;
      if (p?.moving && scrollSpeed.current) {
        p.target = locateDrop(p.x, p.y);
        setDrop(p.target);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [drag]);
  useEffect(() => {
    if (!menu) return;
    const dismiss = (e: PointerEvent) => {
      if (
        !(e.target as HTMLElement).closest(".eppt-slide-menu,.eppt-slide-more")
      )
        setMenu(null);
    };
    window.addEventListener("pointerdown", dismiss);
    return () => window.removeEventListener("pointerdown", dismiss);
  }, [menu]);
  useEffect(() => {
    pane.current
      ?.querySelector('[aria-current="page"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [active]);
  const width = emuToPx(value.size.width),
    height = emuToPx(value.size.height);
  const focus = (id: string) =>
    requestAnimationFrame(() =>
      pane.current
        ?.querySelector<HTMLButtonElement>(
          `[data-slide-id="${CSS.escape(id)}"] .eppt-thumb`,
        )
        ?.focus(),
    );
  const move = (
    id: string,
    before: string | null,
    sectionId?: string | null,
  ) => {
    safely(() => {
      controller.moveSlidesBefore(targets(id), before, sectionId);
      if (sectionId) setFolded((ids) => ids.filter((id) => id !== sectionId));
      setNotice(
        sectionId
          ? {
              key: "rail.moved",
              vars: {
                name: value.sections?.[sectionId] ?? t("rail.unnamed"),
              },
            }
          : { key: "rail.reordered" },
      );
    });
  };
  return (
    <aside
      ref={pane}
      className={"eppt-slides " + (collapsed ? "is-collapsed" : "")}
      aria-label={t("rail.list")}
      onScroll={() => setMenu(null)}
      onKeyDown={(e) => {
        if (
          (e.target as HTMLElement).closest(
            'input,textarea,select,[contenteditable="true"]',
          )
        )
          return;
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "a") {
          e.preventDefault();
          e.stopPropagation();
          setPicked([...value.slideOrder]);
          return;
        }
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "d") {
          e.preventDefault();
          e.stopPropagation();
          if (!disabled) duplicate(pickedIds);
          return;
        }
        if (["Delete", "Backspace"].includes(e.key)) {
          e.preventDefault();
          e.stopPropagation();
          if (!disabled) remove(pickedIds);
        }
      }}
    >
      <span className="eppt-sr-only" role="status">
        {phraseText(t, notice)}
      </span>
      {!collapsed && (
        <>
          <div className="eppt-rail-views" role="group" aria-label={t("rail.views")}>
            <button aria-pressed={!outline} onClick={() => setOutline(false)}>
              {t("rail.slides")}
            </button>
            <button aria-pressed={outline} onClick={() => setOutline(true)}>
              {t("rail.outline")}
            </button>
          </div>
          <p className="eppt-rail-help">
            {t("rail.help", { count: pickedIds.length })}
          </p>
        </>
      )}
      {toolbarContainer &&
        createPortal(
          <>
            <button
              className="eppt-insert-tool"
              title={t("rail.copyTitle", { count: pickedIds.length })}
              disabled={disabled || !pickedIds.length}
              onClick={() => duplicate(pickedIds)}
            >
              <ToolIcon kind="copySlides" />
              <span>{t("rail.copy")}</span>
            </button>
            <button
              className="eppt-insert-tool"
              title={t("rail.newSectionTitle")}
              disabled={disabled || !pickedIds.length}
              onClick={() => {
                onReveal?.();
                setSectionEditor({
                  anchorId: pickedIds[0],
                  ids: pickedIds,
                  name: t("rail.sectionDefault"),
                });
              }}
            >
              <ToolIcon kind="section" />
              <span>{t("rail.newSection")}</span>
            </button>
          </>,
          toolbarContainer,
        )}
      {value.slideOrder.map((id, index) => (
        <Fragment key={id}>
          {!collapsed && sectionEditor?.anchorId === id && (
            <form
              ref={sectionFormRef}
              className="eppt-section-form"
              aria-label={t("rail.createSection")}
              onSubmit={(e) => {
                e.preventDefault();
                if (disabled) return;
                safely(() => {
                  controller.createSection(
                    sectionEditor.name,
                    sectionEditor.ids,
                  );
                  setSectionEditor(null);
                  setNotice({ key: "rail.created" });
                });
              }}
            >
              <label>
                {t("rail.createSection")}
                <input
                  aria-label={t("rail.sectionName")}
                  autoFocus
                  maxLength={200}
                  value={sectionEditor.name}
                  onChange={(e) =>
                    setSectionEditor({ ...sectionEditor, name: e.target.value })
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      e.stopPropagation();
                      setSectionEditor(null);
                    }
                  }}
                />
              </label>
              <div className="eppt-section-form-actions">
                <button type="button" onClick={() => setSectionEditor(null)}>
                  {t("rail.cancel")}
                </button>
                <button
                  className="eppt-section-confirm"
                  disabled={disabled || !sectionEditor.name.trim()}
                  type="submit"
                >
                  {t("rail.create")}
                </button>
              </div>
            </form>
          )}
          {!collapsed &&
            value.slides[id].sectionId &&
            value.slides[id].sectionId !==
              value.slides[value.slideOrder[index - 1]]?.sectionId && (
              <SectionHeading
                id={value.slides[id].sectionId!}
                startId={id}
                name={
                  value.sections?.[value.slides[id].sectionId!] ?? t("rail.unnamed")
                }
                folded={folded.includes(value.slides[id].sectionId!)}
                disabled={disabled}
                dropping={!!drop?.heading && drop.id === id}
                onToggle={() =>
                  setFolded((ids) =>
                    ids.includes(value.slides[id].sectionId!)
                      ? ids.filter(
                          (section) => section !== value.slides[id].sectionId,
                        )
                      : [...ids, value.slides[id].sectionId!],
                  )
                }
                onRename={(name) =>
                  controller.renameSection(value.slides[id].sectionId!, name)
                }
                onDelete={() =>
                  safely(() => {
                    controller.deleteSection(value.slides[id].sectionId!);
                    setNotice({ key: "rail.sectionDeleted" });
                    focus(id);
                  })
                }
              />
            )}
          <div
            key={id}
            data-slide-id={id}
            hidden={
              !!value.slides[id].sectionId &&
              folded.includes(value.slides[id].sectionId!)
            }
            className={
              "eppt-slide-row " +
              (drag === id ? "dragging " : "") +
              (drop?.id === id && !drop.heading
                ? drop.after
                  ? "drop-after"
                  : "drop-before"
                : "")
            }
            onContextMenu={(e) => {
              e.preventDefault();
              if (!pickedIds.includes(id)) choose(id);
              setMenu(id);
            }}
          >
            <span
              className={
                "eppt-slide-number" +
                (value.slides[id].hidden ? " is-hidden-slide" : "")
              }
            >
              {index + 1}
            </span>
            <button
              className={
                "eppt-thumb " +
                (pickedIds.includes(id) ? "selected " : "") +
                (outline ? "is-outline " : "")
              }
              aria-label={
                value.slides[id].name
                  ? t("rail.slideNamed", {
                      index: index + 1,
                      name: value.slides[id].name,
                    })
                  : t("rail.slide", { index: index + 1 })
              }
              aria-current={active === id ? "page" : undefined}
              aria-pressed={pickedIds.includes(id)}
              draggable={false}
              onPointerDown={(e) => {
                if (disabled || e.button !== 0) return;
                if (e.shiftKey || e.metaKey || e.ctrlKey) return;
                if (!pickedIds.includes(id)) choose(id);
                pointerDrag.current = {
                  id,
                  startX: e.clientX,
                  startY: e.clientY,
                  x: e.clientX,
                  y: e.clientY,
                  moving: false,
                  target: null,
                };
                suppressClick.current = false;
              }}
              onPointerMove={(e) => {
                const p = pointerDrag.current;
                if (!p || disabled) return;
                p.x = e.clientX;
                p.y = e.clientY;
                if (!p.moving && Math.hypot(p.x - p.startX, p.y - p.startY) < 6)
                  return;
                if (!p.moving) {
                  p.moving = true;
                  setDrag(p.id);
                  setMenu(null);
                  e.currentTarget.setPointerCapture(e.pointerId);
                }
                p.target = locateDrop(p.x, p.y);
                setDrop(p.target);
                if (!p.target) scrollSpeed.current = 0;
              }}
              onPointerUp={(e) => {
                const p = pointerDrag.current;
                if (p?.moving) {
                  suppressClick.current = true;
                  if (!disabled && p.target) {
                    const before = p.target.after
                      ? (value.slideOrder[
                          value.slideOrder.indexOf(p.target.id) + 1
                        ] ?? null)
                      : p.target.id;
                    move(p.id, before, p.target.sectionId);
                  }
                }
                if (e.currentTarget.hasPointerCapture(e.pointerId))
                  e.currentTarget.releasePointerCapture(e.pointerId);
                finish();
              }}
              onPointerCancel={finish}
              onLostPointerCapture={finish}
              onClick={(e) => {
                if (suppressClick.current) {
                  suppressClick.current = false;
                  return;
                }
                choose(id, e);
                setMenu(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setMenu(null);
                  finish();
                  return;
                }
                if (e.key === "F2" && !disabled) {
                  e.preventDefault();
                  setRenaming(id);
                  return;
                }
                if (e.shiftKey && e.key === "F10") {
                  e.preventDefault();
                  setMenu(id);
                  return;
                }
                if (!["ArrowUp", "ArrowDown", "Home", "End"].includes(e.key))
                  return;
                e.preventDefault();
                const direction = e.key === "ArrowUp" ? -1 : 1;
                if (e.altKey && !disabled && e.key.startsWith("Arrow")) {
                  controller.moveSlide(id, direction);
                  setNotice({ key: "rail.reordered" });
                } else {
                  const target =
                    e.key === "Home"
                      ? 0
                      : e.key === "End"
                        ? value.slideOrder.length - 1
                        : Math.max(
                            0,
                            Math.min(
                              value.slideOrder.length - 1,
                              index + direction,
                            ),
                          );
                  choose(value.slideOrder[target], e);
                  focus(value.slideOrder[target]);
                }
              }}
              title={t("rail.dragHint")}
            >
              {outline ? (
                <div className="eppt-outline-content">
                  <strong>
                    {value.slides[id].name ??
                      slideOutline(value.slides[id])[0] ??
                      t("rail.blank")}
                  </strong>
                  {slideOutline(value.slides[id])
                    .slice(value.slides[id].name ? 0 : 1)
                    .map((line, i) => (
                      <span key={i}>{line}</span>
                    ))}
                </div>
              ) : (
                <div
                  className="eppt-thumbnail"
                  style={{ aspectRatio: `${width}/${height}` }}
                >
                  <div
                    style={{
                      width,
                      height,
                      transform: `scale(${thumbnailWidth / width})`,
                      transformOrigin: "0 0",
                    }}
                  >
                    {!collapsed &&
                      (visible.has(id) ||
                        active === id ||
                        typeof IntersectionObserver === "undefined") && (
                        <SlidePreview
                          document={value}
                          slide={value.slides[id]}
                          resolveAsset={resolveAsset}
                        />
                      )}
                  </div>
                </div>
              )}
              {value.slides[id].hidden && (
                <span className="eppt-hidden-badge">{t("rail.hidden")}</span>
              )}
            </button>
            {!collapsed && (
              <button
                className="eppt-slide-more"
                aria-label={t("rail.pageMenu", { index: index + 1 })}
                aria-expanded={menu === id}
                onClick={() => {
                  if (!pickedIds.includes(id)) choose(id);
                  setMenu(menu === id ? null : id);
                }}
              >
                •••
              </button>
            )}
            {renaming === id && (
              <div className="eppt-rename">
                <CommitInput
                  autoFocus
                  aria-label={t("rail.pageName")}
                  value={
                    value.slides[id].name ??
                    t("rail.slide", { index: index + 1 })
                  }
                  onBlur={() => setRenaming(null)}
                  onCommit={(name) => {
                    controller.slideProperty(
                      id,
                      "name",
                      name.trim() || t("rail.slide", { index: index + 1 }),
                    );
                    setRenaming(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      e.preventDefault();
                      e.stopPropagation();
                      setRenaming(null);
                      focus(id);
                    }
                  }}
                />
              </div>
            )}
            {menu === id && !collapsed && (
              <div
                ref={menuRef}
                className="eppt-slide-menu"
                role="menu"
                aria-label={t("rail.pageActions")}
                onKeyDown={(e) => {
                  if (["ArrowUp", "ArrowDown", "Home", "End"].includes(e.key)) {
                    e.preventDefault();
                    e.stopPropagation();
                    const buttons = Array.from(
                      e.currentTarget.querySelectorAll<HTMLButtonElement>(
                        "button:not(:disabled)",
                      ),
                    );
                    const current = buttons.indexOf(
                      document.activeElement as HTMLButtonElement,
                    );
                    const next =
                      e.key === "Home"
                        ? 0
                        : e.key === "End"
                          ? buttons.length - 1
                          : (current +
                              (e.key === "ArrowUp" ? -1 : 1) +
                              buttons.length) %
                            buttons.length;
                    buttons[next]?.focus();
                  }
                  if (e.key === "Escape") {
                    e.stopPropagation();
                    setMenu(null);
                    focus(id);
                  }
                }}
              >
                <button
                  role="menuitem"
                  disabled={disabled}
                  onClick={() => {
                    duplicate(targets(id));
                    setMenu(null);
                  }}
                >
                  {t("rail.duplicate")}
                  {targets(id).length > 1
                    ? t("rail.pageCount", { count: targets(id).length })
                    : ""}{" "}
                  <kbd>⌘D</kbd>
                </button>
                <button
                  role="menuitem"
                  disabled={disabled}
                  onClick={() => {
                    setRenaming(id);
                    setMenu(null);
                  }}
                >
                  {t("rail.rename")} <kbd>F2</kbd>
                </button>
                <hr />
                <button
                  role="menuitem"
                  disabled={disabled}
                  onClick={() => {
                    controller.setSlidesHidden(
                      targets(id),
                      !targets(id).every((sid) => value.slides[sid].hidden),
                    );
                    setMenu(null);
                  }}
                >
                  {targets(id).every((sid) => value.slides[sid].hidden)
                    ? t("rail.unhide")
                    : t("rail.hide")}
                </button>
                <button
                  role="menuitem"
                  disabled={disabled}
                  onClick={() => {
                    setSectionEditor({
                      anchorId: targets(id)[0],
                      ids: targets(id),
                      name: t("rail.sectionDefault"),
                    });
                    setMenu(null);
                  }}
                >
                  {t("rail.newSectionFrom")}
                </button>
                <label className="eppt-section-assign">
                  {t("rail.moveTo")}
                  <select
                    aria-label={t("rail.moveTo")}
                    disabled={disabled}
                    value=""
                    onChange={(e) => {
                      controller.assignSection(
                        targets(id),
                        e.target.value === "__none" ? null : e.target.value,
                      );
                      setMenu(null);
                    }}
                  >
                    <option value="" disabled>
                      {t("rail.chooseSection")}
                    </option>
                    <option value="__none">{t("rail.leaveSection")}</option>
                    {Object.entries(value.sections ?? {}).map(
                      ([sectionId, name]) => (
                        <option key={sectionId} value={sectionId}>
                          {name}
                        </option>
                      ),
                    )}
                  </select>
                </label>
                <hr />
                <button
                  role="menuitem"
                  disabled={disabled || index === 0}
                  onClick={() => {
                    move(id, value.slideOrder[0]);
                    setMenu(null);
                  }}
                >
                  {t("rail.toStart")}
                </button>
                <button
                  role="menuitem"
                  disabled={disabled || index === value.slideOrder.length - 1}
                  onClick={() => {
                    move(id, null);
                    setMenu(null);
                  }}
                >
                  {t("rail.toEnd")}
                </button>
                <hr />
                <button
                  role="menuitem"
                  className="eppt-danger"
                  disabled={disabled}
                  onClick={() => {
                    remove(targets(id));
                    setMenu(null);
                    setNotice({ key: "rail.deletedUndo" });
                  }}
                >
                  {t("rail.delete")}
                  {targets(id).length > 1
                    ? t("rail.pageCount", { count: targets(id).length })
                    : ""}
                </button>
              </div>
            )}
          </div>
        </Fragment>
      ))}
      {!collapsed && (
        <button
          className="eppt-add-slide"
          disabled={disabled}
          onClick={() => select(controller.addSlide(active))}
        >
          {t("rail.add")}
        </button>
      )}
    </aside>
  );
}
