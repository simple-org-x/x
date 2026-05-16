package middleware

import (
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/prometheus/client_golang/prometheus"
)

// Metrics holds the Prometheus collectors used by the HTTP layer.
// One instance lives in httpapi.Deps so cmd/api and the test harness
// share the same Registry without leaking globals across tests.
type Metrics struct {
	Registry *prometheus.Registry

	requestsTotal *prometheus.CounterVec
}

// NewMetrics creates a Metrics bundle backed by the provided registry
// (passing nil makes a fresh one). All collectors are registered up
// front so /metrics returns them even before the first request.
func NewMetrics(reg *prometheus.Registry) *Metrics {
	if reg == nil {
		reg = prometheus.NewRegistry()
	}
	// Default Go runtime + process collectors so callers see e.g.
	// go_goroutines, process_cpu_seconds_total without any extra wiring.
	reg.MustRegister(
		prometheus.NewGoCollector(),
		prometheus.NewProcessCollector(prometheus.ProcessCollectorOpts{}),
	)
	requests := prometheus.NewCounterVec(prometheus.CounterOpts{
		Name: "cas_http_requests_total",
		Help: "Total HTTP requests handled by the API, labelled by route template and status code.",
	}, []string{"path", "status"})
	reg.MustRegister(requests)
	return &Metrics{
		Registry:      reg,
		requestsTotal: requests,
	}
}

// Middleware returns an http middleware that increments
// cas_http_requests_total for every request it sees. The path label
// is the chi route template (e.g. /api/match/{id}) when available,
// falling back to the raw URL path so unmatched routes still register.
func (m *Metrics) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		rec := &statusRecorder{ResponseWriter: w}
		next.ServeHTTP(rec, r)
		status := rec.status
		if status == 0 {
			status = http.StatusOK
		}
		path := chiRoutePattern(r)
		if path == "" {
			path = r.URL.Path
		}
		m.requestsTotal.WithLabelValues(path, strconv.Itoa(status)).Inc()
	})
}

// chiRoutePattern returns the matched chi route pattern for r, or ""
// if chi has not finished routing yet (e.g. 404s before any handler).
func chiRoutePattern(r *http.Request) string {
	if rctx := chi.RouteContext(r.Context()); rctx != nil {
		return rctx.RoutePattern()
	}
	return ""
}
