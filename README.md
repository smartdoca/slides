# @smartdoca/slides

[中文](README.zh-CN.md)

Embeddable collaborative presentation editor for React. The canvas uses LeaferJS, text uses Slate, and the document is a Yjs structure. The host owns identity, images, permissions, and the network.

Licensed under [AGPL-3.0-only](LICENSE). Version 0.3.0-alpha.1 is a preview. It is not full PowerPoint compatibility.

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
