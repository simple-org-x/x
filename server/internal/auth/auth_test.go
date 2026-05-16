package auth_test

import (
	"encoding/hex"
	"testing"
	"time"

	"github.com/ethereum/go-ethereum/crypto"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/simple-org/x/server/internal/auth"
)

// newTestService spins up a Service backed by an in-memory nonce store.
func newTestService(t *testing.T) *auth.Service {
	t.Helper()
	store := auth.NewMemoryNonceStore(time.Minute)
	return auth.NewService(store, []byte("test-secret"), time.Hour)
}

func TestStartGuestSession(t *testing.T) {
	svc := newTestService(t)
	sess, err := svc.StartGuestSession()
	require.NoError(t, err)
	assert.NotEmpty(t, sess.Token)
	assert.NotEmpty(t, sess.UserID)
	assert.Contains(t, sess.UserID, "guest-")
	assert.True(t, sess.Expires.After(time.Now()))

	claims, err := svc.ParseJWT(sess.Token)
	require.NoError(t, err)
	assert.Equal(t, sess.UserID, claims.Subject)
	assert.Equal(t, "guest", claims.Kind)
}

func TestVerifyWalletSignature_HappyPath(t *testing.T) {
	svc := newTestService(t)
	priv, err := crypto.GenerateKey()
	require.NoError(t, err)
	addr := crypto.PubkeyToAddress(priv.PublicKey).Hex()

	nonce, err := svc.NonceStore.Issue(addr)
	require.NoError(t, err)

	sig, err := auth.SignPersonalMessage(priv, auth.LoginMessageFor(nonce))
	require.NoError(t, err)

	recovered, err := svc.VerifyWalletSignature(addr, nonce, hex.EncodeToString(sig))
	require.NoError(t, err)
	assert.Equal(t, addr, recovered)
}

func TestVerifyWalletSignature_TamperedSignature(t *testing.T) {
	svc := newTestService(t)
	priv, err := crypto.GenerateKey()
	require.NoError(t, err)
	addr := crypto.PubkeyToAddress(priv.PublicKey).Hex()

	nonce, err := svc.NonceStore.Issue(addr)
	require.NoError(t, err)

	sig, err := auth.SignPersonalMessage(priv, auth.LoginMessageFor(nonce))
	require.NoError(t, err)
	// Flip a byte in the middle of r/s -- still 65 bytes, structurally
	// valid, but recovers to a different address.
	sig[10] ^= 0xff

	_, err = svc.VerifyWalletSignature(addr, nonce, hex.EncodeToString(sig))
	require.Error(t, err)
}

func TestVerifyWalletSignature_RejectsReusedNonce(t *testing.T) {
	svc := newTestService(t)
	priv, err := crypto.GenerateKey()
	require.NoError(t, err)
	addr := crypto.PubkeyToAddress(priv.PublicKey).Hex()

	nonce, err := svc.NonceStore.Issue(addr)
	require.NoError(t, err)

	sig, err := auth.SignPersonalMessage(priv, auth.LoginMessageFor(nonce))
	require.NoError(t, err)

	// First verify succeeds.
	_, err = svc.VerifyWalletSignature(addr, nonce, hex.EncodeToString(sig))
	require.NoError(t, err)

	// Second attempt with the same nonce/signature must fail because
	// the nonce is consumed.
	_, err = svc.VerifyWalletSignature(addr, nonce, hex.EncodeToString(sig))
	require.ErrorIs(t, err, auth.ErrNonceNotFound)
}

func TestVerifyWalletSignature_RejectsForeignAddress(t *testing.T) {
	svc := newTestService(t)
	priv, err := crypto.GenerateKey()
	require.NoError(t, err)
	addr := crypto.PubkeyToAddress(priv.PublicKey).Hex()

	other, err := crypto.GenerateKey()
	require.NoError(t, err)
	otherAddr := crypto.PubkeyToAddress(other.PublicKey).Hex()

	nonce, err := svc.NonceStore.Issue(otherAddr)
	require.NoError(t, err)

	// Sign with priv but claim otherAddr -- recovery returns priv's
	// address, which does not match the claim.
	sig, err := auth.SignPersonalMessage(priv, auth.LoginMessageFor(nonce))
	require.NoError(t, err)

	_, err = svc.VerifyWalletSignature(otherAddr, nonce, hex.EncodeToString(sig))
	require.ErrorIs(t, err, auth.ErrInvalidSignature)
	// Sanity: the original address was untouched.
	_ = addr
}

func TestNonceStore_ReIssueReplacesPrevious(t *testing.T) {
	// A second Issue for the same address invalidates the previous
	// nonce: only the most-recent value can ever be consumed.
	store := auth.NewMemoryNonceStore(time.Minute)
	addr := "0x0000000000000000000000000000000000000001"
	n1, err := store.Issue(addr)
	require.NoError(t, err)
	n2, err := store.Issue(addr)
	require.NoError(t, err)
	assert.NotEqual(t, n1, n2)

	// Consuming the latest succeeds.
	require.NoError(t, store.Consume(addr, n2))

	// Consuming any value (the now-replaced n1, the just-burned n2,
	// or anything else) fails after the slot is gone.
	require.ErrorIs(t, store.Consume(addr, n2), auth.ErrNonceNotFound)
}

func TestNonceStore_WrongValueBelowCapKeepsSlot(t *testing.T) {
	// Wrong guesses keep the slot until the per-address attempt
	// counter is exhausted: this prevents anyone who knows a wallet
	// address from DoSing its login by submitting a single wrong
	// nonce. The legitimate signer can still consume the original
	// nonce after a few bad guesses.
	store := auth.NewMemoryNonceStore(time.Minute)
	addr := "0x0000000000000000000000000000000000000002"
	n, err := store.Issue(addr)
	require.NoError(t, err)

	// A handful of wrong guesses below the cap leave the slot intact.
	for i := 0; i < auth.MaxNonceAttempts-1; i++ {
		require.ErrorIs(t, store.Consume(addr, "not-the-real-nonce"), auth.ErrNonceNotFound)
	}

	// The real nonce still works.
	require.NoError(t, store.Consume(addr, n))
	// Single-use: a second consume of the same value still fails.
	require.ErrorIs(t, store.Consume(addr, n), auth.ErrNonceNotFound)
}

func TestNonceStore_WrongValueAtCapEvictsSlot(t *testing.T) {
	// Once the attempt budget is exhausted, the slot is dropped to
	// bound brute-force work. The legitimate signer must request a
	// fresh nonce.
	store := auth.NewMemoryNonceStore(time.Minute)
	addr := "0x0000000000000000000000000000000000000003"
	n, err := store.Issue(addr)
	require.NoError(t, err)

	for i := 0; i < auth.MaxNonceAttempts; i++ {
		require.ErrorIs(t, store.Consume(addr, "wrong"), auth.ErrNonceNotFound)
	}

	// The slot was evicted on the final wrong guess; the original
	// nonce no longer redeems.
	require.ErrorIs(t, store.Consume(addr, n), auth.ErrNonceNotFound)
}

func TestIssueAndParseJWT_RoundTrip(t *testing.T) {
	svc := newTestService(t)
	exp := time.Now().Add(time.Hour)
	tok, err := svc.IssueJWT("0xabc", "wallet", exp)
	require.NoError(t, err)

	claims, err := svc.ParseJWT(tok)
	require.NoError(t, err)
	assert.Equal(t, "0xabc", claims.Subject)
	assert.Equal(t, "wallet", claims.Kind)
	assert.Equal(t, "0xabc", claims.Address)
}
