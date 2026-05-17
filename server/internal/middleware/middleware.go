// Package middleware bundles the small set of HTTP middlewares the API
// installs on every route: request IDs, structured access logging,
// panic recovery, per-IP rate limiting, and CORS.
package middleware

import (
	"bufio"
	"context"
	"crypto/rand"
	"encoding/hex"
	"log/slog"
	"net"
	"net/http"
	"runtime/debug"
	"strings"
	"sync"
	"time"

	"golang.org/x/time/rate"
)

type ctxKey string

const requestIDCtxKey ctxKey = "request-id"

// RequestIDFrom returns the request ID associated with ctx, or "" if
// the request did not pass through the RequestID middleware.
func RequestIDFrom(ctx context.Context) string {
	v, _ := ctx.Value(requestIDCtxKey).(string)
	return v
}

// RequestID assigns each request a short hex ID, echoes it on the
// X-Request-ID response header, and stashes it in ctx for log fields.
func RequestID(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id := r.Header.Get("X-Request-ID")
		if id == "" {
			id = newRequestID()
		}
		w.Header().Set("X-Request-ID", id)
		ctx := context.WithValue(r.Context(), requestIDCtxKey, id)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func newRequestID() string {
	var b [8]byte
	_, _ = rand.Read(b[:])
	return hex.EncodeToString(b[:])
}

// statusRecorder lets the logger middleware see the response status.
type statusRecorder struct {
	http.ResponseWriter
	status int
	bytes  int
}

func (s *statusRecorder) WriteHeader(code int) {
	s.status = code
	s.ResponseWriter.WriteHeader(code)
}

func (s *statusRecorder) Write(b []byte) (int, error) {
	if s.status == 0 {
		s.status = http.StatusOK
	}
	n, err := s.ResponseWriter.Write(b)
	s.bytes += n
	return n, err
}

// Hijack delegates to the wrapped ResponseWriter so WS upgrades
// (which require http.Hijacker) keep working when the request passes
// through this middleware. Without this, an embedded ResponseWriter
// breaks the interface assertion the WS library uses to take over
// the connection. Returns http.ErrNotSupported when the underlying
// writer does not implement Hijacker.
func (s *statusRecorder) Hijack() (net.Conn, *bufio.ReadWriter, error) {
	if hj, ok := s.ResponseWriter.(http.Hijacker); ok {
		return hj.Hijack()
	}
	return nil, nil, http.ErrNotSupported
}

// Flush delegates to the wrapped ResponseWriter so streaming
// responses (e.g., chunked text/event-stream) still work through
// this middleware. No-op if the underlying writer does not support
// flushing.
func (s *statusRecorder) Flush() {
	if f, ok := s.ResponseWriter.(http.Flusher); ok {
		f.Flush()
	}
}

// Logger emits a structured access log line per request via slog.
func Logger(logger *slog.Logger) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			start := time.Now()
			rec := &statusRecorder{ResponseWriter: w}
			next.ServeHTTP(rec, r)
			logger.Info("http_request",
				"request_id", RequestIDFrom(r.Context()),
				"method", r.Method,
				"path", r.URL.Path,
				"status", rec.status,
				"bytes", rec.bytes,
				"duration_ms", time.Since(start).Milliseconds(),
				"remote", clientIP(r),
			)
		})
	}
}

// Recover converts panics into 500 responses and logs the stack so a
// single bad handler cannot bring the server down.
func Recover(logger *slog.Logger) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			defer func() {
				if rec := recover(); rec != nil {
					logger.Error("panic",
						"request_id", RequestIDFrom(r.Context()),
						"err", rec,
						"stack", string(debug.Stack()),
					)
					http.Error(w, "internal server error", http.StatusInternalServerError)
				}
			}()
			next.ServeHTTP(w, r)
		})
	}
}

// IPRateLimiter is a per-IP token-bucket pool. Inactive buckets are
// evicted on a periodic sweep so a flood of unique source addresses
// (in particular IPv6 prefix rotation) cannot grow the map without
// bound. Call StartJanitor to spin up the sweeper goroutine; tests
// can drive eviction manually via Sweep.
type IPRateLimiter struct {
	mu      sync.Mutex
	buckets map[string]*rateBucket
	rps     rate.Limit
	burst   int
	now     func() time.Time
	idleTTL time.Duration
}

type rateBucket struct {
	limiter *rate.Limiter
	lastUse time.Time
}

