# Comment highlighting verification — 2026-10-28

Synthetic presentations only; no user document or Doca database was edited. Source behavior was accepted from the isolated C1 build and is released as `0.3.0-alpha.5`. Generated execution logs, images and archive audits remain under ignored `artifacts/tmp/`.

- TypeScript, ESM/CJS/declaration builds and the full suite passed: 207 cases; 3 opt-in cases (WebSocket service, PPTX upload service and performance) were not run for this view-only change.
- Workspace regressions cover controlled activation/clearing independent of marker-click callbacks and selection, latest callback dispatch, slide/element/multi-element/text anchors, whole-table geometry, edit/readonly, remote movement, partial/full deletion, slide deletion and document replacement. Remote application does not create local undo entries or echo.
- Live-geometry regression follows temporary drag/resize/rotation and verifies frame cancellation with no idle animation loop.
- The installed package passed public TypeScript props, CJS anchor/byte-preservation checks and an ESM/PPTX roundtrip. Every installed package file matched the packed archive.
- Real browser acceptance covers marker visibility and removal, overlap candidates with host-selected thread, cross-slide reveal, 85% zoom, readonly changes, native table draft commit and undo, peer convergence, and live remote target movement/deletion. One native table commit authored one normal content update; three later remote updates caused no extra local write.
- A pure-idle observation with two visible highlight regions lasted 70.901 seconds with zero content updates; a separate 89.578-second view-operation observation also retained zero updates. Browser error logs were empty.
- Relative to the actual npm alpha.4 archive, the package entrypoint/dependency contract, core/collaboration/PPTX CJS runtimes and persisted-model/codec declarations are unchanged. The new prop is a view/API addition only; persisted anchors and their existing partial-deletion policy are unchanged.

Official npm archive availability, downloaded integrity, current source/tag/Release identity and installed-release checks are recorded in the release handoff. Doca's dependency upgrade, shared integration inventory, compiled-host behavior and production publication are separate host acceptance. No arbitrary old-format compatibility, table-cell/glyph anchors, Canvas connection ports or transport-wide acceptance is claimed by this verification.
