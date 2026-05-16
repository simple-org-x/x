package gameserver

import (
	"context"
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/simple-org/x/server/internal/auth"
	"github.com/simple-org/x/server/internal/matchmaking"
)

// Handlers wires the MatchRunner onto the /api/match/* routes.
type Handlers struct {
	Runner      *MatchRunner
	Matchmaking *matchmaking.Service // optional, used to populate /match/{id}
	// Broadcaster is an optional sink for per-tick WorldState
	// snapshots. When set, Start spawns a fan-out goroutine for the
	// new match that drains m.Outputs() and forwards each snapshot
	// via Broadcast. realtime.Hub satisfies this interface.
	Broadcaster Broadcaster
}

// Broadcaster is the seam Handlers uses to publish per-tick world
// state snapshots without importing the realtime package.
type Broadcaster interface {
	Broadcast(matchID string, payload any)
}

// Routes returns a subrouter for /api/match/*.
func (h Handlers) Routes() chi.Router {
	r := chi.NewRouter()
	r.Post("/start", h.Start)
	r.Post("/end", h.End)
	r.Get("/{id}", h.Get)
	return r
}

type startRequest struct {
	MatchID string   `json:"matchId"`
	Players []string `json:"players"`
}

type startResponse struct {
	MatchID string   `json:"matchId"`
	Players []string `json:"players"`
}

// Start handles POST /api/match/start. The caller may supply a known
// matchID (e.g. one returned by matchmaking) or omit it for a fresh
// uuid. Phase 1 trusts the JWT to authorize match creation.
func (h Handlers) Start(w http.ResponseWriter, r *http.Request) {
	claims := auth.ClaimsFrom(r.Context())
	if claims == nil || claims.Subject == "" {
		writeError(w, http.StatusUnauthorized, "missing subject")
		return
	}
	var req startRequest
	if r.ContentLength > 0 {
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid request body")
			return
		}
	}
	if len(req.Players) == 0 {
		req.Players = []string{claims.Subject}
	}
	m := h.Runner.Start(context.Background(), req.MatchID, req.Players)
	if h.Broadcaster != nil {
		// Fan-out goroutine: drain the per-match WorldState channel
		// and publish each tick to every connection in the hub's
		// room for this match. The channel closes when the runner
		// ends the match, which terminates this goroutine cleanly.
		go func(matchID string, out <-chan WorldState) {
			for snap := range out {
				h.Broadcaster.Broadcast(matchID, snap)
			}
		}(m.ID, m.Outputs())
	}
	if h.Matchmaking != nil {
		h.Matchmaking.RegisterMatch(matchmaking.Match{
			ID:      m.ID,
			Mode:    matchmaking.ModeSolo,
			Region:  "global",
			Players: m.Players,
		})
	}
	writeJSON(w, http.StatusOK, startResponse{MatchID: m.ID, Players: m.Players})
}

type endRequest struct {
	MatchID string `json:"matchId"`
}

// End handles POST /api/match/end.
func (h Handlers) End(w http.ResponseWriter, r *http.Request) {
	var req endRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if err := h.Runner.End(req.MatchID); err != nil {
		writeError(w, http.StatusNotFound, "unknown match")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// Get handles GET /api/match/{id}.
func (h Handlers) Get(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if id == "" {
		writeError(w, http.StatusBadRequest, "missing match id")
		return
	}
	if h.Matchmaking != nil {
		if m, ok := h.Matchmaking.LookupMatch(id); ok {
			writeJSON(w, http.StatusOK, m)
			return
		}
	}
	if m, ok := h.Runner.Lookup(id); ok {
		writeJSON(w, http.StatusOK, map[string]any{
			"id":      m.ID,
			"players": m.Players,
			"started": m.StartedAt,
		})
		return
	}
	writeError(w, http.StatusNotFound, "match not found")
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}
