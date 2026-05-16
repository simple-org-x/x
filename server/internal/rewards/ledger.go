// Package rewards owns the prize-pool ledger and the deterministic
// distribution math.
//
// Phase-1 rule: the top 10% of finishers share the full pool, with the
// winner receiving the largest share. Distribute is a pure function so
// it can be unit-tested without any mock infrastructure. The on-chain
// payout is stubbed: DistributeRewards returns synthetic txIDs and
// writes to the in-memory ledger; a future feature will swap the
// Ledger for one that submits transactions to RewardPool.sol.
//
// Mapping to RewardPool.sol (target contract, not yet deployed):
//
//	CreditPrizePool(matchID, amount)  -> RewardPool.fundMatch(uint256, uint256)
//	RecordResult(matchID, ranking)    -> RewardPool.commitRanking(uint256, address[])
//	DistributeRewards(matchID)        -> RewardPool.payout(uint256) -> Distribution[]
//	ClaimReward(userID, amount)       -> RewardPool.claim(address, uint256)
//
// The interface boundary keeps these signatures stable so the contract
// shape can be designed against them.
package rewards

import (
	"errors"
	"sync"
	"time"

	"github.com/google/uuid"
)

// Distribution is a single line item produced by DistributeRewards.
type Distribution struct {
	UserID  string `json:"userId"`
	Rank    int    `json:"rank"`
	Amount  int64  `json:"amount"`
	TxID    string `json:"txId"`
	Claimed bool   `json:"claimed"`
}

// Result records the final ranking of a match. Ranking[0] is the
// winner, Ranking[1] is runner-up, and so on.
type Result struct {
	MatchID string
	Ranking []string
}

// Ledger is the storage seam for prize pools and payouts. The Phase-1
// in-memory implementation lives in this same package; later features
// can swap it for a Postgres+chain-aware implementation without
// touching call sites.
type Ledger interface {
	CreditPrizePool(matchID string, amount int64) error
	RecordResult(matchID string, ranking []string) error
	DistributeRewards(matchID string) ([]Distribution, error)
	UserRewards(userID string) ([]Distribution, error)
	Claim(userID, txID string) (Distribution, error)
}

// ErrUnknownMatch is returned when an operation references a match
// that has no credited pool or recorded result.
var ErrUnknownMatch = errors.New("rewards: unknown match")

// ErrAlreadyDistributed is returned when DistributeRewards is called
// twice for the same match.
var ErrAlreadyDistributed = errors.New("rewards: already distributed")

// ErrUnknownTx is returned when Claim cannot find the tx for the user.
var ErrUnknownTx = errors.New("rewards: unknown transaction")

// MemoryLedger is the Phase-1 in-memory Ledger implementation.
type MemoryLedger struct {
	mu      sync.Mutex
	pools   map[string]int64           // matchID -> total pool
	results map[string][]string        // matchID -> ranking
	dist    map[string][]Distribution  // matchID -> per-user distributions
	byUser  map[string][]*Distribution // userID -> pointers into dist
	now     func() time.Time
}

// NewMemoryLedger returns an empty in-memory ledger.
func NewMemoryLedger() *MemoryLedger {
	return &MemoryLedger{
		pools:   make(map[string]int64),
		results: make(map[string][]string),
		dist:    make(map[string][]Distribution),
		byUser:  make(map[string][]*Distribution),
		now:     time.Now,
	}
}

// CreditPrizePool adds amount to the match's prize pool. amount may be
// negative (refunds) but the running total cannot go below zero.
func (l *MemoryLedger) CreditPrizePool(matchID string, amount int64) error {
	if matchID == "" {
		return errors.New("rewards: empty matchID")
	}
	l.mu.Lock()
	defer l.mu.Unlock()
	if l.pools[matchID]+amount < 0 {
		return errors.New("rewards: pool would go negative")
	}
	l.pools[matchID] += amount
	return nil
}

