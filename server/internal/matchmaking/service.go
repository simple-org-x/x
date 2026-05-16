package matchmaking

import (
	"errors"
	"sync"
	"time"

	"github.com/google/uuid"
)

// Match is the output of a successful matchmaking round.
type Match struct {
	ID        string    `json:"id"`
	Mode      string    `json:"mode"`
	Region    string    `json:"region"`
	Players   []string  `json:"players"`
	EntryFee  int       `json:"entryFee"`
	CreatedAt time.Time `json:"createdAt"`
}

// Ticket is what /api/matchmaking/queue returns to the caller. Either
// Match is set (single-player fast path or instantly-formed match) or
// Queued is true and the client should poll /status.
type Ticket struct {
	UserID string      `json:"userId"`
	Queued bool        `json:"queued"`
	Match  *Match      `json:"match,omitempty"`
	Entry  *QueueEntry `json:"entry,omitempty"`
}

// Mode constants. Phase 1 only ships "solo".
const (
	ModeSolo  = "solo"
	ModeDuo   = "duo"
	ModeSquad = "squad"
)

// PlayersPerMode defines how many entries a bucket needs before a Match
// is minted. "solo" returns immediately with a synthetic match (the
// brief calls this out: Phase 1 single-player matches return at once).
var PlayersPerMode = map[string]int{
	ModeSolo:  1,
	ModeDuo:   2,
	ModeSquad: 4,
}

// EntryFeeForMode is the synthetic entry fee written to the rewards
// ledger when a Match is minted. Phase 1 keeps this purely advisory.
var EntryFeeForMode = map[string]int{
	ModeSolo:  0,
	ModeDuo:   10,
	ModeSquad: 25,
}

// Service is the matchmaking facade. It depends only on Queue.
type Service struct {
	Queue   Queue
	matches sync.Map // matchID -> Match
}

// NewService wires a Service onto a queue.
func NewService(q Queue) *Service {
	return &Service{Queue: q}
}

// EnqueuePlayer is the entry point for POST /api/matchmaking/queue.
// For "solo" mode it short-circuits and returns a synthetic Match.
// For other modes it enqueues and runs a single matching pass; if the
// pass produces enough peers in the same MMR bucket a Match is minted.
func (s *Service) EnqueuePlayer(userID, mode string, mmr int, region string) (Ticket, error) {
	if userID == "" {
		return Ticket{}, errors.New("matchmaking: empty userId")
	}
	if mode == "" {
		mode = ModeSolo
	}
	if region == "" {
		region = "global"
	}
	required, ok := PlayersPerMode[mode]
	if !ok {
		return Ticket{}, errors.New("matchmaking: unknown mode")
	}

	if mode == ModeSolo {
		m := s.mintMatch(mode, region, []string{userID})
		return Ticket{UserID: userID, Queued: false, Match: &m}, nil
	}

	entry := QueueEntry{
		UserID:    userID,
		Mode:      mode,
		MMR:       mmr,
		Region:    region,
		EnqueueAt: time.Now(),
	}
	if err := s.Queue.Enqueue(entry); err != nil {
		return Ticket{}, err
	}

	// Single matching pass: peek at the queue and mint a match if a
	// full bucket is ready. This keeps the call latency-bounded; a
	// real implementation would run a background loop instead.
	if popped := s.Queue.PopBucket(mode, region, MMRBucket(mmr), required); len(popped) == required {
		players := make([]string, len(popped))
		for i, e := range popped {
			players[i] = e.UserID
		}
		m := s.mintMatch(mode, region, players)
		return Ticket{UserID: userID, Queued: false, Match: &m}, nil
	}

	return Ticket{UserID: userID, Queued: true, Entry: &entry}, nil
}

// Cancel removes a player from the queue if they are present.
func (s *Service) Cancel(userID string) error {
	return s.Queue.Cancel(userID)
}

// Status returns the current queue state for a user. If the user is
// not queued, both Queued and Match are nil and the second value is
// false.
func (s *Service) Status(userID string) (Ticket, bool) {
	if e, ok := s.Queue.Status(userID); ok {
		entry := e
		return Ticket{UserID: userID, Queued: true, Entry: &entry}, true
	}
	return Ticket{UserID: userID}, false
}

// LookupMatch returns a previously minted match by id.
func (s *Service) LookupMatch(id string) (Match, bool) {
	v, ok := s.matches.Load(id)
	if !ok {
		return Match{}, false
	}
	m, _ := v.(Match)
	return m, true
}

// RegisterMatch adds an externally-created Match to the lookup map.
// gameserver.MatchRunner uses this to publish matches it spawns.
func (s *Service) RegisterMatch(m Match) {
	s.matches.Store(m.ID, m)
}

// mintMatch builds a synthetic Match and remembers it for /api/match/{id}.
// Match IDs are uuid.NewString() to keep them globally unique without
// requiring a counter or distributed sequence service.
func (s *Service) mintMatch(mode, region string, players []string) Match {
	m := Match{
		ID:        uuid.NewString(),
		Mode:      mode,
		Region:    region,
		Players:   players,
		EntryFee:  EntryFeeForMode[mode],
		CreatedAt: time.Now(),
	}
	s.matches.Store(m.ID, m)
	return m
}
