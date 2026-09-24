import { it, expect } from "vitest";
import { createYDocument } from "./yjs-codec";
import { createPresentation } from "../model/create";
import { EditorController } from "../model/controller";
it("opening and readonly toggles remain idle for a real 60-second interval", async () => {
  const doc = createYDocument(createPresentation()),
    controller = new EditorController(doc);
  let updates = 0;
  doc.on("update", () => updates++);
  controller.setReadOnly(true);
  controller.setReadOnly(false);
  await new Promise((resolve) => setTimeout(resolve, 60000));
  expect(updates).toBe(0);
  controller.dispose();
  doc.destroy();
}, 65000);
