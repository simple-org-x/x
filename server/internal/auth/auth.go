// Package auth implements guest sessions and EIP-191 wallet-signature
// login. It is intentionally narrow: the Service exposes three
// operations -- StartGuestSession, VerifyWalletSignature, IssueJWT --
// and an HTTP handler bundle that wires them onto chi routes.
//
// The wallet flow is the standard nonce / sign / verify dance:
//  1. Client calls POST /api/auth/wallet/nonce with their address.
//  2. Server issues a random per-address nonce stored in NonceStore.
//  3. Client signs the canonical login message via personal_sign.
//  4. Client calls POST /api/auth/wallet/verify with address+sig.
//  5. Server consumes the nonce, recovers the public key from the
//     signature, asserts the recovered address matches the claimed
//     address, and returns a JWT.
package auth

import (
	"crypto/ecdsa"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/crypto"
	"github.com/golang-jwt/jwt/v5"
)

// LoginMessageFor returns the exact string the client must wrap with
// EIP-191 personal_sign. Including the nonce binds the signature to a
// single login attempt; including the project name prevents replay
// across other apps that might happen to share a wallet.
//
// The format is documented in /server/README.md; do not change it
// without coordinating with the client.
func LoginMessageFor(nonce string) string {
	return fmt.Sprintf("Crypto Arena Survivors login: %s", nonce)
}

// Service bundles the auth-related dependencies behind a small typed
// surface. It is safe for concurrent use.
type Service struct {
	NonceStore NonceStore
	JWTSecret  []byte
	JWTTTL     time.Duration
	Issuer     string
	Now        func() time.Time
}

// NewService constructs a Service with sensible defaults. jwtSecret
// must be non-empty; jwtTTL <=0 falls back to 24 hours.
func NewService(store NonceStore, jwtSecret []byte, jwtTTL time.Duration) *Service {
	if jwtTTL <= 0 {
		jwtTTL = 24 * time.Hour
	}
	return &Service{
		NonceStore: store,
		JWTSecret:  jwtSecret,
		JWTTTL:     jwtTTL,
		Issuer:     "crypto-arena-survivors",
		Now:        time.Now,
	}
}

// GuestSession is the public-facing payload returned by the guest
// endpoint. The token is a JWT bound to a freshly generated user ID.
type GuestSession struct {
	UserID  string    `json:"userId"`
	Token   string    `json:"token"`
	Expires time.Time `json:"expires"`
}

// StartGuestSession allocates a synthetic userID, signs a JWT for it,
// and returns the bundled session payload.
func (s *Service) StartGuestSession() (GuestSession, error) {
	id, err := newGuestID()
	if err != nil {
		return GuestSession{}, err
	}
	expires := s.now().Add(s.JWTTTL)
	tok, err := s.IssueJWT(id, "guest", expires)
	if err != nil {
		return GuestSession{}, err
	}
	return GuestSession{UserID: id, Token: tok, Expires: expires}, nil
}

// Claims is the typed view of our JWT payload. Subject is the userID
// (either "guest-..." or the EIP-55 wallet address), Kind discriminates
// guest vs wallet so downstream handlers can gate on it.
type Claims struct {
	Kind    string `json:"kind"`
	Address string `json:"addr,omitempty"`
	jwt.RegisteredClaims
}

// IssueJWT signs a JWT for subject. kind should be "guest" or "wallet".
// Callers control the expiry so the same routine is reusable for
// non-default TTLs (e.g. short-lived match tokens later).
func (s *Service) IssueJWT(subject, kind string, expires time.Time) (string, error) {
	if len(s.JWTSecret) == 0 {
		return "", errors.New("auth: empty JWT secret")
	}
	now := s.now()
	claims := Claims{
		Kind: kind,
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   subject,
			Issuer:    s.Issuer,
			IssuedAt:  jwt.NewNumericDate(now),
			NotBefore: jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(expires),
		},
	}
	if kind == "wallet" {
		claims.Address = subject
	}
	tok := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return tok.SignedString(s.JWTSecret)
}

