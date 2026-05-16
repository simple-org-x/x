/**
 * Stub WebSocket client for future multiplayer. Phase 1 never opens a
 * connection. The class shape is fixed enough that swapping in a real
 * server-authoritative match loop later is purely additive.
 *
 * Authentication: the JWT is passed via the Sec-WebSocket-Protocol
 * header rather than a query string, mirroring the server seam in
 * server/internal/realtime/hub.go. Browsers serialise the second
 * argument to `new WebSocket(url, protocols)` into the
 * Sec-WebSocket-Protocol request header, which the server reads
 * before completing the upgrade. This keeps the JWT out of:
 *   - reverse-proxy / CDN access logs (which routinely log query strings),
 *   - the Referer header sent on subsequent subresource fetches,
 *   - browser history.
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
  /**
   * JWT to authenticate the upgrade. When set, the client offers
   * `cas.auth.jwt.<token>` as a Sec-WebSocket-Protocol value. The
   * server validates it BEFORE completing the WebSocket handshake.
   */
  token?: string;
}

/** Subprotocol prefix that carries the authentication token. */
export const AUTH_SUBPROTOCOL_PREFIX = 'cas.auth.jwt.';
/** Subprotocol the server acks once the auth token has been validated. */
export const BASE_SUBPROTOCOL = 'cas.v1';

export class RealtimeClient {
  private url: string;
  private socket: WebSocket | null = null;
  private listeners = new Set<RealtimeListener>();
  private token: string | undefined;

  constructor(opts: RealtimeOptions = {}) {
    this.url =
      opts.url ??
      (typeof window !== 'undefined'
        ? `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/ws`
        : 'ws://localhost:8080/ws');
    this.token = opts.token;
    if (opts.autoConnect) this.connect();
  }

  connect(): void {
    if (this.socket || typeof WebSocket === 'undefined') return;
    // Note: we deliberately do NOT pass the JWT as ?access_token=
    // (see file-level comment for the security rationale).
    const protocols = this.token
      ? [`${AUTH_SUBPROTOCOL_PREFIX}${this.token}`, BASE_SUBPROTOCOL]
      : undefined;
    this.socket = protocols ? new WebSocket(this.url, protocols) : new WebSocket(this.url);
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
