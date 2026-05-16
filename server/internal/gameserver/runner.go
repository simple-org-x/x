// Package gameserver hosts the authoritative match loop. Phase 1 keeps
// gameplay on the client (single-player), so the runner is mostly a
// seam: per-match goroutines, a 30Hz tick, an input channel that
// validates and clamps frames, and a broadcast channel for world-state
// snapshots. Multiplayer support drops in by filling the empty tick
// body and routing inputs through this same MatchRunner.
package gameserver

import (
	"context"
	"errors"
	"math"
	"sync"
	"time"

	"github.com/google/uuid"
)

// TickRate is the authoritative simulation rate. 30Hz is the brief's
// target.
const TickRate = 30

// TickDuration is the time between two ticks at TickRate.
const TickDuration = time.Second / TickRate

// MaxInputSpeed is the maximum magnitude of an input direction vector
// after normalization. Values above this are clamped (anti-cheat).
const MaxInputSpeed = 1.0

// InputFrame is what a client sends per simulation step.
type InputFrame struct {
	Seq int64   `json:"seq"` // monotonically increasing client sequence
	Dir Vector2 `json:"dir"`
	TS  int64   `json:"ts"` // client clock, ms since epoch (lag detection)
	// UserID is the authenticated identity that produced this frame.
	// The realtime layer fills this in from the WebSocket connection;
	// clients do not (and cannot meaningfully) supply it. Match.loop
	// uses it to dedup per-user sequence numbers and to reject inputs
	// from anyone not in Match.Players.
	UserID string `json:"-"`
}

// Vector2 is a 2D direction or position.
type Vector2 struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
}

// WorldState is the per-tick authoritative snapshot. Phase 1 keeps the
// payload skeletal; Phase 2 will fill in entities, projectiles, etc.
type WorldState struct {
	MatchID string        `json:"matchId"`
	Tick    int64         `json:"tick"`
	Now     time.Time     `json:"now"`
	Players []PlayerState `json:"players"`
}

// PlayerState is a per-player slice of the world snapshot.
type PlayerState struct {
	UserID string  `json:"userId"`
	Pos    Vector2 `json:"pos"`
	HP     float64 `json:"hp"`
}

// Match is a running match owned by the MatchRunner. Construct via
// MatchRunner.Start; cancel via MatchRunner.End.
type Match struct {
	ID        string
	Players   []string
	StartedAt time.Time

	mu            sync.Mutex
	closed        bool
	cancel        context.CancelFunc
	state         WorldState
	inputs        chan InputFrame
	outputs       chan WorldState
	lastSeqByUser map[string]int64
}

// MatchRunner spawns and supervises per-match goroutines.
type MatchRunner struct {
	mu      sync.Mutex
	matches map[string]*Match
}

// NewMatchRunner returns an idle runner with no matches.
func NewMatchRunner() *MatchRunner {
	return &MatchRunner{matches: make(map[string]*Match)}
}

// Start spawns a goroutine for matchID and returns the live Match.
// If matchID is "" a new uuid is generated.
func (r *MatchRunner) Start(parent context.Context, matchID string, players []string) *Match {
	if matchID == "" {
		matchID = uuid.NewString()
	}
	ctx, cancel := context.WithCancel(parent)
	playerStates := make([]PlayerState, len(players))
	for i, p := range players {
		playerStates[i] = PlayerState{UserID: p, HP: 100}
	}
	m := &Match{
		ID:        matchID,
		Players:   append([]string(nil), players...),
		StartedAt: time.Now(),
		cancel:    cancel,
		state: WorldState{
			MatchID: matchID,
			Now:     time.Now(),
			Players: playerStates,
		},
		// Channels are intentionally small: one tick of buffering on
		// inputs (drop on overflow), modest fan-out on outputs.
		inputs:  make(chan InputFrame, TickRate),
		outputs: make(chan WorldState, 16),
	}
	r.mu.Lock()
	r.matches[matchID] = m
	r.mu.Unlock()
	go m.loop(ctx)
	return m
}

// Lookup returns a running match by ID.
func (r *MatchRunner) Lookup(id string) (*Match, bool) {
	r.mu.Lock()
	defer r.mu.Unlock()
	m, ok := r.matches[id]
	return m, ok
}

// End cancels the match goroutine and removes it from the runner.
func (r *MatchRunner) End(id string) error {
	r.mu.Lock()
	m, ok := r.matches[id]
	if ok {
		delete(r.matches, id)
	}
	r.mu.Unlock()
	if !ok {
		return errors.New("gameserver: unknown match")
	}
	m.close()
	return nil
}

