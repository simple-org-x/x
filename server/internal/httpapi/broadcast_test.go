package httpapi_test

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/coder/websocket"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/simple-org/x/server/internal/config"
	"github.com/simple-org/x/server/internal/httpapi"
)

// TestBroadcastWiring_StartMatchAndReceiveTick is the load-bearing
// test for v2 issue 3: the production wiring that connects
// gameserver.Handlers.Start (which spawns the per-match fan-out
// goroutine) to realtime.Hub via Broadcaster: d.Hub in router.go has
// no test coverage. The realtime hub tests reproduce the fan-out
// inside the test body, so a refactor that drops Broadcaster: d.Hub
// from router.go would still pass CI silently.
//
// This test fails if that wiring is removed: it builds the *real*
// router (so the production Broadcaster wiring runs), starts a match
// via POST /api/match/start, opens a WebSocket against /ws with a
// JWT, sends a join message, and asserts the WS receives a tick
// snapshot for that match within a reasonable time budget.
func TestBroadcastWiring_StartMatchAndReceiveTick(t *testing.T) {
	cfg, err := config.Load()
	require.NoError(t, err)
	cfg.JWTSecret = []byte("test-secret")
	cfg.RateLimitRPS = 1000
	cfg.RateLimitBurst = 1000
	cfg.WalletVerifyRPS = 1000
	cfg.WalletVerifyBurst = 1000

	deps := httpapi.NewDeps(cfg, slog.New(slog.NewTextHandler(io.Discard, nil)))
	srv := httptest.NewServer(httpapi.Build(deps))
	defer srv.Close()

	// Mint a guest JWT and use it as the player ID for the match.
	// That way the match's Players list contains exactly the WS
	// connection's authenticated user, which exercises the same
	// player-membership path production uses.
	tok := guestToken(t, srv)
	claims, err := deps.AuthService.ParseJWT(tok)
	require.NoError(t, err)
	userID := claims.Subject
	require.NotEmpty(t, userID)

	// POST /api/match/start with the authenticated guest as the sole
	// player. This goes through the *real* gameserver.Handlers.Start
	// which is the only path that triggers the production fan-out
	// goroutine (Broadcaster: d.Hub). If router.go ever drops that
	// wiring, this is the test that catches it.
	startBody := `{"matchId":"match-broadcast-test","players":["` + userID + `"]}`
	req, err := http.NewRequest(http.MethodPost, srv.URL+"/api/match/start",
		strings.NewReader(startBody))
	require.NoError(t, err)
	req.Header.Set("Authorization", "Bearer "+tok)
	req.Header.Set("Content-Type", "application/json")
	resp, err := http.DefaultClient.Do(req)
	require.NoError(t, err)
	defer resp.Body.Close()
	require.Equal(t, http.StatusOK, resp.StatusCode)

	var startResp struct {
		MatchID string `json:"matchId"`
	}
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&startResp))
	require.Equal(t, "match-broadcast-test", startResp.MatchID)
	defer deps.Runner.End(startResp.MatchID)

	// Open a WebSocket against /ws and send a join message for the
	// match. The hub registers the connection in match-broadcast-test's
	// room; the production Broadcaster: d.Hub wiring then forwards
	// every per-tick WorldState into that room.
	wsURL := "ws" + strings.TrimPrefix(srv.URL, "http") + "/ws"
	dialCtx, dialCancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer dialCancel()
	conn, _, err := websocket.Dial(dialCtx, wsURL, &websocket.DialOptions{
		HTTPHeader: http.Header{
			"Origin": []string{"http://localhost:5173"},
		},
		Subprotocols: []string{"cas.auth.jwt." + tok, "cas.v1"},
	})
	require.NoError(t, err)
	defer conn.Close(websocket.StatusNormalClosure, "bye")

	joinCtx, joinCancel := context.WithTimeout(context.Background(), 1*time.Second)
	defer joinCancel()
	require.NoError(t, conn.Write(joinCtx, websocket.MessageText,
		[]byte(`{"type":"join","matchId":"match-broadcast-test"}`)))

	// Read at least one published snapshot. The runner ticks at
	// 30Hz, so 500ms is comfortable headroom; we use 1s for CI
	// jitter. The test fails if Broadcaster: d.Hub is removed:
	// without that wiring, the fan-out goroutine never runs, the
	// hub never sees a snapshot, and the read times out.
	readCtx, readCancel := context.WithTimeout(context.Background(), time.Second)
	defer readCancel()
	typ, data, err := conn.Read(readCtx)
	require.NoError(t, err, "WS must receive a tick within 1s; "+
		"if this times out, the production Broadcaster wiring is broken")
	require.Equal(t, websocket.MessageText, typ)

	var snap struct {
		MatchID string `json:"matchId"`
		Tick    int64  `json:"tick"`
	}
	require.NoError(t, json.Unmarshal(data, &snap))
	assert.Equal(t, "match-broadcast-test", snap.MatchID,
		"snapshot must be tagged with the matchId of the publishing runner")
	assert.GreaterOrEqual(t, snap.Tick, int64(1),
		"snapshot tick counter must have advanced at least once")
}
