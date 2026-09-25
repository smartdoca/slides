import { useEffect, useRef, useState } from "react";
import { useT } from "../i18n";
import type { LayoutKind } from "../model/layouts";
export function LayoutPicker({
  disabled,
  onPick,
  collapsed,
  onCollapse,
}: {
  disabled: boolean;
  onPick: (kind: LayoutKind, dark: boolean) => void;
  collapsed: boolean;
  onCollapse: () => void;
}) {
  const [open, setOpen] = useState(false),
    [dark, setDark] = useState(true);
  const t = useT();
  const root = useRef<HTMLDivElement>(null),
    trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (disabled) setOpen(false);
    const dismiss = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", dismiss);
    return () => window.removeEventListener("pointerdown", dismiss);
  }, [disabled]);
  return (
    <div
      className="eppt-slide-create"
      ref={root}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false);
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          setOpen(false);
          trigger.current?.focus();
        }
      }}
    >
      <div className="eppt-split-button">
        <button disabled={disabled} onClick={() => onPick("blank", false)}>
          {t("layout.new")}
        </button>
        <button
          ref={trigger}
          disabled={disabled}
          aria-label={t("layout.choose")}
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          ⌄
        </button>
      </div>
      <button
        className="eppt-collapse-rail"
        aria-label={collapsed ? t("layout.expandRail") : t("layout.collapseRail")}
        onClick={onCollapse}
      >
        {collapsed ? "»" : "«"}
      </button>
      {open && (
        <div
          className="eppt-layout-picker"
          role="group"
          aria-label={t("layout.group")}
        >
          <div className="eppt-picker-heading">
            <span>{t("layout.heading")}</span>
            <div>
              <button aria-pressed={dark} onClick={() => setDark(true)}>
                {t("layout.dark")}
              </button>
              <button aria-pressed={!dark} onClick={() => setDark(false)}>
                {t("layout.light")}
              </button>
            </div>
          </div>
          <div className="eppt-layout-grid">
            {(["blank", "cover", "agenda", "columns"] as const).map(
              (kind, i) => (
                <button
                  key={kind}
                  onClick={() => {
                    onPick(kind, dark);
                    setOpen(false);
                  }}
                >
                  <div
                    className={
                      "eppt-layout-sample " + (dark ? "dark" : "light")
                    }
                  >
                    {kind !== "blank" && (
                      <>
                        <b>
                          {kind === "agenda"
                            ? t("layout.sampleAgenda")
                            : kind === "cover"
                              ? t("layout.sampleTitle")
                              : t("layout.sampleColumns")}
                        </b>
                        {kind === "agenda" ? (
                          <div className="sample-agenda">
                            {Array.from({ length: 6 }, (_, i) => (
                              <span key={i}>
                                <i>{i + 1}</i>
                                {t("layout.sampleAgendaItem")}
                              </span>
                            ))}
                          </div>
                        ) : kind === "columns" ? (
                          <div className="sample-columns">
                            <span>
                              {t("layout.sampleTopic1")}
                              <hr />
                              <hr />
                              <hr />
                            </span>
                            <span>
                              {t("layout.sampleTopic2")}
                              <hr />
                              <hr />
                              <hr />
                            </span>
                          </div>
                        ) : (
                          <small>{t("layout.sampleSubtitle")}</small>
                        )}
                      </>
                    )}
                  </div>
                  <span>
                    {
                      [
                        t("layout.blank"),
                        t("layout.cover"),
                        t("layout.agenda"),
                        t("layout.columns"),
                      ][i]
                    }
                  </span>
                </button>
              ),
            )}
          </div>
          <p>{t("layout.note")}</p>
        </div>
      )}
    </div>
  );
}
