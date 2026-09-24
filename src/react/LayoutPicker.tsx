import { useEffect, useRef, useState } from "react";
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
          ＋ 新建幻灯片
        </button>
        <button
          ref={trigger}
          disabled={disabled}
          aria-label="选择新幻灯片版式"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          ⌄
        </button>
      </div>
      <button
        className="eppt-collapse-rail"
        aria-label={collapsed ? "展开幻灯片列表" : "收起幻灯片列表"}
        onClick={onCollapse}
      >
        {collapsed ? "»" : "«"}
      </button>
      {open && (
        <div
          className="eppt-layout-picker"
          role="group"
          aria-label="新幻灯片版式"
        >
          <div className="eppt-picker-heading">
            <span>新建幻灯片</span>
            <div>
              <button aria-pressed={dark} onClick={() => setDark(true)}>
                深色
              </button>
              <button aria-pressed={!dark} onClick={() => setDark(false)}>
                浅色
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
                            ? "目录"
                            : kind === "cover"
                              ? "演示文稿标题"
                              : "标题和描述"}
                        </b>
                        {kind === "agenda" ? (
                          <div className="sample-agenda">
                            {Array.from({ length: 6 }, (_, i) => (
                              <span key={i}>
                                <i>{i + 1}</i>目录标题
                              </span>
                            ))}
                          </div>
                        ) : kind === "columns" ? (
                          <div className="sample-columns">
                            <span>
                              主题标题一
                              <hr />
                              <hr />
                              <hr />
                            </span>
                            <span>
                              主题标题二
                              <hr />
                              <hr />
                              <hr />
                            </span>
                          </div>
                        ) : (
                          <small>点击编辑副标题</small>
                        )}
                      </>
                    )}
                  </div>
                  <span>{["空白", "封面", "目录", "双栏内容"][i]}</span>
                </button>
              ),
            )}
          </div>
          <p>插入可编辑内容，不改变已有幻灯片</p>
        </div>
      )}
    </div>
  );
}