// ParseJWT validates a token's signature and standard claims and
// returns the typed claims object on success.
func (s *Service) ParseJWT(token string) (*Claims, error) {
	out := &Claims{}
	_, err := jwt.ParseWithClaims(token, out, func(t *jwt.Token) (interface{}, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", t.Header["alg"])
		}
		return s.JWTSecret, nil
	}, jwt.WithIssuer(s.Issuer))
	if err != nil {
		return nil, err
	}
	return out, nil
}

// VerifyWalletSignature consumes the issued nonce and confirms that
// signature was produced by the private key behind address.
//
// signature is the 65-byte hex string produced by personal_sign
// (with or without a 0x prefix). The recovery byte may be 0/1 or
// 27/28; both encodings are accepted.
//
// On success the canonical (EIP-55) form of the recovered address is
// returned. On failure ErrInvalidSignature or ErrNonceNotFound is
// returned and no nonce state is leaked back to the caller.
func (s *Service) VerifyWalletSignature(address, nonce, signature string) (string, error) {
	if !common.IsHexAddress(address) {
		return "", ErrInvalidAddress
	}
	if err := s.NonceStore.Consume(address, nonce); err != nil {
		return "", err
	}
	recovered, err := recoverPersonalSignAddress(LoginMessageFor(nonce), signature)
	if err != nil {
		return "", err
	}
	want := common.HexToAddress(address)
	if recovered != want {
		return "", ErrInvalidSignature
	}
	return recovered.Hex(), nil
}

// ErrInvalidSignature is returned when the recovered address does not
// match the claimed address, or when the signature bytes are malformed.
var ErrInvalidSignature = errors.New("invalid wallet signature")

// ErrInvalidAddress is returned for non-hex / wrong-length addresses.
var ErrInvalidAddress = errors.New("invalid wallet address")

// recoverPersonalSignAddress applies the EIP-191 prefix, hashes the
// payload, and runs ecrecover via go-ethereum's crypto package.
func recoverPersonalSignAddress(message, signature string) (common.Address, error) {
	sig := strings.TrimPrefix(strings.ToLower(signature), "0x")
	raw, err := hex.DecodeString(sig)
	if err != nil {
		return common.Address{}, ErrInvalidSignature
	}
	if len(raw) != 65 {
		return common.Address{}, ErrInvalidSignature
	}
	// Some wallets return v in {27, 28}; go-ethereum wants {0, 1}.
	if raw[64] == 27 || raw[64] == 28 {
		raw[64] -= 27
	}
	if raw[64] != 0 && raw[64] != 1 {
		return common.Address{}, ErrInvalidSignature
	}
	hash := personalSignHash([]byte(message))
	pub, err := crypto.SigToPub(hash, raw)
	if err != nil || pub == nil {
		return common.Address{}, ErrInvalidSignature
	}
	return crypto.PubkeyToAddress(*pub), nil
}

// personalSignHash returns keccak256("\x19Ethereum Signed Message:\n" + len(msg) + msg).
// This is exactly the hash personal_sign produces and the one
// crypto.SigToPub expects for v=0/1 recoverable signatures.
func personalSignHash(message []byte) []byte {
	prefix := fmt.Sprintf("\x19Ethereum Signed Message:\n%d", len(message))
	return crypto.Keccak256([]byte(prefix), message)
}

// SignPersonalMessage is a test-helper alias exported for callers that
// want to build a valid signature without re-deriving the prefix.
// It is intentionally tiny so it can be used from auth_test.go.
func SignPersonalMessage(priv *ecdsa.PrivateKey, message string) ([]byte, error) {
	return crypto.Sign(personalSignHash([]byte(message)), priv)
}

func (s *Service) now() time.Time {
	if s.Now != nil {
		return s.Now()
	}
	return time.Now()
}

// newGuestID returns a "guest-" prefixed 12-hex-char identifier.
func newGuestID() (string, error) {
	var b [6]byte
	if _, err := rand.Read(b[:]); err != nil {
		return "", err
	}
	return "guest-" + hex.EncodeToString(b[:]), nil
}
