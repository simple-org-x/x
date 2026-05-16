// Package config loads the server's runtime configuration from the
// environment with sensible developer defaults so `go run ./cmd/api`
// works with no env set. Only primitive types are exposed here so the
// upstream packages do not need to import anything to read settings.
package config

import (
	"os"
	"strconv"
	"strings"
	"time"
)

// Config is the typed view of all environment-driven settings.
type Config struct {
	// HTTPAddr is the listen address for the HTTP+WebSocket server,
	// formatted as ":8080" or "127.0.0.1:8080".
	HTTPAddr string

	// JWTSecret is the HS256 signing secret. A randomized fallback is
	// used in dev so the server still boots without env, but logs warn
	// loudly: rotating secrets between restarts invalidates issued JWTs.
	JWTSecret []byte

	// AllowedOrigins is the CORS allowlist. Default is the Vite dev
	// server. In production set CORS_ALLOWED_ORIGINS to a comma list.
	AllowedOrigins []string

	// RateLimitRPS is the per-IP refill rate for the token bucket.
	RateLimitRPS float64
	// RateLimitBurst is the per-IP bucket size.
	RateLimitBurst int

	// NonceTTL bounds how long an issued wallet-login nonce stays
	// redeemable. Short enough that replay windows are tiny, long
	// enough to survive a slow wallet-signing UX.
	NonceTTL time.Duration
	// JWTTTL is the lifetime of issued session JWTs.
	JWTTTL time.Duration

	// LogLevel is "debug" | "info" | "warn" | "error".
	LogLevel string

	// RedisURL and PostgresURL are read but unused in Phase 1; they
	// reserve the env names so deployment manifests can set them now
	// without a server-side rename when the real adapters land.
	RedisURL    string
	PostgresURL string
}

// Load reads environment variables into a Config. Missing or invalid
// values fall back to defaults; the function never fails so an operator
// misconfiguring a single var does not bring the API down.
func Load() Config {
	return Config{
		HTTPAddr:       envString("HTTP_ADDR", ":"+envString("PORT", "8080")),
		JWTSecret:      []byte(envString("JWT_SECRET", "dev-only-insecure-secret-change-me")),
		AllowedOrigins: splitCSV(envString("CORS_ALLOWED_ORIGINS", "http://localhost:5173")),
		RateLimitRPS:   envFloat("RATE_LIMIT_RPS", 20),
		RateLimitBurst: envInt("RATE_LIMIT_BURST", 40),
		NonceTTL:       envDuration("AUTH_NONCE_TTL", 5*time.Minute),
		JWTTTL:         envDuration("AUTH_JWT_TTL", 24*time.Hour),
		LogLevel:       envString("LOG_LEVEL", "info"),
		RedisURL:       os.Getenv("REDIS_URL"),
		PostgresURL:    os.Getenv("POSTGRES_URL"),
	}
}

// HTTPAddrNormalized ensures the configured listen address always has
// a leading colon when only a port number is supplied.
func (c Config) HTTPAddrNormalized() string {
	addr := strings.TrimSpace(c.HTTPAddr)
	if addr == "" {
		return ":8080"
	}
	if !strings.Contains(addr, ":") {
		return ":" + addr
	}
	return addr
}

func envString(key, fallback string) string {
	if v, ok := os.LookupEnv(key); ok && v != "" {
		return v
	}
	return fallback
}

func envInt(key string, fallback int) int {
	if v, ok := os.LookupEnv(key); ok {
		if n, err := strconv.Atoi(v); err == nil {
			return n
		}
	}
	return fallback
}

func envFloat(key string, fallback float64) float64 {
	if v, ok := os.LookupEnv(key); ok {
		if f, err := strconv.ParseFloat(v, 64); err == nil {
			return f
		}
	}
	return fallback
}

func envDuration(key string, fallback time.Duration) time.Duration {
	if v, ok := os.LookupEnv(key); ok {
		if d, err := time.ParseDuration(v); err == nil {
			return d
		}
	}
	return fallback
}

func splitCSV(s string) []string {
	parts := strings.Split(s, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p != "" {
			out = append(out, p)
		}
	}
	return out
}
