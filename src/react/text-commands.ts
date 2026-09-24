import { Editor } from "slate";
import { YjsEditor } from "@slate-yjs/core";
import type { EditorController } from "../model/controller";

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
