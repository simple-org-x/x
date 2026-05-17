package gameserver_test

import (
	"context"
	"math"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/simple-org/x/server/internal/gameserver"
)

func TestClampInput_NormalizesAboveMaxSpeed(t *testing.T) {
	in := gameserver.InputFrame{Seq: 1, Dir: gameserver.Vector2{X: 5, Y: 0}}
	out := gameserver.ClampInput(in)
	assert.InDelta(t, 1.0, out.Dir.X, 1e-9)
	assert.InDelta(t, 0, out.Dir.Y, 1e-9)
}

func TestClampInput_PreservesUnitVectors(t *testing.T) {
	in := gameserver.InputFrame{Dir: gameserver.Vector2{X: 0.5, Y: 0.5}}
	out := gameserver.ClampInput(in)
	assert.InDelta(t, 0.5, out.Dir.X, 1e-9)
	assert.InDelta(t, 0.5, out.Dir.Y, 1e-9)
}

func TestClampInput_HandlesNaN(t *testing.T) {
	in := gameserver.InputFrame{Dir: gameserver.Vector2{X: math.NaN(), Y: math.Inf(1)}}
	out := gameserver.ClampInput(in)
	assert.Equal(t, 0.0, out.Dir.X)
	assert.Equal(t, 0.0, out.Dir.Y)
}

func TestMatchRunner_StartTickEnd(t *testing.T) {
	r := gameserver.NewMatchRunner()
	m := r.Start(context.Background(), "", []string{"p1"})
	defer r.End(m.ID)

	assert.NotEmpty(t, m.ID)
	assert.Equal(t, []string{"p1"}, m.Players)

	// Wait for at least one tick to be published.
	select {
	case snap := <-m.Outputs():
		assert.Equal(t, m.ID, snap.MatchID)
		assert.GreaterOrEqual(t, snap.Tick, int64(1))
		require.Len(t, snap.Players, 1)
		assert.Equal(t, "p1", snap.Players[0].UserID)
	case <-time.After(200 * time.Millisecond):
		t.Fatal("expected at least one world-state tick within 200ms")
	}
}

func TestMatchRunner_EndUnknownMatch(t *testing.T) {
	r := gameserver.NewMatchRunner()
	err := r.End("does-not-exist")
	assert.Error(t, err)
}

func TestMatchRunner_LookupAfterEnd(t *testing.T) {
	r := gameserver.NewMatchRunner()
	m := r.Start(context.Background(), "", []string{"p1"})
	require.NoError(t, r.End(m.ID))
	_, ok := r.Lookup(m.ID)
	assert.False(t, ok)
}

// TestSubmitInputFor_RejectsNonPlayer guards the input identity seam
// from the WS reader: a frame from a connection whose userID is not
// in Match.Players must be silently dropped, not delivered to the
// runner's input channel.
func TestSubmitInputFor_RejectsNonPlayer(t *testing.T) {
	r := gameserver.NewMatchRunner()
	m := r.Start(context.Background(), "", []string{"p1", "p2"})
	defer r.End(m.ID)

	// Drain at least one tick so we know the runner is up.
	select {
	case <-m.Outputs():
	case <-time.After(200 * time.Millisecond):
		t.Fatal("runner did not produce a tick")
	}

	// A foreign userID must not be accepted: LastSeqFor("intruder")
	// stays at zero even after we submit a frame with a high seq.
	m.SubmitInputFor("intruder", gameserver.InputFrame{Seq: 999})
	// Allow a generous window for the runner to drain inputs.
	time.Sleep(100 * time.Millisecond)
	assert.Equal(t, int64(0), m.LastSeqFor("intruder"),
		"non-player inputs must not be ingested")

	// Sanity: a legitimate player's input still flows through.
	m.SubmitInputFor("p1", gameserver.InputFrame{Seq: 7})
	require.Eventually(t, func() bool {
		return m.LastSeqFor("p1") == 7
	}, 500*time.Millisecond, 10*time.Millisecond,
		"legitimate player frames should be ingested")
}

// TestSubmitInputFor_PerUserDedup proves that SubmitInputFor keys
// the runner's per-user sequence dedup on the authenticated user
// rather than a shared empty string. Two distinct users sending
// monotonic sequences must not interfere with each other.
func TestSubmitInputFor_PerUserDedup(t *testing.T) {
	r := gameserver.NewMatchRunner()
	m := r.Start(context.Background(), "", []string{"alice", "bob"})
	defer r.End(m.ID)

	// Drain at least one tick so we know the runner's loop is up.
	select {
	case <-m.Outputs():
	case <-time.After(200 * time.Millisecond):
		t.Fatal("runner did not produce a tick")
	}

	// Alice sends seq=5; Bob sends seq=4. Under the broken seam (a
	// shared "" key) Bob's frame would be dropped because 4 <= 5.
	// Under the fixed seam each user has its own counter, so both
	// frames are accepted.
	m.SubmitInputFor("alice", gameserver.InputFrame{Seq: 5})
	m.SubmitInputFor("bob", gameserver.InputFrame{Seq: 4})

	require.Eventually(t, func() bool {
		return m.LastSeqFor("alice") == 5 && m.LastSeqFor("bob") == 4
	}, 500*time.Millisecond, 10*time.Millisecond,
		"both alice and bob frames should be accepted with their own dedup keys")
}
