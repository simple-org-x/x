package httpapi_test

import (
	"bytes"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/ethereum/go-ethereum/crypto"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/simple-org/x/server/internal/auth"
	"github.com/simple-org/x/server/internal/config"
	"github.com/simple-org/x/server/internal/httpapi"
)

func newServer(t *testing.T) (*httptest.Server, httpapi.Deps) {
	t.Helper()
	cfg := config.Load()
	cfg.JWTSecret = []byte("test-secret")
	cfg.RateLimitRPS = 1000
	cfg.RateLimitBurst = 1000
	deps := httpapi.NewDeps(cfg, slog.New(slog.NewTextHandler(io.Discard, nil)))
	srv := httptest.NewServer(httpapi.Build(deps))
	t.Cleanup(srv.Close)
	return srv, deps
}

func TestHealthzReturns200(t *testing.T) {
	srv, _ := newServer(t)
	resp, err := http.Get(srv.URL + "/healthz")
	require.NoError(t, err)
	defer resp.Body.Close()
	assert.Equal(t, http.StatusOK, resp.StatusCode)
}

func TestReadyzReturns200(t *testing.T) {
	srv, _ := newServer(t)
	resp, err := http.Get(srv.URL + "/readyz")
	require.NoError(t, err)
	defer resp.Body.Close()
	assert.Equal(t, http.StatusOK, resp.StatusCode)
}

func TestGuestEndpointReturnsJWT(t *testing.T) {
	srv, _ := newServer(t)
	resp, err := http.Post(srv.URL+"/api/auth/guest", "application/json", nil)
	require.NoError(t, err)
	defer resp.Body.Close()
	require.Equal(t, http.StatusOK, resp.StatusCode)

	var body struct {
		UserID string `json:"userId"`
		Token  string `json:"token"`
	}
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&body))
	assert.NotEmpty(t, body.Token)
	assert.NotEmpty(t, body.UserID)
}

func TestMatchmakingQueueWithGuestJWT(t *testing.T) {
	srv, _ := newServer(t)
	tok := guestToken(t, srv)

	body := strings.NewReader(`{"mode":"solo","mmr":1000,"region":"global"}`)
	req, _ := http.NewRequest(http.MethodPost, srv.URL+"/api/matchmaking/queue", body)
	req.Header.Set("Authorization", "Bearer "+tok)
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	require.NoError(t, err)
	defer resp.Body.Close()
	require.Equal(t, http.StatusOK, resp.StatusCode)

	var ticket struct {
		UserID string `json:"userId"`
		Queued bool   `json:"queued"`
		Match  *struct {
			ID      string   `json:"id"`
			Players []string `json:"players"`
		} `json:"match"`
	}
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&ticket))
	assert.NotEmpty(t, ticket.UserID)
	require.NotNil(t, ticket.Match, "solo mode should mint a Match immediately")
	assert.NotEmpty(t, ticket.Match.ID)
}

func TestMatchmakingRejectsMissingJWT(t *testing.T) {
	srv, _ := newServer(t)
	resp, err := http.Post(srv.URL+"/api/matchmaking/queue", "application/json", strings.NewReader(`{}`))
	require.NoError(t, err)
	defer resp.Body.Close()
	assert.Equal(t, http.StatusUnauthorized, resp.StatusCode)
}

func TestWalletNonceAndVerifyHappyPath(t *testing.T) {
	srv, _ := newServer(t)

	priv, err := crypto.GenerateKey()
	require.NoError(t, err)
	addr := crypto.PubkeyToAddress(priv.PublicKey).Hex()

	// 1) request a nonce
	nonceBody := fmt.Sprintf(`{"address":%q}`, addr)
	resp, err := http.Post(srv.URL+"/api/auth/wallet/nonce", "application/json", strings.NewReader(nonceBody))
	require.NoError(t, err)
	defer resp.Body.Close()
	require.Equal(t, http.StatusOK, resp.StatusCode)
	var nonceResp struct {
		Nonce   string `json:"nonce"`
		Message string `json:"message"`
	}
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&nonceResp))
	require.NotEmpty(t, nonceResp.Nonce)
	require.NotEmpty(t, nonceResp.Message)

	// 2) sign the canonical login message
	sig, err := auth.SignPersonalMessage(priv, nonceResp.Message)
	require.NoError(t, err)

	// 3) verify -> JWT
	verifyBody, _ := json.Marshal(map[string]string{
		"address":   addr,
		"nonce":     nonceResp.Nonce,
		"signature": hex.EncodeToString(sig),
	})
	resp2, err := http.Post(srv.URL+"/api/auth/wallet/verify", "application/json", bytes.NewReader(verifyBody))
	require.NoError(t, err)
	defer resp2.Body.Close()
	require.Equal(t, http.StatusOK, resp2.StatusCode)
	var verifyResp struct {
		UserID  string `json:"userId"`
		Address string `json:"address"`
		Token   string `json:"token"`
	}
	require.NoError(t, json.NewDecoder(resp2.Body).Decode(&verifyResp))
	assert.NotEmpty(t, verifyResp.Token)
	assert.Equal(t, addr, verifyResp.Address)
}

func TestRewardsMeRequiresAuth(t *testing.T) {
	srv, _ := newServer(t)
	resp, err := http.Get(srv.URL + "/api/rewards/me")
	require.NoError(t, err)
	defer resp.Body.Close()
	assert.Equal(t, http.StatusUnauthorized, resp.StatusCode)
}

func TestMatchStartAndLookup(t *testing.T) {
	srv, deps := newServer(t)
	tok := guestToken(t, srv)

	req, _ := http.NewRequest(http.MethodPost, srv.URL+"/api/match/start",
		strings.NewReader(`{"players":["alice","bob"]}`))
	req.Header.Set("Authorization", "Bearer "+tok)
	req.Header.Set("Content-Type", "application/json")
	resp, err := http.DefaultClient.Do(req)
	require.NoError(t, err)
	defer resp.Body.Close()
	require.Equal(t, http.StatusOK, resp.StatusCode)

	var startResp struct {
		MatchID string   `json:"matchId"`
		Players []string `json:"players"`
	}
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&startResp))
	require.NotEmpty(t, startResp.MatchID)
	assert.ElementsMatch(t, []string{"alice", "bob"}, startResp.Players)

	// Lookup via /api/match/{id}
	req2, _ := http.NewRequest(http.MethodGet, srv.URL+"/api/match/"+startResp.MatchID, nil)
	req2.Header.Set("Authorization", "Bearer "+tok)
	resp2, err := http.DefaultClient.Do(req2)
	require.NoError(t, err)
	defer resp2.Body.Close()
	assert.Equal(t, http.StatusOK, resp2.StatusCode)

	// Cleanup the per-match goroutine.
	_ = deps.Runner.End(startResp.MatchID)
}

func guestToken(t *testing.T, srv *httptest.Server) string {
	t.Helper()
	resp, err := http.Post(srv.URL+"/api/auth/guest", "application/json", nil)
	require.NoError(t, err)
	defer resp.Body.Close()
	require.Equal(t, http.StatusOK, resp.StatusCode)
	var body struct {
		Token string `json:"token"`
	}
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&body))
	require.NotEmpty(t, body.Token)
	return body.Token
}
