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
