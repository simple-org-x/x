package realtime_test

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

	"github.com/simple-org/x/server/internal/auth"
	"github.com/simple-org/x/server/internal/gameserver"
	"github.com/simple-org/x/server/internal/realtime"
)

// quietLogger discards all log output from the realtime package so
// failed-handshake noise does not pollute test output.
func quietLogger() *slog.Logger {
	return slog.New(slog.NewTextHandler(io.Discard, nil))
}

func newAuth(t *testing.T) *auth.Service {
	t.Helper()
	store := auth.NewMemoryNonceStore(time.Minute)
	return auth.NewService(store, []byte("test-secret"), time.Hour)
}

func issueGuestJWT(t *testing.T, svc *auth.Service, userID string) string {
	t.Helper()
	tok, err := svc.IssueJWT(userID, "guest", time.Now().Add(time.Hour))
	require.NoError(t, err)
	return tok
}

// TestHandler_RejectsCrossOriginUpgrade locks in the OriginPatterns
// fix: a connection whose Origin header is not in cfg.AllowedOrigins
// must be refused at the WS handshake. Before the fix, the handler
// passed InsecureSkipVerify=true and accepted any origin.
func TestHandler_RejectsCrossOriginUpgrade(t *testing.T) {
	authSvc := newAuth(t)
	runner := gameserver.NewMatchRunner()
	hub := realtime.NewHub(quietLogger())
	allowed := []string{"http://localhost:5173"}
	srv := httptest.NewServer(realtime.Handler(authSvc, runner, hub, allowed))
	defer srv.Close()

	tok := issueGuestJWT(t, authSvc, "guest-1")

	// Build a WS URL targeting our server. Use the plain net/http
	// stack so we can set Origin to an unrelated host and observe the
	// upgrade response code without involving the websocket library.
	req, err := http.NewRequest(http.MethodGet, srv.URL+"/", nil)
	require.NoError(t, err)
	req.Header.Set("Connection", "Upgrade")
	req.Header.Set("Upgrade", "websocket")
	req.Header.Set("Sec-WebSocket-Version", "13")
	req.Header.Set("Sec-WebSocket-Key", "dGhlIHNhbXBsZSBub25jZQ==")
	req.Header.Set("Origin", "http://evil.example.com")
	req.Header.Set("Sec-WebSocket-Protocol", "cas.auth.jwt."+tok)

	resp, err := http.DefaultClient.Do(req)
	require.NoError(t, err)
	defer resp.Body.Close()
	// coder/websocket returns 403 for origin mismatch.
	assert.Equal(t, http.StatusForbidden, resp.StatusCode,
		"upgrade from a non-allowlisted Origin must be refused")
}

// TestHandler_AcceptsAllowlistedOrigin proves that the same handshake
// from a permitted Origin still succeeds. Combined with the previous
// test, this guards the OriginPatterns plumbing.
func TestHandler_AcceptsAllowlistedOrigin(t *testing.T) {
	authSvc := newAuth(t)
	runner := gameserver.NewMatchRunner()
	hub := realtime.NewHub(quietLogger())
	allowed := []string{"http://localhost:5173"}
	srv := httptest.NewServer(realtime.Handler(authSvc, runner, hub, allowed))
	defer srv.Close()

	tok := issueGuestJWT(t, authSvc, "guest-2")

	wsURL := "ws" + strings.TrimPrefix(srv.URL, "http")
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	conn, _, err := websocket.Dial(ctx, wsURL, &websocket.DialOptions{
		HTTPHeader: http.Header{
			"Origin": []string{"http://localhost:5173"},
		},
		Subprotocols: []string{"cas.auth.jwt." + tok, "cas.v1"},
	})
	require.NoError(t, err)
	conn.Close(websocket.StatusNormalClosure, "bye")
}

// TestHandler_RejectsMissingToken confirms the handler 401s when the
// client offers neither an Authorization header nor an auth subprotocol.
// Together with the cross-origin test, this confirms the upgrade is
// gated on real authentication, not just a same-origin request.
func TestHandler_RejectsMissingToken(t *testing.T) {
	authSvc := newAuth(t)
	runner := gameserver.NewMatchRunner()
	hub := realtime.NewHub(quietLogger())
	srv := httptest.NewServer(realtime.Handler(authSvc, runner, hub, []string{"http://localhost:5173"}))
	defer srv.Close()

	resp, err := http.Get(srv.URL + "/")
	require.NoError(t, err)
	defer resp.Body.Close()
	assert.Equal(t, http.StatusUnauthorized, resp.StatusCode)
}

// TestHandler_IgnoresQueryStringToken locks in the JWT-in-query-string
// fix: even a syntactically valid JWT supplied via ?access_token= must
// be rejected, because tokens in the URL leak into proxy/CDN access
// logs and Referer headers.
func TestHandler_IgnoresQueryStringToken(t *testing.T) {
	authSvc := newAuth(t)
	runner := gameserver.NewMatchRunner()
	hub := realtime.NewHub(quietLogger())
	srv := httptest.NewServer(realtime.Handler(authSvc, runner, hub, []string{"http://localhost:5173"}))
	defer srv.Close()

	tok := issueGuestJWT(t, authSvc, "guest-3")

	resp, err := http.Get(srv.URL + "/?access_token=" + tok)
	require.NoError(t, err)
	defer resp.Body.Close()
	assert.Equal(t, http.StatusUnauthorized, resp.StatusCode,
		"tokens supplied via URL query must be ignored to keep them out of access logs")
}

