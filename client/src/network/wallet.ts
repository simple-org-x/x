/**
 * Wallet stub. Phase 1 always returns a deterministic guest session so the
 * rest of the UI can render a "connect wallet" affordance without requiring
 * any actual chain integration. A real implementation will swap this for
 * wagmi/viem in a later feature.
 */

export interface Session {
  userId: string;
  display: string;
  guest: boolean;
  address?: string;
}

let session: Session = makeGuestSession();

function makeGuestSession(): Session {
  // Deterministic per-tab guest id for testability.
  const seed = Math.random().toString(36).slice(2, 10);
  return {
    userId: `guest-${seed}`,
    display: `Guest ${seed.slice(0, 4).toUpperCase()}`,
    guest: true,
  };
}

export const wallet = {
  getSession(): Session {
    return session;
  },
  async connect(): Promise<Session> {
    // Phase 1: pretend a connect dialog opened, then resolved with a
    // synthetic address. No real wallet code runs.
    session = {
      userId: 'wallet-stub',
      display: '0xSTUB...0001',
      guest: false,
      address: '0x0000000000000000000000000000000000000001',
    };
    return session;
  },
  async disconnect(): Promise<void> {
    session = makeGuestSession();
  },
  async signMessage(message: string): Promise<string> {
    return `stub-signature:${message}`;
  },
};
