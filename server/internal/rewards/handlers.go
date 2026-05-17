package rewards

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/simple-org/x/server/internal/auth"
)

// Handlers wires the Ledger onto chi routes. Mount under /api/rewards.
type Handlers struct {
	Ledger Ledger
}

// Routes returns the subrouter for /api/rewards/*.
func (h Handlers) Routes() chi.Router {
	r := chi.NewRouter()
	r.Get("/me", h.Me)
	r.Post("/claim", h.Claim)
	return r
}

type meResponse struct {
	UserID  string         `json:"userId"`
	Rewards []Distribution `json:"rewards"`
}

// Me handles GET /api/rewards/me.
func (h Handlers) Me(w http.ResponseWriter, r *http.Request) {
	claims := auth.ClaimsFrom(r.Context())
	if claims == nil || claims.Subject == "" {
		writeError(w, http.StatusUnauthorized, "missing subject")
		return
	}
	rewards, err := h.Ledger.UserRewards(claims.Subject)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load rewards")
		return
	}
	writeJSON(w, http.StatusOK, meResponse{UserID: claims.Subject, Rewards: rewards})
}

type claimRequest struct {
	TxID string `json:"txId"`
}

// Claim handles POST /api/rewards/claim. It is currently a stub: the
// in-memory ledger flips a Claimed bit, simulating an on-chain payout.
func (h Handlers) Claim(w http.ResponseWriter, r *http.Request) {
	claims := auth.ClaimsFrom(r.Context())
	if claims == nil || claims.Subject == "" {
		writeError(w, http.StatusUnauthorized, "missing subject")
		return
	}
	var req claimRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	dist, err := h.Ledger.Claim(claims.Subject, req.TxID)
	if err != nil {
		if errors.Is(err, ErrUnknownTx) {
			writeError(w, http.StatusNotFound, "unknown transaction")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to claim")
		return
	}
	writeJSON(w, http.StatusOK, dist)
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}
