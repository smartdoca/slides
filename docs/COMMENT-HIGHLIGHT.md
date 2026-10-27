# Controlled comment highlighting

`0.3.0-alpha.5` adds `PresentationWorkspaceProps.activeCommentId?: string | null`. The preceding `0.3.0-alpha.4` exposes comment markers, `onCommentAnchorClick` and `revealAnchor`, but does not expose this background API. Doca upgrades its host adapter separately using the official npm version.

```tsx
<PresentationWorkspace
  ref={workspace}
  document={doc}
  commentMarkers={visibleAuthorizedMarkers}
  activeCommentId={activeCommentId}
  onCommentAnchorClick={openCommentCandidates}
/>
```

On a comment-card click, the host can call the existing `workspace.current.revealAnchor(marker.anchor)` and set `activeCommentId` to `marker.id`. On an anchor-pin click, the unchanged callback supplies overlap candidates; the host opens its chooser/thread and activates the selected comment. The package does not choose a comment from overlapping candidates. The host owns timeout, repeated-click timer restart, drawer-close clearing, resolution status, authorization and pagination. Pass `null`/`undefined` or remove the marker to clear the background. No package timer or browser storage is involved.

The highlight uses only the matching entry in `commentMarkers`. It does not select content, move focus, scroll, change slides or publish presence. Call `revealAnchor` explicitly for navigation, retaining its existing selection and fit-zoom behavior. On another slide the background is absent until that slide is displayed. It is hidden during slideshow and printing and is excluded from native PNG/PPTX exports.

The package resolves the existing anchor against the current document on each projection. A slide anchor covers its slide. An element anchor covers its native element rectangle, with its current rotation. An `elements` anchor paints each surviving element separately, without shading the gaps. Deletions immediately remove the corresponding region; a fully orphaned target, missing marker or invisible element does not produce a background. Live drag/resize geometry follows the native editor while interacting, with no idle animation loop.

The existing anchor protocol is unchanged: table comments target the **whole table element**, not cells/merged-cell ranges; `text` relative anchors must still resolve and highlight their **whole text element**, not individual glyph ranges. This release does not add table-cell, text-glyph, cross-slide multi-area or legacy anchor semantics. Partially deleted multi-element anchors retain the existing `resolveAnchor` policy. The host supplies only current authorized/unresolved comments.

Highlighting works in both edit and readonly workspaces. The overlay has no pointer interaction and keeps native text/table editing and comment pins accessible. Changing/clearing the prop changes runtime view only: no model fill/style mutation, anchor rewrite, transaction, undo entry, transport, codec/schema, checkpoint, epoch, history or outbox change. No old-data reader, fallback, migration or conversion is introduced. Host dependency pins, integration documentation and compiled-host acceptance are updated separately by the host.
