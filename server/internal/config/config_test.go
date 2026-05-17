package config_test

import (
	"errors"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/simple-org/x/server/internal/config"
)

// withEnv saves and restores the listed env vars around the body, so
// these tests do not leak state between runs (and don't trip on the
// caller's actual JWT_SECRET / APP_ENV).
func withEnv(t *testing.T, set map[string]string, body func()) {
	t.Helper()
	saved := make(map[string]*string, len(set))
	for k := range set {
		if v, ok := lookup(k); ok {
			vv := v
			saved[k] = &vv
		} else {
			saved[k] = nil
		}
	}
	t.Cleanup(func() {
		for k, v := range saved {
			if v == nil {
				_ = unset(k)
			} else {
				_ = setenv(k, *v)
			}
		}
	})
	for k, v := range set {
		if v == "" {
			require.NoError(t, unset(k))
		} else {
			require.NoError(t, setenv(k, v))
		}
	}
	body()
}

func TestLoad_DevFallbackUsesDevSecret(t *testing.T) {
	withEnv(t,
		map[string]string{"APP_ENV": "dev", "JWT_SECRET": ""},
		func() {
			cfg, err := config.Load()
			require.NoError(t, err)
			assert.Equal(t, "dev", cfg.AppEnv)
			// Dev mode generates a random secret when JWT_SECRET is not set
			assert.NotEmpty(t, cfg.JWTSecret)
			assert.Greater(t, len(cfg.JWTSecret), 0)
		},
	)
}

func TestLoad_DevFallbackWhenAppEnvUnset(t *testing.T) {
	withEnv(t,
		map[string]string{"APP_ENV": "", "JWT_SECRET": ""},
		func() {
			cfg, err := config.Load()
			require.NoError(t, err)
			assert.Equal(t, "dev", cfg.AppEnv)
			assert.NotEmpty(t, cfg.JWTSecret)
		},
	)
}

func TestLoad_NonDev_RequiresJWTSecret(t *testing.T) {
	withEnv(t,
		map[string]string{"APP_ENV": "production", "JWT_SECRET": ""},
		func() {
			_, err := config.Load()
			require.Error(t, err)
			assert.True(t, errors.Is(err, config.ErrJWTSecretRequired),
				"expected ErrJWTSecretRequired, got %v", err)
		},
	)
}

func TestLoad_NonDev_AcceptsExplicitSecret(t *testing.T) {
	withEnv(t,
		map[string]string{"APP_ENV": "production", "JWT_SECRET": "from-secret-manager"},
		func() {
			cfg, err := config.Load()
			require.NoError(t, err)
			assert.Equal(t, "production", cfg.AppEnv)
			assert.Equal(t, "from-secret-manager", string(cfg.JWTSecret))
		},
	)
}

func TestLoad_NonDev_RejectsWhitespaceOnlySecret(t *testing.T) {
	withEnv(t,
		map[string]string{"APP_ENV": "staging", "JWT_SECRET": "   "},
		func() {
			_, err := config.Load()
			require.Error(t, err)
			assert.True(t, errors.Is(err, config.ErrJWTSecretRequired))
		},
	)
}
