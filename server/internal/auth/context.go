package auth

import "context"

type ctxKey string

const claimsCtxKey ctxKey = "auth-claims"

// WithClaims returns a child context carrying claims.
func WithClaims(ctx context.Context, c *Claims) context.Context {
	return context.WithValue(ctx, claimsCtxKey, c)
}

// ClaimsFrom retrieves the auth claims previously stored by Middleware.
// It returns nil if no claims are present.
func ClaimsFrom(ctx context.Context) *Claims {
	v, _ := ctx.Value(claimsCtxKey).(*Claims)
	return v
}
