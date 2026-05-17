// Package httpapi is the assembly point for the HTTP+WebSocket API. It
// wires every dependency into a chi.Router so cmd/api can `Build` a
// router for the production server, and tests can `Build` an
// equivalent router behind httptest.Server without spinning up real
// infrastructure.
package httpapi

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/prometheus/client_golang/prometheus/promhttp"

	"github.com/simple-org/x/server/internal/auth"
	"github.com/simple-org/x/server/internal/config"
	"github.com/simple-org/x/server/internal/gameserver"
	"github.com/simple-org/x/server/internal/matchmaking"
	"github.com/simple-org/x/server/internal/middleware"
	"github.com/simple-org/x/server/internal/realtime"
	"github.com/simple-org/x/server/internal/rewards"
)

// Deps is the bag of pre-built collaborators a router needs. cmd/api
// constructs a Deps with production implementations; tests construct
// a Deps with in-memory ones (which is what we currently ship in both
// cases).
type Deps struct {
	Config            config.Config
	Logger            *slog.Logger
	AuthService       *auth.Service
	AuthVerifyLimiter *auth.AddressRateLimiter
	Matchmaking       *matchmaking.Service
	Runner            *gameserver.MatchRunner
	Hub               *realtime.Hub
	Ledger            rewards.Ledger
	RateLimiter       *middleware.IPRateLimiter
	Metrics           *middleware.Metrics
}

// NewDeps builds the standard set of in-memory implementations from
// cfg. Callers may override individual fields after construction.
func NewDeps(cfg config.Config, logger *slog.Logger) Deps {
	if logger == nil {
		logger = slog.Default()
	}
	nonceStore := auth.NewMemoryNonceStore(cfg.NonceTTL)
	authSvc := auth.NewService(nonceStore, cfg.JWTSecret, cfg.JWTTTL)
	// Per-address verify limiter: a steady drip with a small burst
	// so a legitimate wallet that retries a few times still gets
	// through, while a single address cannot empty MaxNonceAttempts
	// against its own slot back-to-back without being throttled.
	verifyLimiter := auth.NewAddressRateLimiter(cfg.WalletVerifyRPS, cfg.WalletVerifyBurst)
	queue := matchmaking.NewMemoryQueue()
	mm := matchmaking.NewService(queue)
	runner := gameserver.NewMatchRunner()
	hub := realtime.NewHub(logger)
	ledger := rewards.NewMemoryLedger()
	rl := middleware.NewIPRateLimiter(cfg.RateLimitRPS, cfg.RateLimitBurst)
	metrics := middleware.NewMetrics(nil)
	return Deps{
		Config:            cfg,
		Logger:            logger,
		AuthService:       authSvc,
		AuthVerifyLimiter: verifyLimiter,
		Matchmaking:       mm,
		Runner:            runner,
		Hub:               hub,
		Ledger:            ledger,
		RateLimiter:       rl,
		Metrics:           metrics,
	}
}

// Build assembles the chi router used by both the production server
// and the smoke tests. The middleware stack (in order) is: request ID,
// structured logger, panic recovery, security headers, CORS, per-IP rate limiter.
func Build(d Deps) chi.Router {
	r := chi.NewRouter()
	r.Use(middleware.RequestID)
	r.Use(middleware.Logger(d.Logger))
	r.Use(middleware.Recover(d.Logger))
	r.Use(middleware.SecurityHeaders)
	r.Use(middleware.CORS(d.Config.AllowedOrigins))
	r.Use(d.RateLimiter.Middleware)
	if d.Metrics != nil {
		r.Use(d.Metrics.Middleware)
	}

	r.Get("/healthz", healthz)
	r.Get("/readyz", readyz)
	if d.Metrics != nil {
		// /metrics returns the Prometheus default text exposition;
		// promhttp adds Content-Type and gzip negotiation for us.
		r.Method(http.MethodGet, "/metrics",
			promhttp.HandlerFor(d.Metrics.Registry, promhttp.HandlerOpts{}))
	}

	authH := auth.Handlers{Service: d.AuthService, VerifyLimiter: d.AuthVerifyLimiter}
	r.Mount("/api/auth", authH.Routes())

	// Authenticated subroutes share a single auth middleware.
	r.Group(func(api chi.Router) {
		api.Use(authH.Middleware)

		mmH := matchmaking.Handlers{Service: d.Matchmaking}
		api.Mount("/api/matchmaking", mmH.Routes())

		gsH := gameserver.Handlers{Runner: d.Runner, Matchmaking: d.Matchmaking, Broadcaster: d.Hub}
		api.Mount("/api/match", gsH.Routes())

		rwH := rewards.Handlers{Ledger: d.Ledger}
		api.Mount("/api/rewards", rwH.Routes())
	})

	// /ws does its own JWT check (the chi auth middleware would 401
	// before we can upgrade the connection cleanly).
	r.Handle("/ws", realtime.Handler(d.AuthService, d.Runner, d.Hub, d.Config.AllowedOrigins))

	return r
}

func healthz(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"status": "ok",
		"time":   time.Now().UTC(),
	})
}

func readyz(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"status": "ready",
		"time":   time.Now().UTC(),
	})
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}