// RecordResult stores the final ranking for matchID. If a ranking was
// already recorded it is overwritten; this mirrors how a real ledger
// would let the game-server amend results before payout.
func (l *MemoryLedger) RecordResult(matchID string, ranking []string) error {
	if matchID == "" {
		return errors.New("rewards: empty matchID")
	}
	if len(ranking) == 0 {
		return errors.New("rewards: empty ranking")
	}
	l.mu.Lock()
	defer l.mu.Unlock()
	l.results[matchID] = append([]string(nil), ranking...)
	return nil
}

// DistributeRewards computes the per-user payouts for a match using
// the distribution rule encoded in DistributionTable. It is idempotent
// per match: a second call returns ErrAlreadyDistributed.
func (l *MemoryLedger) DistributeRewards(matchID string) ([]Distribution, error) {
	l.mu.Lock()
	defer l.mu.Unlock()

	if _, ok := l.dist[matchID]; ok {
		return nil, ErrAlreadyDistributed
	}
	pool, ok := l.pools[matchID]
	if !ok {
		return nil, ErrUnknownMatch
	}
	ranking, ok := l.results[matchID]
	if !ok {
		return nil, ErrUnknownMatch
	}

	dist := DistributionTable(pool, ranking)
	stamped := make([]Distribution, 0, len(dist))
	for i := range dist {
		dist[i].TxID = uuid.NewString()
		stamped = append(stamped, dist[i])
	}
	l.dist[matchID] = stamped

	// Index by user for /api/rewards/me lookups.
	for i := range stamped {
		d := &l.dist[matchID][i]
		l.byUser[d.UserID] = append(l.byUser[d.UserID], d)
	}
	return stamped, nil
}

// UserRewards returns every distribution credited to userID across all
// matches. Claimed and unclaimed entries are both included; callers
// can filter on the boolean.
func (l *MemoryLedger) UserRewards(userID string) ([]Distribution, error) {
	l.mu.Lock()
	defer l.mu.Unlock()
	ptrs := l.byUser[userID]
	out := make([]Distribution, 0, len(ptrs))
	for _, p := range ptrs {
		out = append(out, *p)
	}
	return out, nil
}

// Claim flips the Claimed bit on a (userID, txID) pair, simulating an
// on-chain claim. It returns the updated Distribution.
func (l *MemoryLedger) Claim(userID, txID string) (Distribution, error) {
	l.mu.Lock()
	defer l.mu.Unlock()
	for _, p := range l.byUser[userID] {
		if p.TxID == txID {
			if p.Claimed {
				return *p, nil
			}
			p.Claimed = true
			return *p, nil
		}
	}
	return Distribution{}, ErrUnknownTx
}

// DistributionTable encodes the Phase-1 prize-pool rule:
//   - Only the top 10% of finishers (rounded up, minimum 1) earn payouts.
//   - The winner's share decays geometrically across the qualifying
//     ranks so the curve is "winner takes biggest, runner-up next, ...".
//   - Total payouts sum to <= pool (rounding rounds down so the house
//     can never overpay).
//
// The function is pure; it does not depend on any Ledger state.
func DistributionTable(pool int64, ranking []string) []Distribution {
	n := len(ranking)
	if n == 0 || pool <= 0 {
		return nil
	}
	// Top 10%, rounded up, minimum 1.
	top := (n + 9) / 10
	if top < 1 {
		top = 1
	}
	if top > n {
		top = n
	}

	// Geometric weights with ratio 0.6 so winner > runner-up by a
	// clean margin. The largest weight goes to rank 1 (index 0).
	weights := make([]float64, top)
	var sum float64
	w := 1.0
	for i := 0; i < top; i++ {
		weights[i] = w
		sum += w
		w *= 0.6
	}

	out := make([]Distribution, 0, top)
	var paid int64
	for i := 0; i < top; i++ {
		amount := int64(float64(pool) * weights[i] / sum)
		if amount < 0 {
			amount = 0
		}
		paid += amount
		out = append(out, Distribution{
			UserID: ranking[i],
			Rank:   i + 1,
			Amount: amount,
		})
	}
	// Anything lost to rounding stays in the pool; we never overpay.
	_ = paid
	return out
}
