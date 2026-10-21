# Image preview and host gallery

`0.3.0-alpha.4` adds optional `onImagePreview` to both `PresentationWorkspaceProps` and `PresentationEditorProps`. The root and `core` entrypoints export these types and the pure gallery helpers:

```ts
interface PresentationImagePreviewItem {
  readonly id: string;
  readonly slideId: string;
  readonly elementId: string;
  readonly assetId: string;
  readonly alt?: string;
}
interface PresentationImagePreviewEvent {
  readonly currentId: string;
  readonly gallery: readonly PresentationImagePreviewItem[];
}
type PresentationImagePreviewHandler = (
  event: PresentationImagePreviewEvent,
) => void | Promise<void>;
```

`presentationImages(document)` returns occurrences in `slideOrder`, then each slide's `elementOrder`. All slides participate, including hidden slides. Each ordered native image occurrence remains a separate entry even when two occurrences share the same asset. Its `id` is an opaque stable string derived from the slide and element IDs; consumers compare IDs rather than parsing them. `presentationImagePreview(document, slideId, elementId)` returns an event for a live image or `null` for another/deleted target. Neither function resolves URLs or mutates the document.

```tsx
<PresentationWorkspace
  document={session.document}
  readOnly={session.readOnly}
  resources={authorizedResources}
  onImagePreview={({ currentId, gallery }) => {
    const current = gallery.find((item) => item.id === currentId);
    if (!current) return;
    hostImageViewer.open({ current, gallery });
  }}
/>
```

The host callback replaces the package lightbox completely. It receives only stable `assetId`, slide/element IDs and existing alternate text, with no physical storage paths, resolved URLs or download URLs. The host owns resource ACL, URL resolution, protected history/trash/audit access, copying bytes and downloads. Host adapters must read the actual installed declarations before passing this callback; `0.3.0-alpha.3` does not export it. The Doca adapter and shared host lightbox are integrated separately.

In edit mode, the first image click selects it. A subsequent click on the selected image, or its accessible preview button, opens the gallery. Modifier selection does not preview. Readonly and locked images can preview with one click. Preview does not select another slide, alter image geometry/crop, write content, publish presence or add an undo step. The latest supplied host callback is used without remounting the editor. Throws and rejected promises reach `PresentationEditorProps.onError` (the workspace presents them through its existing alert).

When no callback is supplied, the package lightbox resolves only the current image using the existing `resources.resolveUrl` / `resolveAsset` callback. It supports previous/next buttons, arrow keys, horizontal trackpad scrolling, horizontal drag/swipe at fit scale, zoom, panning when zoomed, fit, retry and Esc. Keyboard focus stays in the dialog and returns to the preceding control on close. It does not expose a download bypass or fetch protected bytes through a new channel. A failed resource displays a retry action without replacing its stable asset reference. Live deletion of the current occurrence closes the default lightbox.

All preview state, pan/zoom and gallery events are transient. No model fields, schema, codec, epoch, checkpoint, transport, outbox or persisted data conversion change. Schema 2, protocol 1 and codec revision 6 retain their existing exact-version rules. No historical reader, compatibility adapter, missing-field backfill or migration is introduced. Retain the preceding registry artifact and deployment for package rollback; preserve subsequent document writes.

The runnable isolated example is `examples/image-preview.html` in the source checkout. It uses synthetic assets, reports content transactions, and can switch readonly mode, locale and the host callback. It is not a production ACL or storage implementation.
