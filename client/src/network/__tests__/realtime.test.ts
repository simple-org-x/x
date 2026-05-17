import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  AUTH_SUBPROTOCOL_PREFIX,
  BASE_SUBPROTOCOL,
  RealtimeClient,
} from '../realtime';

interface FakeWebSocketCtor {
  (this: unknown, url: string, protocols?: string | string[]): unknown;
  OPEN: number;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('RealtimeClient', () => {
  it('does not include the JWT in the URL', () => {
    const captured: { url?: string; protocols?: string | string[] } = {};
    const FakeWS = vi.fn(function FakeWS(
      this: unknown,
      url: string,
      protocols?: string | string[]
    ) {
      captured.url = url;
      captured.protocols = protocols;
      // Minimal stub: vitest will not assert on socket state.
      return {
        addEventListener: vi.fn(),
        close: vi.fn(),
        readyState: 0,
        send: vi.fn(),
      };
    }) as unknown as FakeWebSocketCtor;
    FakeWS.OPEN = 1;
    vi.stubGlobal('WebSocket', FakeWS);

    const client = new RealtimeClient({
      url: 'ws://example.test/ws',
      token: 'jwt-abc.def.ghi',
    });
    client.connect();

    expect(captured.url).toBe('ws://example.test/ws');
    expect(captured.url).not.toContain('access_token');
    expect(captured.url).not.toContain('jwt-abc');
  });

  it('passes the JWT as a Sec-WebSocket-Protocol value', () => {
    const captured: { protocols?: string | string[] } = {};
    const FakeWS = vi.fn(function FakeWS(
      this: unknown,
      _url: string,
      protocols?: string | string[]
    ) {
      captured.protocols = protocols;
      return {
        addEventListener: vi.fn(),
        close: vi.fn(),
        readyState: 0,
        send: vi.fn(),
      };
    }) as unknown as FakeWebSocketCtor;
    FakeWS.OPEN = 1;
    vi.stubGlobal('WebSocket', FakeWS);

    const client = new RealtimeClient({
      url: 'ws://example.test/ws',
      token: 'jwt-abc.def.ghi',
    });
    client.connect();

    expect(captured.protocols).toEqual([
      `${AUTH_SUBPROTOCOL_PREFIX}jwt-abc.def.ghi`,
      BASE_SUBPROTOCOL,
    ]);
  });

  it('omits subprotocols when no token is supplied', () => {
    const captured: { protocols?: string | string[] } = { protocols: 'sentinel' };
    const FakeWS = vi.fn(function FakeWS(
      this: unknown,
      _url: string,
      protocols?: string | string[]
    ) {
      captured.protocols = protocols;
      return {
        addEventListener: vi.fn(),
        close: vi.fn(),
        readyState: 0,
        send: vi.fn(),
      };
    }) as unknown as FakeWebSocketCtor;
    FakeWS.OPEN = 1;
    vi.stubGlobal('WebSocket', FakeWS);

    const client = new RealtimeClient({ url: 'ws://example.test/ws' });
    client.connect();
    expect(captured.protocols).toBeUndefined();
  });
});
