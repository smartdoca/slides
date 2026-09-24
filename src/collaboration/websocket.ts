import type {
  ClientMessage,
  ServerMessage,
  CollaborationTransport,
  CollaborationConnectOptions,
} from "./transport";

export const wireEncode = (message: unknown): string =>
  JSON.stringify(message, (_key, value) =>
    value instanceof Uint8Array ? { $bytes: Array.from(value) } : value,
  );
export const wireDecode = (value: string): unknown =>
  JSON.parse(value, (_key, item) =>
    item && typeof item === "object" && Array.isArray(item.$bytes)
      ? Uint8Array.from(item.$bytes)
      : item,
  );

/** Optional transport adapter. The host supplies the URL and authentication. */
export class WebSocketTransport implements CollaborationTransport {
  private socket?: WebSocket;
  private listeners = new Set<(message: ServerMessage) => void>();
  constructor(private url: string) {}
  connect(_options: CollaborationConnectOptions) {
    this.socket?.close();
    return new Promise<void>((resolve, reject) => {
      const socket = new WebSocket(this.url);
      this.socket = socket;
      socket.onopen = () => resolve();
      socket.onerror = () => reject(new Error("无法连接协同服务"));
      socket.onclose = () => {
        if (this.socket === socket) this.emit({ type: "disconnected" });
      };
      socket.onmessage = (event) => {
        if (this.socket !== socket) return;
        try {
          this.emit(wireDecode(event.data) as ServerMessage);
        } catch {
          this.emit({
            type: "error",
            code: "INVALID_MESSAGE",
            message: "无法读取服务器消息",
          });
        }
      };
    });
  }
  private emit(message: ServerMessage) {
    this.listeners.forEach((fn) => fn(message));
  }
  send(message: ClientMessage) {
    if (this.socket?.readyState !== WebSocket.OPEN)
      throw new Error("Disconnected");
    this.socket.send(wireEncode(message));
  }
  subscribe(listener: (message: ServerMessage) => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  disconnect() {
    const socket = this.socket;
    this.socket = undefined;
    socket?.close();
  }
}
