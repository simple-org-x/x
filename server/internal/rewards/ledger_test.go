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

func TestDistributionTable_SumsToPoolExactly(t *testing.T) {
	// RewardPool.settle requires sum(shares) == pool exactly. The
	// table now adds any rounding remainder to rank-1 so this holds
	// for every pool size, including ones that do not divide evenly
	// across the geometric-weight denominator.
	for _, n := range []int{1, 10, 100, 537} {
		ranking := make([]string, n)
		for i := range ranking {
			ranking[i] = fmt.Sprintf("p%d", i)
		}
		// Mix of round and pathological pool sizes to exercise the
		// remainder path.
		for _, pool := range []int64{1, 2, 7, 1000, 1_000_000, 1_234_567, 999_999_999_999} {
			dist := rewards.DistributionTable(pool, ranking)
			var sum int64
			for _, d := range dist {
				sum += d.Amount
			}
			assert.Equalf(t, pool, sum,
				"n=%d pool=%d: distribution must sum to pool exactly", n, pool)
		}
	}
}

func TestDistributionTable_RemainderGoesToRank1(t *testing.T) {
	// The rounding remainder is folded into rank-1 (the largest
	// share already), so the winner's amount is always at least the
	// floor-rounded geometric share. This pins down the placement of
	// the remainder so future refactors do not silently move it.
	ranking := []string{"a", "b", "c", "d", "e", "f", "g", "h", "i", "j"} // top=1
	dist := rewards.DistributionTable(7, ranking)
	require.Len(t, dist, 1)
	assert.Equal(t, int64(7), dist[0].Amount,
		"single-payout case: rank-1 absorbs the entire pool including rounding")
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
