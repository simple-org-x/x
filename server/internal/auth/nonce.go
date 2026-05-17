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
	mu          sync.Mutex
	entries     map[string]nonceEntry
	ttl         time.Duration
	now         func() time.Time
	maxAttempts int
}

type nonceEntry struct {
	value     string
	expiresAt time.Time
	attempts  int
}

// MaxNonceAttempts caps how many wrong guesses a slot accepts before
// it is evicted. Without this cap, anyone who knew a wallet's address
// could DoS its login by submitting a wrong nonce, wiping the
// outstanding slot, and forcing a fresh /nonce round-trip every time.
const MaxNonceAttempts = 5

// NewMemoryNonceStore returns a fresh in-memory store. ttl bounds the
// lifetime of any issued nonce; values <=0 fall back to 5 minutes.
func NewMemoryNonceStore(ttl time.Duration) *MemoryNonceStore {
	if ttl <= 0 {
		ttl = 5 * time.Minute
	}
	return &MemoryNonceStore{
		entries:     make(map[string]nonceEntry),
		ttl:         ttl,
		now:         time.Now,
		maxAttempts: MaxNonceAttempts,
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
// matches and is not yet expired. Wrong guesses keep the slot in
// place but increment an attempt counter; once the counter exceeds
// MaxNonceAttempts the slot is evicted to bound brute-force work.
//
// All failure paths collapse to ErrNonceNotFound to keep the response
// shape uniform and avoid leaking which constraint failed.
func (s *MemoryNonceStore) Consume(address, nonce string) error {
	key := strings.ToLower(address)

	s.mu.Lock()
	defer s.mu.Unlock()

	entry, ok := s.entries[key]
	if !ok {
		return ErrNonceNotFound
	}
	// Expired entries are wiped regardless of supplied value.
	if !s.now().Before(entry.expiresAt) {
		delete(s.entries, key)
		return ErrNonceNotFound
	}
	if entry.value != nonce {
		// Wrong guess: keep the slot but charge an attempt. Once the
		// budget runs out, drop the slot so a flood of guesses cannot
		// pin it open indefinitely.
		entry.attempts++
		if entry.attempts >= s.maxAttempts {
			delete(s.entries, key)
		} else {
			s.entries[key] = entry
		}
		return ErrNonceNotFound
	}
	// Correct value: success burns the slot exactly once.
	delete(s.entries, key)
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