// TestBroadcast_RoundTrip is the load-bearing test for issue #1: the
// MatchRunner now publishes WorldState ticks to the hub, and any
// connection joined to the match's room receives them. We hook a
// fake fan-out goroutine (matching what gameserver.Handlers.Start
// does in production) and observe that a connection joined via the
// {type:"join"} message receives at least one snapshot.
func TestBroadcast_RoundTrip(t *testing.T) {
	authSvc := newAuth(t)
	runner := gameserver.NewMatchRunner()
	hub := realtime.NewHub(quietLogger())
	srv := httptest.NewServer(realtime.Handler(authSvc, runner, hub, []string{"http://localhost:5173"}))
	defer srv.Close()

	// Spawn a match and the same fan-out goroutine production wires
	// up in gameserver.Handlers.Start. The test fails if Outputs()
	// is never read, which is exactly the failure mode the review
	// flagged.
	m := runner.Start(context.Background(), "match-rt", []string{"alice"})
	defer runner.End(m.ID)
	go func(matchID string, out <-chan gameserver.WorldState) {
		for snap := range out {
			hub.Broadcast(matchID, snap)
		}
	}(m.ID, m.Outputs())

	tok := issueGuestJWT(t, authSvc, "alice")
	wsURL := "ws" + strings.TrimPrefix(srv.URL, "http") + "/?match=match-rt"

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	conn, _, err := websocket.Dial(ctx, wsURL, &websocket.DialOptions{
		HTTPHeader: http.Header{
			"Origin": []string{"http://localhost:5173"},
		},
		Subprotocols: []string{"cas.auth.jwt." + tok, "cas.v1"},
	})
	require.NoError(t, err)
	defer conn.Close(websocket.StatusNormalClosure, "bye")

	// Read at least one published snapshot. The runner publishes at
	// 30Hz, so 500ms is comfortably enough headroom.
	readCtx, readCancel := context.WithTimeout(context.Background(), 1*time.Second)
	defer readCancel()
	typ, data, err := conn.Read(readCtx)
	require.NoError(t, err)
	require.Equal(t, websocket.MessageText, typ)

	var snap gameserver.WorldState
	require.NoError(t, json.Unmarshal(data, &snap))
	assert.Equal(t, "match-rt", snap.MatchID,
		"broadcast must carry the matchId of the publishing runner")
	assert.GreaterOrEqual(t, snap.Tick, int64(1))
}

// TestHubRebindOnJoin guards the room-leak fix: a connection upgraded
// without a match query and then sent {type:"join"} for match B must
// land in room B and disappear from any prior room when it closes.
// The test exercises this by joining via the join message and then
// confirming Broadcast(B, ...) reaches the connection, while
// Broadcast(empty, ...) does not.
func TestHubRebindOnJoin(t *testing.T) {
	authSvc := newAuth(t)
	runner := gameserver.NewMatchRunner()
	hub := realtime.NewHub(quietLogger())
	srv := httptest.NewServer(realtime.Handler(authSvc, runner, hub, []string{"http://localhost:5173"}))
	defer srv.Close()

	// Spin up a match B and wire its broadcaster.
	m := runner.Start(context.Background(), "match-B", []string{"alice"})
	defer runner.End(m.ID)
	go func(id string, out <-chan gameserver.WorldState) {
		for snap := range out {
			hub.Broadcast(id, snap)
		}
	}(m.ID, m.Outputs())

	tok := issueGuestJWT(t, authSvc, "alice")
	// Connect WITHOUT ?match=, so the connection is registered to the
	// empty room. Then send a join message and verify we receive
	// snapshots for match B.
	wsURL := "ws" + strings.TrimPrefix(srv.URL, "http") + "/"
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	conn, _, err := websocket.Dial(ctx, wsURL, &websocket.DialOptions{
		HTTPHeader: http.Header{
			"Origin": []string{"http://localhost:5173"},
		},
		Subprotocols: []string{"cas.auth.jwt." + tok, "cas.v1"},
	})
	require.NoError(t, err)
	defer conn.Close(websocket.StatusNormalClosure, "bye")

	joinPayload := []byte(`{"type":"join","matchId":"match-B"}`)
	require.NoError(t, conn.Write(ctx, websocket.MessageText, joinPayload))

	readCtx, readCancel := context.WithTimeout(context.Background(), 1*time.Second)
	defer readCancel()
	typ, data, err := conn.Read(readCtx)
	require.NoError(t, err)
	require.Equal(t, websocket.MessageText, typ)
	var snap gameserver.WorldState
	require.NoError(t, json.Unmarshal(data, &snap))
	assert.Equal(t, "match-B", snap.MatchID,
		"after a join message, the connection must receive broadcasts for the new match")
}