// EndAll cancels every running match. Used during graceful shutdown.
func (r *MatchRunner) EndAll() {
	r.mu.Lock()
	matches := make([]*Match, 0, len(r.matches))
	for _, m := range r.matches {
		matches = append(matches, m)
	}
	r.matches = make(map[string]*Match)
	r.mu.Unlock()
	for _, m := range matches {
		m.close()
	}
}

// SubmitInput pushes a frame onto the match's input channel after
// validation and clamping. Frames that would block the channel are
// dropped (anti-cheat: a flooding client cannot slow the server).
//
// Callers that know the authenticated user id should prefer
// SubmitInputFor; this entry point exists for tests and for any path
// that has already populated f.UserID.
func (m *Match) SubmitInput(f InputFrame) {
	clamped := ClampInput(f)
	select {
	case m.inputs <- clamped:
	default:
		// Drop on full buffer; the next tick will reuse the last
		// known direction in m.state.
	}
}

// SubmitInputFor binds an InputFrame to a specific authenticated user
// id and submits it. Frames whose userID is not in Match.Players are
// silently dropped: the realtime layer is responsible for closing the
// connection, but the runner refuses to mix inputs across identities.
func (m *Match) SubmitInputFor(userID string, f InputFrame) {
	if userID == "" {
		return
	}
	allowed := false
	for _, p := range m.Players {
		if p == userID {
			allowed = true
			break
		}
	}
	if !allowed {
		return
	}
	f.UserID = userID
	m.SubmitInput(f)
}

// Outputs returns the read side of the world-state broadcast channel.
func (m *Match) Outputs() <-chan WorldState {
	return m.outputs
}

// State returns a snapshot of the current world state.
func (m *Match) State() WorldState {
	m.mu.Lock()
	defer m.mu.Unlock()
	// Copy the slice header so callers cannot mutate our backing array.
	cp := m.state
	cp.Players = append([]PlayerState(nil), m.state.Players...)
	return cp
}

// close cancels the loop and closes the output channel exactly once.
func (m *Match) close() {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.closed {
		return
	}
	m.closed = true
	if m.cancel != nil {
		m.cancel()
	}
	close(m.outputs)
}

// loop is the per-match goroutine. Phase-1 implementation is minimal:
// it ingests inputs (already clamped), updates a tick counter, and
// publishes a near-empty WorldState. The structure is what matters --
// Phase 2 fills the body without changing the seam.
func (m *Match) loop(ctx context.Context) {
	tick := time.NewTicker(TickDuration)
	defer tick.Stop()
	var seqByUser = make(map[string]int64)

	for {
		select {
		case <-ctx.Done():
			return
		case f := <-m.inputs:
			// Drop out-of-order frames per user; this is the seam
			// where authoritative resimulation would go in Phase 2.
			user := f.UserID
			if last, ok := seqByUser[user]; ok && f.Seq <= last {
				continue
			}
			seqByUser[user] = f.Seq
			m.mu.Lock()
			if m.lastSeqByUser == nil {
				m.lastSeqByUser = make(map[string]int64)
			}
			m.lastSeqByUser[user] = f.Seq
			m.mu.Unlock()
		case <-tick.C:
			m.mu.Lock()
			m.state.Tick++
			m.state.Now = time.Now()
			snap := m.state
			snap.Players = append([]PlayerState(nil), m.state.Players...)
			m.mu.Unlock()
			select {
			case m.outputs <- snap:
			default:
				// Slow consumers do not back up the simulation.
			}
		}
	}
}

// LastSeqFor returns the most recently observed input sequence for
// userID, or 0 if no input has been ingested yet. Exposed for tests
// that exercise the per-user dedup boundary; production code does
// not consume this.
func (m *Match) LastSeqFor(userID string) int64 {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.lastSeqByUser == nil {
		return 0
	}
	return m.lastSeqByUser[userID]
}

// ClampInput sanitizes an InputFrame: it normalizes the direction
// vector to magnitude <= MaxInputSpeed and zeros NaN/Inf coordinates.
// Returning a value (rather than mutating in place) keeps the function
// pure and trivial to unit-test.
func ClampInput(f InputFrame) InputFrame {
	if math.IsNaN(f.Dir.X) || math.IsInf(f.Dir.X, 0) {
		f.Dir.X = 0
	}
	if math.IsNaN(f.Dir.Y) || math.IsInf(f.Dir.Y, 0) {
		f.Dir.Y = 0
	}
	mag := math.Hypot(f.Dir.X, f.Dir.Y)
	if mag > MaxInputSpeed {
		f.Dir.X = f.Dir.X / mag * MaxInputSpeed
		f.Dir.Y = f.Dir.Y / mag * MaxInputSpeed
	}
	if f.Seq < 0 {
		f.Seq = 0
	}
	return f
}
