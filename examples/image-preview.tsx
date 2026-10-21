import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  PresentationWorkspace,
  createPresentation,
  createYDocument,
  EditorController,
  readDocument,
  pxToEmu,
  type PresentationImagePreviewEvent,
} from "../src";
import "../src/react/styles.css";

// Synthetic content only. A production host resolves these stable asset IDs through its ACL.
const urls = new Map<string, string>();
const model = createPresentation(),
  first = model.slideOrder[0],
  document = createYDocument(model),
  controller = new EditorController(document),
  second = controller.addSlide();
controller.remove(first, readDocument(document).slides[first].elementOrder);
controller.remove(second, readDocument(document).slides[second].elementOrder);
for (const [slideId, id, x, color] of [
  [first, "one", 160, "#3370ff"],
  [first, "two", 680, "#ad6f37"],
  [second, "three", 160, "#32836c"],
] as const) {
  controller.insert(slideId, {
    id,
    type: "image",
    assetId: `asset-${id}`,
    alt: `Image ${id}`,
    transform: {
      x: pxToEmu(x),
      y: pxToEmu(150),
      width: pxToEmu(400),
      height: pxToEmu(300),
      rotation: 0,
    },
  });
  urls.set(
    `asset-${id}`,
    "data:image/svg+xml," +
      encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect width="800" height="600" fill="${color}"/><circle cx="600" cy="180" r="85" fill="#ffffff30"/><path d="M0 470 220 260 460 470 650 330 800 470V600H0Z" fill="#ffffff20"/><text x="60" y="115" fill="white" font-size="48" font-family="Arial">Image ${id}</text></svg>`,
      ),
  );
}
controller.history.clear();
const resources = {
  resolveUrl: (assetId: string) => urls.get(assetId) ?? "",
  uploadImage: async () => {
    throw new Error("This isolated example does not upload files");
  },
};
function Example() {
  const [readOnly, setReadOnly] = useState(false),
    [locale, setLocale] = useState("zh"),
    [hostPreview, setHostPreview] = useState(false),
    [event, setEvent] = useState<PresentationImagePreviewEvent | null>(null),
    [writes, setWrites] = useState(0);
  useEffect(() => {
    const update = () => setWrites((value) => value + 1);
    document.on("update", update);
    return () => {
      document.off("update", update);
    };
  }, []);
  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: 16,
          padding: 10,
          font: "14px Arial",
          background: "#f5f6f8",
        }}
      >
        <label>
          <input
            type="checkbox"
            checked={readOnly}
            onChange={(e) => setReadOnly(e.target.checked)}
          />{" "}
          Readonly
        </label>
        <label>
          <input
            type="checkbox"
            checked={hostPreview}
            onChange={(e) => setHostPreview(e.target.checked)}
          />{" "}
          Host callback
        </label>
        <button
          onClick={() => setLocale((value) => (value === "zh" ? "en" : "zh"))}
        >
          中文 / English
        </button>
        <output aria-label="Content transactions">{writes}</output>
        {event && (
          <output aria-label="Host preview event">
            {JSON.stringify(event)}
          </output>
        )}
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <PresentationWorkspace
          document={document}
          resources={resources}
          readOnly={readOnly}
          locale={locale}
          onImagePreview={hostPreview ? setEvent : undefined}
        />
      </div>
    </div>
  );
}
createRoot(window.document.getElementById("root")!).render(<Example />);
