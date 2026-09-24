export interface CollaborationIdentity {
  sessionId: string;
  userId: string;
  name: string;
  color: string;
}

export interface CollaborationConnectOptions {
  room: string;
  protocolVersion: 1;
  codec: "eppt";
  codecRevision: 5;
  schemaVersion: number;
  epochId?: string;
  stateVector: Uint8Array;
}

export type ClientMessage =
  | {
      type: "sync-request";
      id: string;
      room: string;
      protocolVersion: 1;
      codec: "eppt";
      codecRevision: 5;
      schemaVersion: number;
      epochId?: string;
      vector: Uint8Array;
    }
  | {
      type: "update";
      id: string;
      room: string;
      epochId: string;
      update: Uint8Array;
    }
  | { type: "presence"; room: string; presence: PresentationPresence | null };

export type ServerMessage =
  | { type: "disconnected" }
  | {
      type: "sync-response";
      protocolVersion: 1;
      room: string;
      epochId: string;
      codec: "eppt";
      codecRevision?: number;
      schemaVersion: number;
      seq: number;
      checkpointSeq: number;
      update: Uint8Array;
      identity: CollaborationIdentity;
    }
  | { type: "update"; room: string; epochId: string; update: Uint8Array }
  | { type: "ack"; id: string; room: string; epochId: string; seq: number }
  | { type: "presence"; room: string; sessions: PresentationPresence[] }
  | { type: "error"; code: string; message: string };

export interface PresentationPresence {
  sessionId: string;
  userId: string;
  name: string;
  color: string;
  slideId?: string;
  cursor?: { x: number; y: number };
  selection?: { elementIds: string[]; editing: boolean };
}

export interface CollaborationTransport {
  connect(options: CollaborationConnectOptions): Promise<void>;
  send(message: ClientMessage): void;
  subscribe(listener: (message: ServerMessage) => void): () => void;
  disconnect(): void;
}
