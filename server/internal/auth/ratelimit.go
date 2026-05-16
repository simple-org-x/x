package auth

import (
	"context"
	"strings"
	"sync"
	"time"

	"golang.org/x/time/rate"
)

// AddressRateLimiter is a per-wallet-address token-bucket pool used to
// gate POST /api/auth/wallet/verify. The global IP rate limiter
// already throttles flood traffic, but it does not isolate work by
// the wallet whose nonce slot is under attack: an attacker who knows
// a target address can still slot-cycle by submitting bursts of
// MaxNonceAttempts wrong guesses, evicting the slot each time.
//
// AddressRateLimiter caps that work per address: each address gets
// its own token bucket and verify requests above the bucket's
// configured rate get a 429 before NonceStore.Consume ever runs.
//
// The implementation mirrors middleware.IPRateLimiter so the eviction
// and janitor semantics match: inactive buckets are swept on a timer
// so a flood of unique addresses cannot grow the map without bound.
type AddressRateLimiter struct {
	mu      sync.Mutex
	buckets map[string]*addressBucket
	rps     rate.Limit
	burst   int
	now     func() time.Time
	idleTTL time.Duration
}

type addressBucket struct {
	limiter *rate.Limiter
	lastUse time.Time
}

// DefaultAddressRateLimiterIdleTTL is how long an unused per-address
// bucket survives before the next sweep evicts it. 10 minutes is
// plenty of headroom for a slow wallet-signing UX while short enough
// that a churning attacker cannot pin the map in memory.
const DefaultAddressRateLimiterIdleTTL = 10 * time.Minute

// NewAddressRateLimiter builds a token-bucket pool keyed by wallet
// address. rps is the steady refill rate (tokens/sec) per address;
// burst is the bucket size and therefore the maximum back-to-back
// verify attempts a single address may submit before being throttled.
//
// Defaults are chosen for Phase 1: 0.5 tokens/sec (one verify every
// two seconds) with a burst of 5 matches MaxNonceAttempts so a
// legitimate wallet that fat-fingers its signature a few times in
// quick succession still gets through.
func NewAddressRateLimiter(rps float64, burst int) *AddressRateLimiter {
	if rps <= 0 {
		rps = 0.5
	}
	if burst <= 0 {
		burst = 5
	}
	return &AddressRateLimiter{
		buckets: make(map[string]*addressBucket),
		rps:     rate.Limit(rps),
		burst:   burst,
		now:     time.Now,
		idleTTL: DefaultAddressRateLimiterIdleTTL,
	}
}

// Allow returns true if a request for address may proceed. The bucket
// is created lazily on the first request and updated lazily on every
// call so Sweep can evict buckets that fall idle.
//
// Empty / whitespace-only addresses are short-circuited to true so
// the limiter never short-circuits the upstream input validation
// (which is responsible for rejecting malformed addresses).
func (l *AddressRateLimiter) Allow(address string) bool {
	key := strings.ToLower(strings.TrimSpace(address))
	if key == "" {
		return true
	}
	l.mu.Lock()
	defer l.mu.Unlock()
	b, ok := l.buckets[key]
	if !ok {
		b = &addressBucket{limiter: rate.NewLimiter(l.rps, l.burst)}
		l.buckets[key] = b
	}
	b.lastUse = l.now()
	return b.limiter.Allow()
}

// Sweep evicts buckets whose lastUse is older than idleTTL. Safe to
// call from a janitor goroutine or directly from tests.
func (l *AddressRateLimiter) Sweep() {
	l.mu.Lock()
	defer l.mu.Unlock()
	cutoff := l.now().Add(-l.idleTTL)
	for k, b := range l.buckets {
		if b.lastUse.Before(cutoff) {
			delete(l.buckets, k)
		}
	}
}

// StartJanitor spins up a goroutine that calls Sweep every interval
// until ctx is cancelled. Returns immediately.
func (l *AddressRateLimiter) StartJanitor(ctx context.Context, interval time.Duration) {
	if interval <= 0 {
		interval = l.idleTTL / 2
	}
	go func() {
		t := time.NewTicker(interval)
		defer t.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-t.C:
				l.Sweep()
			}
		}
	}()
}

// Size returns the current number of tracked buckets. Test helper.
func (l *AddressRateLimiter) Size() int {
	l.mu.Lock()
	defer l.mu.Unlock()
	return len(l.buckets)
}
