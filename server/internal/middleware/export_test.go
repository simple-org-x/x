package middleware

import "time"

// SetRateLimiterClock overrides the clock used by an IPRateLimiter.
// Test-only seam.
func SetRateLimiterClock(l *IPRateLimiter, now func() time.Time) {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.now = now
}

// SetRateLimiterIdleTTL overrides the eviction TTL for an
// IPRateLimiter. Test-only seam.
func SetRateLimiterIdleTTL(l *IPRateLimiter, ttl time.Duration) {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.idleTTL = ttl
}
