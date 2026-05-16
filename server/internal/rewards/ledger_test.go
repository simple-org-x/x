package rewards_test

import (
	"fmt"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/simple-org/x/server/internal/rewards"
)

func TestDistributionTable_TopTenPercent_NonZero(t *testing.T) {
	ranking := make([]string, 100)
	for i := range ranking {
		ranking[i] = fmt.Sprintf("player-%03d", i+1)
	}
	dist := rewards.DistributionTable(1_000_000, ranking)
	require.Len(t, dist, 10, "top 10% of 100 players should yield 10 payouts")

	for i, d := range dist {
		assert.Greaterf(t, d.Amount, int64(0), "rank %d should receive a positive amount", i+1)
		assert.Equalf(t, i+1, d.Rank, "rank should equal index+1")
	}
}

func TestDistributionTable_WinnerLargestShare(t *testing.T) {
	ranking := make([]string, 100)
	for i := range ranking {
		ranking[i] = fmt.Sprintf("player-%03d", i+1)
	}
	dist := rewards.DistributionTable(1_000_000, ranking)
	require.NotEmpty(t, dist)
	for i := 1; i < len(dist); i++ {
		assert.Greaterf(t, dist[0].Amount, dist[i].Amount,
			"winner amount must exceed rank %d's amount", i+1)
		assert.GreaterOrEqualf(t, dist[i-1].Amount, dist[i].Amount,
			"distribution must be non-increasing across ranks")
	}
}

func TestDistributionTable_DoesNotOverpay(t *testing.T) {
	for _, n := range []int{1, 10, 100, 537} {
		ranking := make([]string, n)
		for i := range ranking {
			ranking[i] = fmt.Sprintf("p%d", i)
		}
		const pool int64 = 1_234_567
		dist := rewards.DistributionTable(pool, ranking)
		var sum int64
		for _, d := range dist {
			sum += d.Amount
		}
		assert.LessOrEqualf(t, sum, pool, "n=%d: distribution must sum to <= pool", n)
	}
}

func TestDistributionTable_RoundsUpToAtLeastOnePayout(t *testing.T) {
	dist := rewards.DistributionTable(1000, []string{"only-player"})
	require.Len(t, dist, 1)
	assert.Equal(t, int64(1000), dist[0].Amount)
}

func TestLedger_DistributeAndClaim(t *testing.T) {
	ledger := rewards.NewMemoryLedger()

	require.NoError(t, ledger.CreditPrizePool("m1", 100_000))
	require.NoError(t, ledger.RecordResult("m1", []string{"alice", "bob", "carol"}))

	dist, err := ledger.DistributeRewards("m1")
	require.NoError(t, err)
	require.NotEmpty(t, dist)
	assert.Equal(t, "alice", dist[0].UserID)
	assert.NotEmpty(t, dist[0].TxID)

	// Idempotency: a second call returns ErrAlreadyDistributed.
	_, err = ledger.DistributeRewards("m1")
	assert.ErrorIs(t, err, rewards.ErrAlreadyDistributed)

	rewardsForAlice, err := ledger.UserRewards("alice")
	require.NoError(t, err)
	require.Len(t, rewardsForAlice, 1)
	assert.False(t, rewardsForAlice[0].Claimed)

	claim, err := ledger.Claim("alice", dist[0].TxID)
	require.NoError(t, err)
	assert.True(t, claim.Claimed)
}

func TestLedger_UnknownMatch(t *testing.T) {
	ledger := rewards.NewMemoryLedger()
	_, err := ledger.DistributeRewards("nope")
	assert.ErrorIs(t, err, rewards.ErrUnknownMatch)
}

func TestLedger_ClaimUnknownTx(t *testing.T) {
	ledger := rewards.NewMemoryLedger()
	_, err := ledger.Claim("alice", "no-such-tx")
	assert.ErrorIs(t, err, rewards.ErrUnknownTx)
}
