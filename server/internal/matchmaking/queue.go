// Package matchmaking implements a Phase-1, in-memory queue and a
// bucket-by-MMR matcher.
//
// The Queue interface is the seam through which Redis (or any other
// distributed broker) replaces the in-memory map without touching call
// sites. The Service layer owns business logic (input validation,
// match minting, single-player fast-path) and depends only on Queue.
package matchmaking

import (
	"errors"
	"sort"
	"sync"
	"time"
)

// QueueEntry is a single player waiting for a match.
type QueueEntry struct {
	UserID    string    `json:"userId"`
	Mode      string    `json:"mode"`
	MMR       int       `json:"mmr"`
	Region    string    `json:"region"`
	EnqueueAt time.Time `json:"enqueueAt"`
}

// Queue is the storage seam for matchmaking. Implementations must be
// safe for concurrent use; the in-memory implementation guards itself
// with a sync.Mutex.
type Queue interface {
	// Enqueue inserts entry. If a player with the same UserID is
	// already in the queue, Enqueue replaces them.
	Enqueue(entry QueueEntry) error
	// Cancel removes the player from the queue. Returns ErrNotQueued
	// if there was nothing to remove.
	Cancel(userID string) error
	// Status returns the entry for userID, or (QueueEntry{}, false).
	Status(userID string) (QueueEntry, bool)
	// PopBucket atomically removes up to n entries from the (mode,
	// region, mmrBucket) bucket. The returned slice is empty if no
	// match can be formed.
	PopBucket(mode, region string, mmrBucket, n int) []QueueEntry
	// Len returns the total number of queued players.
	Len() int
}

// ErrNotQueued is returned when a Cancel cannot find the player.
var ErrNotQueued = errors.New("player not queued")

// MMRBucketSize controls how forgiving the matcher is. Two players
// match if floor(mmr / MMRBucketSize) is equal.
const MMRBucketSize = 100

// MMRBucket maps an absolute MMR value onto a bucket index.
func MMRBucket(mmr int) int {
	if mmr < 0 {
		mmr = 0
	}
	return mmr / MMRBucketSize
}

// MemoryQueue is the Phase-1 in-memory Queue.
type MemoryQueue struct {
	mu      sync.Mutex
	entries map[string]QueueEntry // keyed by UserID
}

// NewMemoryQueue returns an empty in-memory queue.
func NewMemoryQueue() *MemoryQueue {
	return &MemoryQueue{entries: make(map[string]QueueEntry)}
}

// Enqueue stores or replaces an entry.
func (q *MemoryQueue) Enqueue(e QueueEntry) error {
	if e.UserID == "" {
		return errors.New("matchmaking: empty userId")
	}
	q.mu.Lock()
	defer q.mu.Unlock()
	q.entries[e.UserID] = e
	return nil
}

// Cancel deletes an entry; returns ErrNotQueued if absent.
func (q *MemoryQueue) Cancel(userID string) error {
	q.mu.Lock()
	defer q.mu.Unlock()
	if _, ok := q.entries[userID]; !ok {
		return ErrNotQueued
	}
	delete(q.entries, userID)
	return nil
}

// Status returns the queued entry for userID if present.
func (q *MemoryQueue) Status(userID string) (QueueEntry, bool) {
	q.mu.Lock()
	defer q.mu.Unlock()
	e, ok := q.entries[userID]
	return e, ok
}

// PopBucket atomically removes up to n entries that share the supplied
// (mode, region, mmrBucket) coordinates. If fewer than n entries match,
// the empty slice is returned and the queue is not mutated.
//
// Within a bucket, entries are matched in FIFO order by EnqueueAt:
// the longest-waiting players take priority over fresher arrivals.
// This guarantees fairness across map iteration randomness.
func (q *MemoryQueue) PopBucket(mode, region string, mmrBucket, n int) []QueueEntry {
	if n <= 0 {
		return nil
	}
	q.mu.Lock()
	defer q.mu.Unlock()

	// Collect every candidate first so we can sort them deterministically;
	// only after we know we have at least n do we mutate the queue.
	candidates := make([]QueueEntry, 0)
	for _, e := range q.entries {
		if e.Mode != mode || e.Region != region {
			continue
		}
		if MMRBucket(e.MMR) != mmrBucket {
			continue
		}
		candidates = append(candidates, e)
	}
	if len(candidates) < n {
		return nil
	}
	// FIFO: oldest EnqueueAt wins. Stable sort preserves insertion
	// order when EnqueueAt happens to be equal (clock resolution).
	sort.SliceStable(candidates, func(i, j int) bool {
		return candidates[i].EnqueueAt.Before(candidates[j].EnqueueAt)
	})
	matched := candidates[:n]
	for _, e := range matched {
		delete(q.entries, e.UserID)
	}
	return matched
}

// Len returns the queue size.
func (q *MemoryQueue) Len() int {
	q.mu.Lock()
	defer q.mu.Unlock()
	return len(q.entries)
}
