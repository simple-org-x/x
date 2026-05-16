package matchmaking

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/simple-org/x/server/internal/auth"
)

// Handlers wires the Service onto chi routes. Mount under /api/matchmaking.
type Handlers struct {
	Service *Service
}

// Routes returns the subrouter for /api/matchmaking/*.
func (h Handlers) Routes() chi.Router {
	r := chi.NewRouter()
	r.Post("/queue", h.Enqueue)
	r.Delete("/queue", h.Cancel)
	r.Get("/status", h.Status)
	return r
}

// enqueueRequest is the body for POST /api/matchmaking/queue. The
// userID is taken from the JWT, not the body, so callers cannot
// queue someone else.
type enqueueRequest struct {
	Mode   string `json:"mode"`
	MMR    int    `json:"mmr"`
	Region string `json:"region"`
}

// Enqueue handles POST /api/matchmaking/queue.
func (h Handlers) Enqueue(w http.ResponseWriter, r *http.Request) {
	claims := auth.ClaimsFrom(r.Context())
	if claims == nil || claims.Subject == "" {
		writeError(w, http.StatusUnauthorized, "missing subject")
		return
	}
	var req enqueueRequest
	if r.ContentLength > 0 {
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid request body")
			return
		}
	}
	ticket, err := h.Service.EnqueuePlayer(claims.Subject, req.Mode, req.MMR, req.Region)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, ticket)
}

// Cancel handles DELETE /api/matchmaking/queue.
func (h Handlers) Cancel(w http.ResponseWriter, r *http.Request) {
	claims := auth.ClaimsFrom(r.Context())
	if claims == nil || claims.Subject == "" {
		writeError(w, http.StatusUnauthorized, "missing subject")
		return
	}
	if err := h.Service.Cancel(claims.Subject); err != nil {
		if errors.Is(err, ErrNotQueued) {
			writeError(w, http.StatusNotFound, "not queued")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to cancel")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// Status handles GET /api/matchmaking/status.
func (h Handlers) Status(w http.ResponseWriter, r *http.Request) {
	claims := auth.ClaimsFrom(r.Context())
	if claims == nil || claims.Subject == "" {
		writeError(w, http.StatusUnauthorized, "missing subject")
		return
	}
	ticket, _ := h.Service.Status(claims.Subject)
	writeJSON(w, http.StatusOK, ticket)
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}
