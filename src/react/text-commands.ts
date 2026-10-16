import { Editor, Element, Range, Text, Transforms } from "slate";
import { YjsEditor } from "@slate-yjs/core";
import type { EditorController } from "../model/controller";
import {
  stepFontSize,
  type CharacterStyle,
  type ParagraphStyle,
} from "../model/styles";

/** A toolbar action is an undo boundary, not part of the adjacent typing burst. */
export function runTextCommand(
  editor: Editor,
  controller: EditorController,
  action: () => void,
) {
  if (controller.isReadOnly) return;
  const shared = YjsEditor.isYjsEditor(editor);
  if (shared) YjsEditor.flushLocalChanges(editor);
  controller.history.stopCapturing();
  try {
    Editor.withoutNormalizing(editor, action);
    if (shared) YjsEditor.flushLocalChanges(editor);
  } finally {
    controller.history.stopCapturing();
  }
}

export function applyTextStyle(
  editor: Editor,
  controller: EditorController,
  marks: CharacterStyle,
  paragraph?: ParagraphStyle,
  paragraphAtCaret = false,
) {
  if (!editor.selection) return;
  runTextCommand(editor, controller, () => {
    const caret =
      paragraphAtCaret && Range.isCollapsed(editor.selection!)
        ? Editor.rangeRef(editor, editor.selection!)
        : null;
    try {
      if (caret) {
        const block = Editor.above(editor, {
          match: (node) => Element.isElement(node),
        });
        if (block) Transforms.select(editor, Editor.range(editor, block[1]));
      }
      for (const [key, value] of Object.entries(marks))
        Editor.addMark(editor, key, value);
      if (paragraph)
        Transforms.setNodes(editor, paragraph as Partial<Element>, {
          match: (node) => Element.isElement(node),
        });
    } finally {
      const restored = caret?.unref();
      if (restored) Transforms.select(editor, restored);
    }
  });
}

export function stepSelectedTextSize(
  editor: Editor,
  controller: EditorController,
  direction: 1 | -1,
  increment?: number,
) {
  if (!editor.selection) return;
  runTextCommand(editor, controller, () => {
    if (Range.isCollapsed(editor.selection!)) {
      Editor.addMark(
        editor,
        "fontSize",
        stepFontSize(
          (Editor.marks(editor) as { fontSize?: number } | null)?.fontSize ??
            24,
          direction,
          increment,
        ),
      );
      return;
    }
    const selection = editor.selection!;
    const leaves = [
      ...Editor.nodes(editor, { at: selection, match: Text.isText }),
    ];
    for (const [node, path] of leaves.reverse()) {
      const range = Range.intersection(selection, Editor.range(editor, path));
      if (range && !Range.isCollapsed(range))
        Transforms.setNodes(
          editor,
          {
            fontSize: stepFontSize(
              (node as Text & { fontSize?: number }).fontSize ?? 24,
              direction,
              increment,
            ),
          } as Partial<Text>,
          { at: range, match: Text.isText, split: true },
        );
    }
  });
}
