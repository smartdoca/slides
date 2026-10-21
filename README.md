# @smartdoca/slides

[中文](README.zh-CN.md)

Embeddable collaborative presentation editor for React. The canvas uses LeaferJS, text uses Slate, and the document is a Yjs structure. The host owns identity, images, permissions, and the network.

Licensed under [MIT](LICENSE). Version 0.3.0-alpha.4 is a preview. It is not full PowerPoint compatibility.

## Install

```sh
npm install @smartdoca/slides react react-dom
```

```tsx
import { PresentationWorkspace, createYDocument } from "@smartdoca/slides";
import "@smartdoca/slides/styles.css";

const document = createYDocument();

export function Slides() {
  return <PresentationWorkspace document={document} chrome="embedded" />;
}
```

Create the `Y.Doc` once for the document session. Readonly, selection, and panel changes must reuse it.

## Props

`PresentationWorkspace` accepts `PresentationWorkspaceProps`. `document` is required.

| Prop | Type | Role |
|---|---|---|
| `document` | `Y.Doc` | Presentation document created with `createYDocument`. |
| `readOnly` | `boolean` | Stops editing. |
| `chrome` | `"embedded" \| "demo"` | Embedded has no demo business chrome. Defaults to embedded. |
| `resources` | `PresentationResources` | `uploadImage` stores a file and `resolveUrl` returns a display URL. |
| `onImagePreview` | `PresentationImagePreviewHandler` | Opens a host-owned gallery from stable references across all slides. |
| `members` | `PresentationPresence[]` | Remote presence supplied by the host. |
| `sessionId` | `string` | This tab's session. |
| `onPresence` | `(slideId, ids) => void` | Local slide and element selection. It is not a content write. |
| `commentMarkers` | `CommentMarker[]` | Host-owned comments. |
| `onCommentAnchorClick` | function | Overlapping markers at the clicked anchor. |
| `renderCommentAction` | function | Host action for one comment anchor. |
| `onSelectionChange` | function | Local editor selection. |
| `panels` | slides, properties, notes | Which side panels are open. |
| `presentation` | `boolean` | Slideshow mode. |
| `locale` | `string` | Defaults to Chinese. Unknown codes use English. |
| `messages` | `Record<string, string>` | Replaces individual catalog keys. Document content stays unchanged. |
| `onExport` | function | Host export for `pptx`, `json`, or `pdf`. |
| `onImport` | function | Host import of one file. |
| `onReconnect` | `() => void` | Host reconnect control. |
| `status`, `saveLabel` | `string` | Host save copy. |

`onReady` is on `PresentationEditor`, the canvas surface. `PresentationWorkspace` exposes `PresentationWorkspaceHandle` through a ref: `getSelection`, `captureAnchor`, `revealAnchor`, and `commitTextEdit`.

## Collaboration

`@smartdoca/slides/core` reads and validates the document. `@smartdoca/slides/collaboration` defines the session, connection state, and update outbox types.

- Local content transactions are the only writes. Presence, selection, and panel changes stay out of the outbox.
- `readOnly` does not publish edits.
- `members` and `onPresence` are temporary. `captureAnchor` creates a comment anchor the host stores.
- Call `commitTextEdit` before taking an export snapshot so an open text edit is included.
- `@smartdoca/slides/pptx` provides `importPptx`, `exportPptx`, and `validatePptxFile`.

## Styling

Selecting an object opens a compact floating format bar. Its text tools follow the inspected Feishu Slides workflow: text presets, searchable fonts, a one-point font-size stepper, alignment, lists, bold, links, font color/highlight tabs, Format Painter, and the optional right-hand Format panel. Click Format Painter once for one target, double-click to keep painting, and press Esc to cancel. Use `⌘/Ctrl Shift C/V` to copy/paste formatting. Text ranges and multiple objects use native editing transactions with one undo step per action; locked objects are skipped and readonly controls cannot write.

The right panel contains geometry, font controls, paragraph alignment/lists/spacing, independent text margins, and character spacing. Five text presets and six shape presets are available. The circular palette shows document colors, basic colors, and custom hexadecimal input. AI editing, cloud font upload, formula conversion and advanced effects are outside this implementation. See [styling behavior and verification](docs/STYLING.md).

## Tables

Tables support rectangular/row/column selection, merge/split, matrix paste, Tab navigation with automatic final-row insertion, row/column resizing, whole-cell formatting, context menus and single-step undo. Native PPTX retains merges, styles and dimensions. Cells still contain plain text; character-range rich text and character-level collaboration within a cell are not implemented. New table operations require `codecRevision: 6` on both client and server. Production hosts must be upgraded separately. See [table behavior and verification](docs/TABLES.md).

## Image preview

Click an image once to select it, then click it again or use its preview button to enlarge it. Readonly images preview on one click. The default lightbox navigates images across all slides with buttons, arrow keys, horizontal drag/swipe or a trackpad. Supply `onImagePreview` to use a host-owned viewer with stable asset references and host authorization. See [the API and resource boundary](docs/IMAGE-PREVIEW.md) and the [0.3.0-alpha.4 release notes](docs/releases/0.3.0-alpha.4.md).
