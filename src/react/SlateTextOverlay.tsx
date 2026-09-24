import { useEffect, useMemo } from "react";
import { createEditor, Editor, Transforms, type Descendant } from "slate";
import {
  Editable,
  Slate,
  withReact,
  ReactEditor,
  type RenderElementProps,
  type RenderLeafProps,
} from "slate-react";
import { withYjs, YjsEditor } from "@slate-yjs/core";
import type * as Y from "yjs";
import { LocalTextOrigin } from "../collaboration/origins";
import { leafStyle, paragraphStyle } from "./text";
import { paragraphMarkers } from "../model/text-format";
import type { TextLeaf, TextParagraph } from "../model/types";

export function SlateTextOverlay({
  sharedText,
  onDone,
  onUndo,
  onRedo,
  onFormat,
  verticalAlign = "top",
  padding = 0,
}: {
  sharedText: Y.XmlText;
  onDone(): void;
  onUndo(): void;
  onRedo(): void;
  onFormat?: (editor: Editor | null) => void;
  verticalAlign?: "top" | "middle" | "bottom";
  padding?: number;
}) {
  const editor = useMemo(
    () =>
      withYjs(withReact(createEditor()), sharedText, {
        localOrigin: new LocalTextOrigin(),
      }),
    [sharedText],
  );
  useEffect(() => {
    YjsEditor.connect(editor);
    // Connecting populates the shared content after Editable's initial focus.
    // Establish a view-only caret so the first toolbar command has a range.
    if (!editor.selection && editor.children.length)
      Transforms.select(editor, Editor.end(editor, []));
    onFormat?.(editor);
    return () => {
      YjsEditor.disconnect(editor);
      onFormat?.(null);
    };
  }, [editor]);
  return (
    <Slate
      editor={editor}
      initialValue={
        [
          { type: "paragraph", children: [{ text: "" }] },
        ] as unknown as Descendant[]
      }
      onChange={() => onFormat?.(editor)}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          height: "100%",
          padding,
          boxSizing: "border-box",
          justifyContent:
            verticalAlign === "middle"
              ? "center"
              : verticalAlign === "bottom"
                ? "flex-end"
                : "flex-start",
        }}
      >
        <Editable
          aria-label="幻灯片文本编辑"
          autoFocus
          spellCheck={false}
          style={{
            outline: "none",
            width: "100%",
            height: verticalAlign === "top" ? "100%" : undefined,
            flexShrink: 0,
            lineHeight: 1.2,
            overflowWrap: "break-word",
          }}
          renderLeaf={({ attributes, children, leaf }: RenderLeafProps) => (
            <span {...attributes} style={leafStyle(leaf as TextLeaf)}>
              {children}
            </span>
          )}
          renderElement={({
            attributes,
            children,
            element,
          }: RenderElementProps) => (
            <div
              {...attributes}
              style={paragraphStyle(element as TextParagraph)}
            >
              {paragraphMarkers(editor.children as TextParagraph[])[
                ReactEditor.findPath(editor, element)[0]
              ] ? (
                <span
                  contentEditable={false}
                  style={{
                    position: "absolute",
                    left: 0,
                    width:
                      ((element as TextParagraph).indentLevel ?? 0) * 28 + 30,
                    textAlign: "right",
                    whiteSpace: "nowrap",
                    userSelect: "none",
                  }}
                >
                  {
                    paragraphMarkers(editor.children as TextParagraph[])[
                      ReactEditor.findPath(editor, element)[0]
                    ]
                  }{" "}
                </span>
              ) : null}
              {children}
            </div>
          )}
          onKeyDown={(event) => {
            if (event.key === "Tab") {
              event.preventDefault();
              for (const [node, path] of Editor.nodes(editor, {
                match: (n) => "type" in n && n.type === "paragraph",
              })) {
                const p = node as TextParagraph;
                Transforms.setNodes(
                  editor,
                  {
                    indentLevel: Math.max(
                      0,
                      Math.min(
                        8,
                        (p.indentLevel ?? 0) + (event.shiftKey ? -1 : 1),
                      ),
                    ),
                  } as Partial<TextParagraph>,
                  { at: path },
                );
              }
              return;
            }
            if (event.key === "Escape") {
              event.preventDefault();
              onDone();
            }
            if (!(event.metaKey || event.ctrlKey)) return;
            const key = event.key.toLowerCase();
            if (key === "z" || key === "y") {
              event.preventDefault();
              YjsEditor.flushLocalChanges(editor);
              if (key === "y" || event.shiftKey) onRedo();
              else onUndo();
            }
            const mark = ({ b: "bold", i: "italic", u: "underline" } as const)[
              key as "b"
            ];
            if (mark) {
              event.preventDefault();
              Editor.addMark(
                editor,
                mark,
                !(Editor.marks(editor) as TextLeaf | null)?.[mark],
              );
            }
            if (key === "a") {
              event.preventDefault();
              Transforms.select(editor, Editor.range(editor, []));
            }
          }}
        />
      </div>
    </Slate>
  );
}
