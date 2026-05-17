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
	// APP_ENV defaults to "dev" so config.Load returns the dev JWT
	// fallback rather than ErrJWTSecretRequired. Tests then override
	// JWTSecret to a deterministic value.
	cfg, err := config.Load()
	require.NoError(t, err)
	cfg.JWTSecret = []byte("test-secret")
	cfg.RateLimitRPS = 1000
	cfg.RateLimitBurst = 1000
	// Production wallet-verify limiter is per-address and intentionally
	// tight; tests that exercise non-verify routes need the limiter
	// out of the way. The verify-specific test below builds its own
	// server with a tighter budget.
	cfg.WalletVerifyRPS = 1000
	cfg.WalletVerifyBurst = 1000
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

// TestWalletVerify_PerAddressRateLimitBlocksBeforeNonceWork is the
// load-bearing test for v2 issue 2: an address that exhausts its
// per-address verify budget gets a 429 BEFORE NonceStore.Consume is
// reached, so the legitimate signer's nonce slot is preserved. A
// second address is unaffected, proving buckets are isolated.
func TestWalletVerify_PerAddressRateLimitBlocksBeforeNonceWork(t *testing.T) {
	cfg, err := config.Load()
	require.NoError(t, err)
	cfg.JWTSecret = []byte("test-secret")
	cfg.RateLimitRPS = 1000
	cfg.RateLimitBurst = 1000
	// Tight per-address budget so a small loop exhausts it.
	cfg.WalletVerifyRPS = 0.01
	cfg.WalletVerifyBurst = 2

	deps := httpapi.NewDeps(cfg, slog.New(slog.NewTextHandler(io.Discard, nil)))
	srv := httptest.NewServer(httpapi.Build(deps))
	defer srv.Close()

	// Generate two distinct wallets. Address A is the victim; we
	// exhaust its verify budget with bogus signatures. Address B is
	// the control: its bucket must be untouched.
	privA, err := crypto.GenerateKey()
	require.NoError(t, err)
	addrA := crypto.PubkeyToAddress(privA.PublicKey).Hex()

	privB, err := crypto.GenerateKey()
	require.NoError(t, err)
	addrB := crypto.PubkeyToAddress(privB.PublicKey).Hex()

	// Issue a legitimate nonce for address A so we can prove later
	// the slot is still alive after the throttle kicks in.
	resp, err := http.Post(srv.URL+"/api/auth/wallet/nonce", "application/json",
		strings.NewReader(fmt.Sprintf(`{"address":%q}`, addrA)))
	require.NoError(t, err)
	defer resp.Body.Close()
	require.Equal(t, http.StatusOK, resp.StatusCode)
	var nonceResp struct {
		Nonce   string `json:"nonce"`
		Message string `json:"message"`
	}
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&nonceResp))

	// Burn through address A's burst budget with bogus signatures.
	// At cfg.WalletVerifyBurst=2 the third call must 429. Because
	// the limiter runs BEFORE NonceStore.Consume, the legitimate
	// nonce stays usable through this storm (verified below).
	bogus, _ := json.Marshal(map[string]string{
		"address":   addrA,
		"nonce":     "00000000000000000000000000000000",
		"signature": strings.Repeat("00", 65),
	})
	statuses := make([]int, 0, 4)
	for i := 0; i < 4; i++ {
		r, err := http.Post(srv.URL+"/api/auth/wallet/verify",
			"application/json", bytes.NewReader(bogus))
		require.NoError(t, err)
		statuses = append(statuses, r.StatusCode)
		r.Body.Close()
	}
	// First two calls fall through to VerifyWalletSignature and
	// return 401 (the limiter pays a token but the bogus nonce
	// fails the recovery check). Calls 3 and 4 are throttled at the
	// limiter and return 429 without ever touching NonceStore.
	assert.Equal(t, http.StatusUnauthorized, statuses[0])
	assert.Equal(t, http.StatusUnauthorized, statuses[1])
	assert.Equal(t, http.StatusTooManyRequests, statuses[2],
		"third call must 429 before any nonce work happens")
	assert.Equal(t, http.StatusTooManyRequests, statuses[3])

	// Address B is unaffected: a verify with a real signature
	// against B succeeds end-to-end while A is still throttled.
	respB, err := http.Post(srv.URL+"/api/auth/wallet/nonce", "application/json",
		strings.NewReader(fmt.Sprintf(`{"address":%q}`, addrB)))
	require.NoError(t, err)
	defer respB.Body.Close()
	require.Equal(t, http.StatusOK, respB.StatusCode)
	var bResp struct {
		Nonce   string `json:"nonce"`
		Message string `json:"message"`
	}
	require.NoError(t, json.NewDecoder(respB.Body).Decode(&bResp))

	sigB, err := auth.SignPersonalMessage(privB, bResp.Message)
	require.NoError(t, err)
	verifyB, _ := json.Marshal(map[string]string{
		"address":   addrB,
		"nonce":     bResp.Nonce,
		"signature": hex.EncodeToString(sigB),
	})
	respVB, err := http.Post(srv.URL+"/api/auth/wallet/verify",
		"application/json", bytes.NewReader(verifyB))
	require.NoError(t, err)
	defer respVB.Body.Close()
	assert.Equal(t, http.StatusOK, respVB.StatusCode,
		"a different address must be unaffected by another address's exhausted budget")

	// Now prove address A's nonce slot is still alive: a real
	// signature against the original nonce succeeds once we swap
	// in a fresh limiter. The fresh-limiter swap stands in for the
	// minute-scale wall-clock refill we cannot reasonably wait for
	// in a unit test, and is the pragmatic equivalent of "address
	// A's budget eventually refills".
	deps.AuthVerifyLimiter = auth.NewAddressRateLimiter(1000, 1000)
	srv2 := httptest.NewServer(httpapi.Build(deps))
	defer srv2.Close()

	sigA, err := auth.SignPersonalMessage(privA, nonceResp.Message)
	require.NoError(t, err)
	verifyA, _ := json.Marshal(map[string]string{
		"address":   addrA,
		"nonce":     nonceResp.Nonce,
		"signature": hex.EncodeToString(sigA),
	})
	respVA, err := http.Post(srv2.URL+"/api/auth/wallet/verify",
		"application/json", bytes.NewReader(verifyA))
	require.NoError(t, err)
	defer respVA.Body.Close()
	assert.Equal(t, http.StatusOK, respVA.StatusCode,
		"address A's nonce slot must still be alive after throttling -- "+
			"the limiter ran before any NonceStore.Consume call")
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

func TestMetricsEndpointExposesGoAndCustomCounters(t *testing.T) {
	srv, _ := newServer(t)

	// Hit /healthz first so cas_http_requests_total has a sample.
	resp, err := http.Get(srv.URL + "/healthz")
	require.NoError(t, err)
	resp.Body.Close()
	require.Equal(t, http.StatusOK, resp.StatusCode)

	resp2, err := http.Get(srv.URL + "/metrics")
	require.NoError(t, err)
	defer resp2.Body.Close()
	require.Equal(t, http.StatusOK, resp2.StatusCode)
	body, err := io.ReadAll(resp2.Body)
	require.NoError(t, err)
	text := string(body)
	assert.Contains(t, text, "go_goroutines",
		"default Go runtime collector should be registered")
	assert.Contains(t, text, "cas_http_requests_total",
		"the request-counter middleware should have registered its CounterVec")
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