// DefaultRateLimiterIdleTTL is how long a bucket can sit unused before
// the next sweep evicts it. 10 minutes is plenty of headroom for a
// real client that pauses between requests, while short enough that
// an attacker rotating addresses cannot build up a permanent map.
const DefaultRateLimiterIdleTTL = 10 * time.Minute

// NewIPRateLimiter builds a token-bucket pool keyed by client IP.
func NewIPRateLimiter(rps float64, burst int) *IPRateLimiter {
	return &IPRateLimiter{
		buckets: make(map[string]*rateBucket),
		rps:     rate.Limit(rps),
		burst:   burst,
		now:     time.Now,
		idleTTL: DefaultRateLimiterIdleTTL,
	}
}

func (l *IPRateLimiter) limiterFor(ip string) *rate.Limiter {
	l.mu.Lock()
	defer l.mu.Unlock()
	b, ok := l.buckets[ip]
	if !ok {
		b = &rateBucket{limiter: rate.NewLimiter(l.rps, l.burst)}
		l.buckets[ip] = b
	}
	b.lastUse = l.now()
	return b.limiter
}

// Sweep evicts buckets whose lastUse is older than idleTTL. Safe to
// call from a janitor goroutine or directly from tests.
func (l *IPRateLimiter) Sweep() {
	l.mu.Lock()
	defer l.mu.Unlock()
	cutoff := l.now().Add(-l.idleTTL)
	for ip, b := range l.buckets {
		if b.lastUse.Before(cutoff) {
			delete(l.buckets, ip)
		}
	}
}

// StartJanitor spins up a goroutine that calls Sweep every interval
// until ctx is cancelled. Returns immediately. Calling more than once
// per IPRateLimiter is harmless but redundant.
func (l *IPRateLimiter) StartJanitor(ctx context.Context, interval time.Duration) {
	if interval <= 0 {
		interval = l.idleTTL / 2
	}
	go func() {
		t := time.NewTicker(interval)
		defer t.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-t.C:
				l.Sweep()
			}
		}
	}()
}

// Size returns the current number of tracked buckets. Test helper.
func (l *IPRateLimiter) Size() int {
	l.mu.Lock()
	defer l.mu.Unlock()
	return len(l.buckets)
}

// Middleware returns an http middleware that 429s clients exceeding
// the configured rate.
func (l *IPRateLimiter) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ip := clientIP(r)
		if !l.limiterFor(ip).Allow() {
			http.Error(w, "rate limit exceeded", http.StatusTooManyRequests)
			return
		}
		next.ServeHTTP(w, r)
	})
}

// CORS is a tiny CORS middleware that supports a static allowlist plus
// the special wildcard "*". It handles preflights and reflects only
// allowed origins so an unauthorized origin is invisible to browsers.
func CORS(allowedOrigins []string) func(http.Handler) http.Handler {
	allowAll := false
	allowed := make(map[string]struct{}, len(allowedOrigins))
	for _, o := range allowedOrigins {
		if o == "*" {
			allowAll = true
		}
		allowed[o] = struct{}{}
	}
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			origin := r.Header.Get("Origin")
			if origin != "" {
				if allowAll {
					w.Header().Set("Access-Control-Allow-Origin", "*")
				} else if _, ok := allowed[origin]; ok {
					w.Header().Set("Access-Control-Allow-Origin", origin)
					w.Header().Add("Vary", "Origin")
				}
			}
			w.Header().Set("Access-Control-Allow-Methods", "GET,POST,DELETE,PUT,OPTIONS")
			reqHdrs := r.Header.Get("Access-Control-Request-Headers")
			if reqHdrs == "" {
				reqHdrs = "Authorization,Content-Type,X-Request-ID"
			}
			w.Header().Set("Access-Control-Allow-Headers", reqHdrs)
			w.Header().Set("Access-Control-Max-Age", "600")
			if r.Method == http.MethodOptions {
				w.WriteHeader(http.StatusNoContent)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

// SecurityHeaders adds HTTP security headers to every response.
func SecurityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("X-Frame-Options", "DENY")
		w.Header().Set("Content-Security-Policy", "default-src 'self'; connect-src 'self' ws: wss:; img-src 'self' data:; style-src 'self' 'unsafe-inline'")
		w.Header().Set("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
		next.ServeHTTP(w, r)
	})
}

// clientIP returns the best-effort IP address for the request, honoring
// X-Forwarded-For when present (load-balancer friendly).
func clientIP(r *http.Request) string {
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		if i := strings.IndexByte(xff, ','); i >= 0 {
			return strings.TrimSpace(xff[:i])
		}
		return strings.TrimSpace(xff)
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}
