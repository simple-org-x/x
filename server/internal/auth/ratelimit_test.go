package auth_test

import (
	"testing"

	"github.com/stretchr/testify/assert"

	"github.com/simple-org/x/server/internal/auth"
)

// TestAddressRateLimiter_BurstThenDeny exercises the per-address
// bucket: the burst budget allows N back-to-back calls, then further
// calls are denied until the bucket refills.
func TestAddressRateLimiter_BurstThenDeny(t *testing.T) {
	rl := auth.NewAddressRateLimiter(0.5, 3)
	addr := "0x1111111111111111111111111111111111111111"

	for i := 0; i < 3; i++ {
		assert.True(t, rl.Allow(addr), "burst allowance %d should pass", i)
	}
	assert.False(t, rl.Allow(addr),
		"a fourth back-to-back call must be denied within the same second")
}

// TestAddressRateLimiter_BucketsAreIsolated locks in the per-address
// isolation: exhausting one address's bucket does not affect any
// other address. This is the property issue 2 actually cares about.
func TestAddressRateLimiter_BucketsAreIsolated(t *testing.T) {
	rl := auth.NewAddressRateLimiter(0.5, 2)
	a := "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
	b := "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"

	// Exhaust address A's bucket.
	assert.True(t, rl.Allow(a))
	assert.True(t, rl.Allow(a))
	assert.False(t, rl.Allow(a))

	// Address B is unaffected.
	assert.True(t, rl.Allow(b))
	assert.True(t, rl.Allow(b))
}

// TestAddressRateLimiter_EmptyAddressIsAllowed documents the
// short-circuit for empty/whitespace addresses: input validation is
// the right place to reject malformed addresses, not the limiter.
func TestAddressRateLimiter_EmptyAddressIsAllowed(t *testing.T) {
	rl := auth.NewAddressRateLimiter(0.5, 1)
	for i := 0; i < 10; i++ {
		assert.True(t, rl.Allow(""))
		assert.True(t, rl.Allow("   "))
	}
}

// TestAddressRateLimiter_AddressKeyIsCaseInsensitive proves that
// 0xABC... and 0xabc... share a single bucket. EIP-55 mixed-case
// checksum addresses must not let an attacker double their per-
// address budget by varying capitalisation.
func TestAddressRateLimiter_AddressKeyIsCaseInsensitive(t *testing.T) {
	rl := auth.NewAddressRateLimiter(0.5, 2)
	upper := "0xCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC"
	lower := "0xcccccccccccccccccccccccccccccccccccccccc"

	assert.True(t, rl.Allow(upper))
	assert.True(t, rl.Allow(lower))
	assert.False(t, rl.Allow(upper),
		"the same address in different case must share a single bucket")
}
