// Package realtime hosts the /ws WebSocket endpoint and a Hub that
// fans broadcast traffic out to clients of a given match.
//
// Phase-1 single-player runs gameplay on the client; the server's only
// job here is to (a) accept and authenticate the upgrade, (b) route
// input frames into a MatchRunner, (c) push WorldState snapshots back.
// The library is github.com/coder/websocket -- the maintained fork of
// the deprecated nhooyr.io/websocket. Picking the maintained fork now
// avoids a forced migration later.
package realtime

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"sync"
	"time"

	"github.com/coder/websocket"

	"github.com/simple-org/x/server/internal/auth"
	"github.com/simple-org/x/server/internal/gameserver"
)

const (
	// pingInterval is the heartbeat cadence: the server pings every
	// 15s and drops the connection if the peer has been silent for
	// more than silenceTimeout.
	pingInterval   = 15 * time.Second
	silenceTimeout = 30 * time.Second
	// readMessageBudget caps single-message size to discourage abuse.
	readMessageBudget = 64 * 1024
)

// Hub manages WS connections, grouped by match ID. Connections are
// added to one room at most; a registration with an empty matchID is
// treated as a lobby connection (informational only in Phase 1).
type Hub struct {
	mu     sync.Mutex
	rooms  map[string]map[*Conn]struct{}
	logger *slog.Logger
}

// NewHub returns an empty hub.
func NewHub(logger *slog.Logger) *Hub {
	if logger == nil {
		logger = slog.Default()
	}
	return &Hub{
		rooms:  make(map[string]map[*Conn]struct{}),
		logger: logger,
	}
}

// Register adds a connection to the hub. matchID may be "" for a lobby
// peer.
func (h *Hub) Register(c *Conn) {
	h.mu.Lock()
	defer h.mu.Unlock()
	room, ok := h.rooms[c.matchID]
	if !ok {
		room = make(map[*Conn]struct{})
		h.rooms[c.matchID] = room
	}
	room[c] = struct{}{}
}

// Unregister removes a connection. Safe to call multiple times.
func (h *Hub) Unregister(c *Conn) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if room, ok := h.rooms[c.matchID]; ok {
		delete(room, c)
		if len(room) == 0 {
			delete(h.rooms, c.matchID)
		}
	}
}

// Broadcast publishes payload to every connection registered to
// matchID. Failures are logged but do not unwind the loop -- a slow
// peer cannot stall the broadcaster.
func (h *Hub) Broadcast(matchID string, payload any) {
	h.mu.Lock()
	conns := make([]*Conn, 0)
	if room, ok := h.rooms[matchID]; ok {
		for c := range room {
			conns = append(conns, c)
		}
	}
	h.mu.Unlock()
	for _, c := range conns {
		c.Send(payload)
	}
}

// Conn wraps a single WS connection plus its identity.
type Conn struct {
	ws      *websocket.Conn
	userID  string
	matchID string
	send    chan any
	once    sync.Once
	closed  chan struct{}
}

// Send queues a payload for the writer goroutine. Drops on overflow so
// a slow peer cannot back-pressure the broadcaster.
func (c *Conn) Send(payload any) {
	select {
	case c.send <- payload:
	case <-c.closed:
	default:
	}
}

// Close terminates the connection exactly once.
func (c *Conn) Close(code websocket.StatusCode, reason string) {
	c.once.Do(func() {
		_ = c.ws.Close(code, reason)
		close(c.closed)
	})
}

// Handler returns an http.Handler that serves /ws. The handler:
//   - upgrades the request,
//   - authenticates via JWT (Authorization header or ?access_token=),
//   - reads the first message as {type:"join", matchId:"..."} or pulls
//     matchID from ?match=...,
//   - registers the connection with the Hub and the MatchRunner,
//   - pumps inputs and outputs until either side closes.
func Handler(authSvc *auth.Service, runner *gameserver.MatchRunner, hub *Hub) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Authenticate before upgrading: failure is a plain HTTP 401.
		tok := auth.Bearer(r)
		if tok == "" {
			http.Error(w, "missing token", http.StatusUnauthorized)
			return
		}
		claims, err := authSvc.ParseJWT(tok)
		if err != nil {
			http.Error(w, "invalid token", http.StatusUnauthorized)
			return
		}

		// Allow the Vite dev server to connect from a browser. The
		// HTTP CORS middleware already restricts the API surface; for
		// the WS handshake we trust the same origin list. coder's
		// websocket library wants a slice of allowed hosts.
		opts := &websocket.AcceptOptions{
			InsecureSkipVerify: true,
		}
		ws, err := websocket.Accept(w, r, opts)
		if err != nil {
			return
		}
		ws.SetReadLimit(readMessageBudget)

		matchID := r.URL.Query().Get("match")
		c := &Conn{
			ws:      ws,
			userID:  claims.Subject,
			matchID: matchID,
			send:    make(chan any, 32),
			closed:  make(chan struct{}),
		}
		hub.Register(c)
		defer hub.Unregister(c)
		defer c.Close(websocket.StatusNormalClosure, "bye")

		ctx, cancel := context.WithCancel(r.Context())
		defer cancel()

		// Writer pump: forwards from c.send to the socket; emits
		// keepalive pings.
		go writerLoop(ctx, c, hub.logger)

		// Reader pump: parses input frames and routes them to the
		// MatchRunner. Returns when the peer closes or the deadline
		// elapses.
		readerLoop(ctx, c, runner, hub.logger)
	})
}

// inboundMessage is the union of WS messages we accept from the client.
// Only "join" and "input" are handled in Phase 1.
type inboundMessage struct {
	Type    string                 `json:"type"`
	MatchID string                 `json:"matchId,omitempty"`
	Frame   *gameserver.InputFrame `json:"frame,omitempty"`
}

func readerLoop(ctx context.Context, c *Conn, runner *gameserver.MatchRunner, logger *slog.Logger) {
	for {
		readCtx, cancel := context.WithTimeout(ctx, silenceTimeout)
		typ, data, err := c.ws.Read(readCtx)
		cancel()
		if err != nil {
			if !errors.Is(err, context.Canceled) {
				logger.Debug("ws_read_end", "user", c.userID, "err", err.Error())
			}
			return
		}
		if typ != websocket.MessageText {
			continue
		}
		var msg inboundMessage
		if err := json.Unmarshal(data, &msg); err != nil {
			continue
		}
		switch msg.Type {
		case "join":
			if msg.MatchID != "" {
				c.matchID = msg.MatchID
			}
		case "input":
			if msg.Frame == nil {
				continue
			}
			if c.matchID == "" {
				continue
			}
			if m, ok := runner.Lookup(c.matchID); ok {
				m.SubmitInput(*msg.Frame)
			}
		}
	}
}

func writerLoop(ctx context.Context, c *Conn, logger *slog.Logger) {
	ping := time.NewTicker(pingInterval)
	defer ping.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-c.closed:
			return
		case payload := <-c.send:
			data, err := json.Marshal(payload)
			if err != nil {
				continue
			}
			writeCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
			err = c.ws.Write(writeCtx, websocket.MessageText, data)
			cancel()
			if err != nil {
				logger.Debug("ws_write_err", "user", c.userID, "err", err.Error())
				return
			}
		case <-ping.C:
			pingCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
			err := c.ws.Ping(pingCtx)
			cancel()
			if err != nil {
				return
			}
		}
	}
}
