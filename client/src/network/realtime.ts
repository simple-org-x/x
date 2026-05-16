/**
 * Stub WebSocket client for future multiplayer. Phase 1 never opens a
 * connection. The class shape is fixed enough that swapping in a real
 * server-authoritative match loop later is purely additive.
 */

export type RealtimeMessage =
  | { type: 'hello'; userId: string }
  | { type: 'state'; tick: number; payload: unknown }
  | { type: 'input'; tick: number; payload: unknown };

export type RealtimeListener = (msg: RealtimeMessage) => void;

export interface RealtimeOptions {
  url?: string;
  /** When false (default in Phase 1) the constructor does not auto-connect. */
  autoConnect?: boolean;
}

export class RealtimeClient {
  private url: string;
  private socket: WebSocket | null = null;
  private listeners = new Set<RealtimeListener>();

  constructor(opts: RealtimeOptions = {}) {
    this.url =
      opts.url ??
      (typeof window !== 'undefined'
        ? `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/ws`
        : 'ws://localhost:8080/ws');
    if (opts.autoConnect) this.connect();
  }

  connect(): void {
    if (this.socket || typeof WebSocket === 'undefined') return;
    this.socket = new WebSocket(this.url);
    this.socket.addEventListener('message', (ev) => {
      try {
        const msg = JSON.parse(ev.data as string) as RealtimeMessage;
        this.listeners.forEach((l) => l(msg));
      } catch {
        // Ignore malformed payloads during stub phase.
      }
    });
  }

  disconnect(): void {
    this.socket?.close();
    this.socket = null;
  }

  send(msg: RealtimeMessage): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;
    this.socket.send(JSON.stringify(msg));
  }

  on(listener: RealtimeListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  get isConnected(): boolean {
    return this.socket?.readyState === WebSocket.OPEN;
  }
}
