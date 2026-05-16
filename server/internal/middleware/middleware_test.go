package middleware_test

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/simple-org/x/server/internal/middleware"
)

// TestIPRateLimiter_SweepEvictsIdleBuckets confirms that the periodic
// sweeper evicts buckets that have not been touched within the idle
// TTL. Without this, the map grows unboundedly when a single attacker
// rotates IPv6 prefixes.
func TestIPRateLimiter_SweepEvictsIdleBuckets(t *testing.T) {
	rl := middleware.NewIPRateLimiter(1000, 1000)

	now := time.Now()
	middleware.SetRateLimiterClock(rl, func() time.Time { return now })
	middleware.SetRateLimiterIdleTTL(rl, time.Minute)

	handler := rl.Middleware(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	// Touch three distinct IPs so three buckets are created.
	for _, ip := range []string{"10.0.0.1", "10.0.0.2", "10.0.0.3"} {
		req := httptest.NewRequest(http.MethodGet, "/", nil)
		req.RemoteAddr = ip + ":1234"
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)
		require.Equal(t, http.StatusOK, rec.Code)
	}
	assert.Equal(t, 3, rl.Size())

	// Advance time well past the TTL and run a sweep: every bucket
	// is now stale and gets evicted.
	now = now.Add(2 * time.Minute)
	rl.Sweep()
	assert.Equal(t, 0, rl.Size(), "sweep should evict stale buckets")

	// A subsequent request for one of the previously-evicted IPs
	// gets a fresh bucket; the limiter still serves correctly.
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.RemoteAddr = "10.0.0.1:5555"
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	require.Equal(t, http.StatusOK, rec.Code)
	assert.Equal(t, 1, rl.Size(), "fresh request should re-create the bucket")
}

// TestIPRateLimiter_SweepKeepsActiveBuckets confirms a recently-used
// bucket survives a sweep so legitimate clients are not re-budgeted.
func TestIPRateLimiter_SweepKeepsActiveBuckets(t *testing.T) {
	rl := middleware.NewIPRateLimiter(1000, 1000)
	now := time.Now()
	middleware.SetRateLimiterClock(rl, func() time.Time { return now })
	middleware.SetRateLimiterIdleTTL(rl, time.Minute)

	handler := rl.Middleware(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.RemoteAddr = "10.0.0.9:1234"
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	require.Equal(t, http.StatusOK, rec.Code)
	require.Equal(t, 1, rl.Size())

	// Within the idle window: bucket survives the sweep.
	now = now.Add(30 * time.Second)
	rl.Sweep()
	assert.Equal(t, 1, rl.Size())
}
