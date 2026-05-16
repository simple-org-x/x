package auth

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/ethereum/go-ethereum/common"
	"github.com/go-chi/chi/v5"
)

// Handlers wires the auth.Service onto chi routes. Mount with:
//
//	r.Mount("/api/auth", auth.Handlers{Service: svc}.Routes())
type Handlers struct {
	Service *Service
	// VerifyLimiter, when non-nil, throttles POST /wallet/verify per
	// wallet address. The check runs before NonceStore.Consume, so
	// an exhausted budget returns 429 without burning a nonce
	// attempt against the target slot.
	VerifyLimiter *AddressRateLimiter
}

// Routes returns the subrouter that owns /api/auth/*.
func (h Handlers) Routes() chi.Router {
	r := chi.NewRouter()
	r.Post("/guest", h.Guest)
	r.Post("/wallet/nonce", h.WalletNonce)
	r.Post("/wallet/verify", h.WalletVerify)
	return r
}

// Guest implements POST /api/auth/guest -> issues a JWT bound to a
// freshly minted guest ID. No request body is required.
func (h Handlers) Guest(w http.ResponseWriter, _ *http.Request) {
	sess, err := h.Service.StartGuestSession()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to start guest session")
		return
	}
	writeJSON(w, http.StatusOK, sess)
}

// nonceRequest is the body for POST /api/auth/wallet/nonce.
type nonceRequest struct {
	Address string `json:"address"`
}

// nonceResponse is the body returned by that same endpoint.
type nonceResponse struct {
	Address string `json:"address"`
	Nonce   string `json:"nonce"`
	Message string `json:"message"`
}

// WalletNonce implements POST /api/auth/wallet/nonce.
func (h Handlers) WalletNonce(w http.ResponseWriter, r *http.Request) {
	var req nonceRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if !common.IsHexAddress(req.Address) {
		writeError(w, http.StatusBadRequest, "invalid address")
		return
	}
	nonce, err := h.Service.NonceStore.Issue(req.Address)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to issue nonce")
		return
	}
	writeJSON(w, http.StatusOK, nonceResponse{
		Address: common.HexToAddress(req.Address).Hex(),
		Nonce:   nonce,
		Message: LoginMessageFor(nonce),
	})
}

// verifyRequest is the body for POST /api/auth/wallet/verify.
type verifyRequest struct {
	Address   string `json:"address"`
	Nonce     string `json:"nonce"`
	Signature string `json:"signature"`
}

// verifyResponse mirrors GuestSession but adds the address.
type verifyResponse struct {
	UserID  string    `json:"userId"`
	Address string    `json:"address"`
	Token   string    `json:"token"`
	Expires time.Time `json:"expires"`
}

// WalletVerify implements POST /api/auth/wallet/verify.
func (h Handlers) WalletVerify(w http.ResponseWriter, r *http.Request) {
	var req verifyRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	// Per-address rate limit runs before VerifyWalletSignature so an
	// exhausted budget returns 429 without burning a nonce attempt
	// against the target slot. The IP-level limiter upstream still
	// catches floods from a single source; this one isolates work
	// per wallet so an attacker who knows a target address cannot
	// slot-cycle the victim's nonce by rotating source IPs.
	if h.VerifyLimiter != nil && !h.VerifyLimiter.Allow(req.Address) {
		writeError(w, http.StatusTooManyRequests, "rate limit exceeded")
		return
	}
	addr, err := h.Service.VerifyWalletSignature(req.Address, req.Nonce, req.Signature)
	if err != nil {
		switch {
		case errors.Is(err, ErrNonceNotFound):
			writeError(w, http.StatusUnauthorized, "nonce not found")
		case errors.Is(err, ErrInvalidAddress):
			writeError(w, http.StatusBadRequest, "invalid address")
		default:
			writeError(w, http.StatusUnauthorized, "invalid signature")
		}
		return
	}
	expires := h.Service.now().Add(h.Service.JWTTTL)
	tok, err := h.Service.IssueJWT(addr, "wallet", expires)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to issue token")
		return
	}
	writeJSON(w, http.StatusOK, verifyResponse{
		UserID:  addr,
		Address: addr,
		Token:   tok,
		Expires: expires,
	})
}

// Bearer extracts a JWT from the Authorization header (Bearer scheme).
// Returns "" if no token is present.
//
// Tokens are deliberately not accepted via the access_token query
// parameter: query strings leak into reverse-proxy and CDN access
// logs, into Referer headers on subresource fetches, and into browser
// history. The WS handshake passes its JWT via the
// Sec-WebSocket-Protocol header (see realtime.Handler) for the same
// reason.
func Bearer(r *http.Request) string {
	auth := r.Header.Get("Authorization")
	if auth == "" {
		return ""
	}
	parts := strings.SplitN(auth, " ", 2)
	if len(parts) == 2 && strings.EqualFold(parts[0], "Bearer") {
		return strings.TrimSpace(parts[1])
	}
	return ""
}

// Middleware enforces a valid JWT and stashes the parsed claims in
// request context. Handlers can pull them out via ClaimsFrom.
func (h Handlers) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		tok := Bearer(r)
		if tok == "" {
			writeError(w, http.StatusUnauthorized, "missing token")
			return
		}
		claims, err := h.Service.ParseJWT(tok)
		if err != nil {
			writeError(w, http.StatusUnauthorized, "invalid token")
			return
		}
		ctx := WithClaims(r.Context(), claims)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}

func decodeJSON(r *http.Request, dst any) error {
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()
	return dec.Decode(dst)
}
