package matchmaking_test

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/simple-org/x/server/internal/matchmaking"
)

func TestSoloShortCircuits(t *testing.T) {
	svc := matchmaking.NewService(matchmaking.NewMemoryQueue())
	ticket, err := svc.EnqueuePlayer("user-1", matchmaking.ModeSolo, 1000, "us-east")
	require.NoError(t, err)
	require.NotNil(t, ticket.Match)
	assert.False(t, ticket.Queued)
	assert.Equal(t, []string{"user-1"}, ticket.Match.Players)
}

func TestDuoFormsMatchAfterTwoPlayers(t *testing.T) {
	svc := matchmaking.NewService(matchmaking.NewMemoryQueue())

	t1, err := svc.EnqueuePlayer("a", matchmaking.ModeDuo, 1200, "eu-west")
	require.NoError(t, err)
	require.True(t, t1.Queued)
	require.Nil(t, t1.Match)

	t2, err := svc.EnqueuePlayer("b", matchmaking.ModeDuo, 1250, "eu-west")
	require.NoError(t, err)
	require.False(t, t2.Queued)
	require.NotNil(t, t2.Match)
	assert.ElementsMatch(t, []string{"a", "b"}, t2.Match.Players)
}

func TestDifferentMMRBucketsDoNotMatch(t *testing.T) {
	svc := matchmaking.NewService(matchmaking.NewMemoryQueue())

	t1, err := svc.EnqueuePlayer("a", matchmaking.ModeDuo, 100, "global")
	require.NoError(t, err)
	require.True(t, t1.Queued)

	// 800 is far enough from 100 (bucket 1) to land in bucket 8.
	t2, err := svc.EnqueuePlayer("b", matchmaking.ModeDuo, 800, "global")
	require.NoError(t, err)
	assert.True(t, t2.Queued)
	assert.Nil(t, t2.Match)
}

func TestDifferentRegionsDoNotMatch(t *testing.T) {
	svc := matchmaking.NewService(matchmaking.NewMemoryQueue())

	_, err := svc.EnqueuePlayer("a", matchmaking.ModeDuo, 1000, "us-east")
	require.NoError(t, err)
	t2, err := svc.EnqueuePlayer("b", matchmaking.ModeDuo, 1000, "eu-west")
	require.NoError(t, err)
	assert.True(t, t2.Queued)
	assert.Nil(t, t2.Match)
}

func TestCancelRemovesPlayer(t *testing.T) {
	svc := matchmaking.NewService(matchmaking.NewMemoryQueue())

	_, err := svc.EnqueuePlayer("a", matchmaking.ModeSquad, 1000, "global")
	require.NoError(t, err)
	require.NoError(t, svc.Cancel("a"))

	// Cancelling again returns ErrNotQueued.
	err = svc.Cancel("a")
	require.ErrorIs(t, err, matchmaking.ErrNotQueued)
}

func TestStatusReturnsCurrentEntry(t *testing.T) {
	svc := matchmaking.NewService(matchmaking.NewMemoryQueue())
	_, err := svc.EnqueuePlayer("a", matchmaking.ModeDuo, 1500, "us-east")
	require.NoError(t, err)
	ticket, ok := svc.Status("a")
	require.True(t, ok)
	require.NotNil(t, ticket.Entry)
	assert.Equal(t, "a", ticket.Entry.UserID)
	assert.Equal(t, 1500, ticket.Entry.MMR)
}

func TestSquadWaitsUntilFourPlayers(t *testing.T) {
	svc := matchmaking.NewService(matchmaking.NewMemoryQueue())
	for _, id := range []string{"a", "b", "c"} {
		ticket, err := svc.EnqueuePlayer(id, matchmaking.ModeSquad, 1000, "global")
		require.NoError(t, err)
		assert.True(t, ticket.Queued, "player %s should still be queued", id)
	}
	final, err := svc.EnqueuePlayer("d", matchmaking.ModeSquad, 1000, "global")
	require.NoError(t, err)
	require.False(t, final.Queued)
	require.NotNil(t, final.Match)
	assert.Len(t, final.Match.Players, 4)
}
