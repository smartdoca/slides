import { useRef } from "react";
import type * as Y from "yjs";
import {
  PresentationWorkspace,
  type PresentationWorkspaceHandle,
  type PresentationResources,
  type PresentationPresence,
  type CommentAnchor,
  type CommentMarker,
} from "@eppt/editor";
import { readDocument } from "@eppt/editor/core";
import { exportPptx } from "@eppt/editor/pptx";
import "@eppt/editor/styles.css";

/** Adapter requirements, NOT a claim that Doca already exports these names. */
interface HostSession {
  document: Y.Doc; // Stable, authoritative bootstrap already applied by host's one session.
  ready: boolean;
  readOnly: boolean;
  title: string; // Business title, owned by host.
  members: PresentationPresence[];
  sessionId: string;
  publishSelection(slideId: string, elementIds: string[]): void;
}
interface HostResources extends PresentationResources {
  readForExport(assetId: string): Promise<string>; // Recheck asset ACL; return data URL.
  download(file: {
    blob: Blob;
    filename: string;
    mime: string;
    warnings: { message: string }[];
  }): Promise<void>;
}
interface HostComments {
  canCreate: boolean;
  markers: CommentMarker[];
  create(anchor: CommentAnchor): void;
  open(candidates: CommentMarker[]): void;
}
export function DocaPresentation({
  session,
  resources,
  comments,
  locale,
}: {
  session: HostSession;
  resources: HostResources;
  comments: HostComments;
  locale?: string;
}) {
  const editor = useRef<PresentationWorkspaceHandle>(null);
  if (!session.ready) return <div role="status">正在同步文稿…</div>;
  const download = async () => {
    editor.current?.commitTextEdit();
    const snapshot = {
      ...readDocument(session.document),
      title: session.title,
    };
    await resources.download(
      await exportPptx(snapshot, resources.readForExport),
    );
  };
  return (
    <section
      style={{
        height: "100%",
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* These actions belong to the platform, outside the package chrome. */}
      <div>
        <button onClick={() => void download()}>下载 PPTX</button>
        <button onClick={() => editor.current?.setPresentation(true)}>
          放映
        </button>
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <PresentationWorkspace
          ref={editor}
          locale={locale}
          document={session.document}
          readOnly={session.readOnly}
          resources={resources}
          members={session.members}
          sessionId={session.sessionId}
          onPresence={session.publishSelection}
          commentMarkers={comments.markers}
          onCommentAnchorClick={comments.open}
          renderCommentAction={
            comments.canCreate
              ? (anchor) => (
                  <button onClick={() => comments.create(anchor)}>评论</button>
                )
              : undefined
          }
        />
      </div>
      {/* Platform mounts its own drawer/permissions/notifications; never serializes them into Y.Doc. */}
    </section>
  );
}
