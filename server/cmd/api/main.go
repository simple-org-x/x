// cmd/api is the production entry point. It loads config, wires the
// in-memory dependency bag, builds the chi router, and runs an
// http.Server with graceful shutdown on SIGINT/SIGTERM.
package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/simple-org/x/server/internal/config"
	"github.com/simple-org/x/server/internal/httpapi"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		// Hard-fail before logging so an unprivileged operator gets
		// a clear stderr message even when stdout JSON logging is
		// not configured yet.
		_, _ = os.Stderr.WriteString("config_error: " + err.Error() + "\n")
		os.Exit(2)
	}

	level := parseLogLevel(cfg.LogLevel)
	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: level}))
	slog.SetDefault(logger)

	deps := httpapi.NewDeps(cfg, logger)
	router := httpapi.Build(deps)

	// Start the per-IP rate-limiter sweeper so its bucket map cannot
	// grow unboundedly under address rotation.
	janitorCtx, janitorCancel := context.WithCancel(context.Background())
	defer janitorCancel()
	deps.RateLimiter.StartJanitor(janitorCtx, 0)

	server := &http.Server{
		Addr:              cfg.HTTPAddrNormalized(),
		Handler:           router,
		ReadHeaderTimeout: 10 * time.Second,
		// /ws upgrades hijack the connection, so a tight WriteTimeout
		// would kill long-running sockets. Keep timeouts off here and
		// rely on the WS-level read deadlines for liveness.
	}

	logger.Info("server_start",
		"addr", server.Addr,
		"allowed_origins", cfg.AllowedOrigins,
		"rate_limit_rps", cfg.RateLimitRPS,
	)

	// Graceful shutdown: SIGINT/SIGTERM trigger Shutdown(ctx) with a
	// 10s budget and EndAll on the match runner.
	idleClosed := make(chan struct{})
	go func() {
		sig := make(chan os.Signal, 1)
		signal.Notify(sig, syscall.SIGINT, syscall.SIGTERM)
		<-sig
		logger.Info("server_shutdown_initiated")
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		deps.Runner.EndAll()
		if err := server.Shutdown(ctx); err != nil {
			logger.Error("server_shutdown_error", "err", err.Error())
		}
		close(idleClosed)
	}()

	if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		logger.Error("server_listen_error", "err", err.Error())
		os.Exit(1)
	}
	<-idleClosed
	logger.Info("server_stopped")
}

func parseLogLevel(s string) slog.Level {
	switch s {
	case "debug":
		return slog.LevelDebug
	case "warn":
		return slog.LevelWarn
	case "error":
		return slog.LevelError
	default:
		return slog.LevelInfo
	}
}
