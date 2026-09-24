import * as Y from "yjs";
import { isLocalContentOrigin, REMOTE_ORIGIN } from "./origins";
import { UpdateOutbox } from "./outbox";
import type { CollaborationTransport, ServerMessage } from "./transport";

export type ConnectionState =
  "loading" | "syncing" | "ready" | "disconnected" | "error";
export type SaveState = "clean" | "dirty" | "saving" | "error";
export interface CollaborationSessionOptions {
  room: string;
  schemaVersion: number;
  document: Y.Doc;
  transport: CollaborationTransport;
  onError?: (error: Error) => void;
  onSaveStateChange?: (state: SaveState) => void;
  onConnectionChange?: (state: ConnectionState) => void;
  onPresence?: (sessions: import("./transport").PresentationPresence[]) => void;
  /** Retry the same head ID and bytes if its durable ACK was lost. */
  ackTimeoutMs?: number;
}
export class CollaborationSession {
  readonly outbox = new UpdateOutbox();
  epochId?: string;
  identity?: import("./transport").CollaborationIdentity;
  state: ConnectionState = "loading";
  private unsubscribe?: () => void;
  private disposed = false;
  private subscribed = false;
  private ackTimer?: ReturnType<typeof setTimeout>;
  private clearAckTimer() {
    if (this.ackTimer) clearTimeout(this.ackTimer);
    this.ackTimer = undefined;
  }
  constructor(private readonly options: CollaborationSessionOptions) {}
  private setState(state: ConnectionState) {
    this.state = state;
    this.options.onConnectionChange?.(state);
  }
  async connect(): Promise<void> {
    if (this.disposed || this.subscribed) return;
    this.subscribed = true;
    this.unsubscribe = this.options.transport.subscribe(this.receive);
    this.options.document.on("update", this.onDocumentUpdate);
    await this.reconnect();
  }
  async reconnect(): Promise<void> {
    if (this.disposed || this.state === "error") return;
    this.setState("syncing");
    this.clearAckTimer();
    try {
      await this.options.transport.connect({
        room: this.options.room,
        protocolVersion: 1,
        codec: "eppt",
        codecRevision: 5,
        schemaVersion: this.options.schemaVersion,
        epochId: this.epochId,
        stateVector: Y.encodeStateVector(this.options.document),
      });
      this.options.transport.send({
        type: "sync-request",
        id: crypto.randomUUID(),
        room: this.options.room,
        protocolVersion: 1,
        codec: "eppt",
        codecRevision: 5,
        schemaVersion: this.options.schemaVersion,
        epochId: this.epochId,
        vector: Y.encodeStateVector(this.options.document),
      });
    } catch (error) {
      this.setState("disconnected");
      this.options.onError?.(
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }
  private onDocumentUpdate = (bytes: Uint8Array, origin: unknown): void => {
    // UndoManager operations are local changes too; remote undo arrives as REMOTE_ORIGIN.
    if (!isLocalContentOrigin(origin) && !(origin instanceof Y.UndoManager))
      return;
    if (!this.epochId)
      return this.fail(
        new Error("NOT_READY: editing before authoritative initialization"),
      );
    this.outbox.enqueue({
      id: crypto.randomUUID(),
      epochId: this.epochId,
      bytes: bytes.slice(),
    });
    this.options.onSaveStateChange?.("dirty");
    if (this.outbox.pending.length === 1 && this.state === "ready")
      this.sendHead();
  };
  private sendHead() {
    this.clearAckTimer();
    const item = this.outbox.peek();
    if (!item || this.state !== "ready") return;
    try {
      this.options.transport.send({
        type: "update",
        id: item.id,
        room: this.options.room,
        epochId: item.epochId,
        update: item.bytes,
      });
      this.options.onSaveStateChange?.("saving");
      this.ackTimer = setTimeout(
        () => this.sendHead(),
        Math.max(100, this.options.ackTimeoutMs ?? 5000),
      );
    } catch {
      this.setState("disconnected");
      this.options.onSaveStateChange?.("dirty");
    }
  }
  private receive = (message: ServerMessage): void => {
    if (this.disposed || this.state === "error") return;
    if ("room" in message && message.room !== this.options.room) return;
    if (message.type === "disconnected") {
      this.clearAckTimer();
      this.setState("disconnected");
      if (this.outbox.dirty) this.options.onSaveStateChange?.("dirty");
      return;
    }
    if (message.type === "sync-response") {
      if (message.codecRevision !== 5)
        return this.fail(
          new Error(
            "CODEC_REVISION_MISMATCH: upgrade the host and all editor clients together",
          ),
        );
      if (message.protocolVersion !== 1)
        return this.fail(new Error("PROTOCOL_MISMATCH"));
      if (
        message.codec !== "eppt" ||
        message.schemaVersion !== this.options.schemaVersion
      )
        return this.fail(new Error("SCHEMA_MISMATCH"));
      if (this.epochId && this.epochId !== message.epochId)
        return this.fail(
          new Error("EPOCH_MISMATCH: pending work retained for recovery"),
        );
      this.epochId = message.epochId;
      this.identity = message.identity;
      try {
        Y.applyUpdate(this.options.document, message.update, REMOTE_ORIGIN);
      } catch {
        return this.fail(new Error("INVALID_UPDATE"));
      }
      this.setState("ready");
      if (this.outbox.dirty) this.sendHead();
      else this.options.onSaveStateChange?.("clean");
    } else if (message.type === "update") {
      if (message.epochId !== this.epochId)
        return this.fail(new Error("EPOCH_MISMATCH"));
      try {
        Y.applyUpdate(this.options.document, message.update, REMOTE_ORIGIN);
      } catch {
        this.fail(new Error("INVALID_UPDATE"));
      }
    } else if (message.type === "ack") {
      if (this.outbox.acknowledge(message.id, message.epochId)) {
        this.clearAckTimer();
        if (this.outbox.dirty) this.sendHead();
        else this.options.onSaveStateChange?.("clean");
      }
    } else if (message.type === "presence")
      this.options.onPresence?.(message.sessions);
    else if (message.type === "error")
      this.fail(new Error(message.code + ": " + message.message));
  };
  private fail(error: Error) {
    this.clearAckTimer();
    this.setState("error");
    this.options.onSaveStateChange?.("error");
    this.options.onError?.(error);
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.clearAckTimer();
    this.options.document.off("update", this.onDocumentUpdate);
    this.unsubscribe?.();
    this.options.transport.disconnect();
  }
}
