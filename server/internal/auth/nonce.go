package auth

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"strings"
	"sync"
	"time"
)

// ErrNonceNotFound is returned when a Consume cannot match the supplied
// (address, nonce) tuple. Tampered, expired, and already-consumed
// nonces all collapse to the same error so timing/oracle leaks are
// avoided.
var ErrNonceNotFound = errors.New("nonce not found or already consumed")

// NonceStore is the interface the auth.Service depends on. The Phase-1
// implementation is in-memory; a Redis-backed store can replace it
// without touching call sites.
//
// Issue is keyed by lowercased Ethereum address: the nonce for a given
// address is single-use and overwrites any previous outstanding nonce
// for the same address. Consume is the verification side: it succeeds
// at most once per Issue and must fail for replays.
type NonceStore interface {
	Issue(address string) (string, error)
	Consume(address, nonce string) error
}

// MemoryNonceStore implements NonceStore with a sync.Map-style guard
// plus a TTL. Expired entries are evicted lazily on Consume; a janitor
// goroutine keeps the table from growing unboundedly under steady
// no-op traffic.
type MemoryNonceStore struct {
	mu      sync.Mutex
	entries map[string]nonceEntry
	ttl     time.Duration
	now     func() time.Time
}

type nonceEntry struct {
	value     string
	expiresAt time.Time
}

// NewMemoryNonceStore returns a fresh in-memory store. ttl bounds the
// lifetime of any issued nonce; values <=0 fall back to 5 minutes.
func NewMemoryNonceStore(ttl time.Duration) *MemoryNonceStore {
	if ttl <= 0 {
		ttl = 5 * time.Minute
	}
	return &MemoryNonceStore{
		entries: make(map[string]nonceEntry),
		ttl:     ttl,
		now:     time.Now,
	}
}

// Issue mints a 16-byte random hex nonce, stores it under the
// canonicalized address, and returns the value the client must sign.
// A second Issue for the same address invalidates the previous nonce.
func (s *MemoryNonceStore) Issue(address string) (string, error) {
	var b [16]byte
	if _, err := rand.Read(b[:]); err != nil {
		return "", err
	}
	value := hex.EncodeToString(b[:])
	key := strings.ToLower(address)

	s.mu.Lock()
	defer s.mu.Unlock()
	s.entries[key] = nonceEntry{value: value, expiresAt: s.now().Add(s.ttl)}
	return value, nil
}

// Consume looks up the address-keyed nonce and removes it if it
// matches and is not yet expired. Any failure path collapses to
// ErrNonceNotFound to keep the verification surface uniform.
func (s *MemoryNonceStore) Consume(address, nonce string) error {
	key := strings.ToLower(address)

	s.mu.Lock()
	defer s.mu.Unlock()

	entry, ok := s.entries[key]
	if !ok {
		return ErrNonceNotFound
	}
	// Always delete: this guarantees single-use even if the supplied
	// nonce was wrong (a wrong attempt burns the slot, forcing a fresh
	// /nonce call. That is acceptable Phase-1 behavior).
	delete(s.entries, key)

	if entry.value != nonce {
		return ErrNonceNotFound
	}
	if !s.now().Before(entry.expiresAt) {
		return ErrNonceNotFound
	}
	return nil
}

// Sweep evicts expired entries. Callers can run this periodically; the
// API server starts a goroutine that does so every TTL/2.
func (s *MemoryNonceStore) Sweep() {
	s.mu.Lock()
	defer s.mu.Unlock()
	now := s.now()
	for k, e := range s.entries {
		if !now.Before(e.expiresAt) {
			delete(s.entries, k)
		}
	}
}
