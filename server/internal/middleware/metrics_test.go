package middleware_test

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promhttp"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/simple-org/x/server/internal/middleware"
)

// TestMetrics_UnmatchedFallback locks in the cardinality fix for the
// /metrics path label. Before the fix, requests that chi could not
// route fell back to r.URL.Path, so a bot scanning unique URLs could
// blow up the label set. After the fix, all such requests collapse
// onto the constant "unmatched".
func TestMetrics_UnmatchedFallback(t *testing.T) {
	reg := prometheus.NewRegistry()
	m := middleware.NewMetrics(reg)

	r := chi.NewRouter()
	r.Use(m.Middleware)
	r.Get("/api/known", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	})
	// chi NotFoundHandler ensures the request flows through middleware
	// even when no route matches, so the metric still ticks.
	r.NotFound(func(w http.ResponseWriter, _ *http.Request) {
		http.NotFound(w, nil)
	})

	srv := httptest.NewServer(r)
	defer srv.Close()

	// Hit a handful of distinct unmatched paths.
	for _, p := range []string{"/wp-admin", "/.git/config", "/api/v1/users/1", "/api/v1/users/2"} {
		resp, err := http.Get(srv.URL + p)
		require.NoError(t, err)
		resp.Body.Close()
	}
	// Hit the matched route so we can confirm the matched label
	// continues to be its template.
	resp, err := http.Get(srv.URL + "/api/known")
	require.NoError(t, err)
	resp.Body.Close()

	scrape := httptest.NewRecorder()
	promhttp.HandlerFor(reg, promhttp.HandlerOpts{}).ServeHTTP(
		scrape,
		httptest.NewRequest(http.MethodGet, "/metrics", nil),
	)
	body, err := io.ReadAll(scrape.Body)
	require.NoError(t, err)
	text := string(body)

	// Exactly one line should reference path="unmatched"; the four
	// distinct probe paths must not appear individually.
	assert.Contains(t, text, `path="unmatched"`,
		"unmatched routes must collapse onto the 'unmatched' label")
	for _, banned := range []string{
		`path="/wp-admin"`,
		`path="/.git/config"`,
		`path="/api/v1/users/1"`,
		`path="/api/v1/users/2"`,
	} {
		assert.NotContains(t, text, banned,
			"raw URL path %q must not appear as a metric label", banned)
	}
	// The matched route still uses its chi template, not "unmatched".
	assert.Contains(t, text, `path="/api/known"`,
		"matched routes should still use the chi route template")
	// And only one cas_http_requests_total series exists for "unmatched"
	// across the four distinct probe paths.
	unmatchedLines := 0
	for _, line := range strings.Split(text, "\n") {
		if strings.HasPrefix(line, "cas_http_requests_total{") &&
			strings.Contains(line, `path="unmatched"`) {
			unmatchedLines++
		}
	}
	assert.Equal(t, 1, unmatchedLines,
		"all unmatched probes should collapse to a single time series")
}
