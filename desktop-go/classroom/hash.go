package classroom

import (
	"crypto/hmac"
	"crypto/pbkdf2"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"errors"
	"fmt"
	"math/big"
	"strconv"
	"strings"
)

// Hashes of PINs and passwords: "pbkdf2-sha256$<iterations>$<salt>$<hash>", salt and hash in base64
// without padding (16-byte salt, 32-byte hash). The same format, byte for byte, is made and checked
// by web-typescript/src/engine/account/pin.ts (WebCrypto), and both test files share a vector.
//
// With a pepper (the server's secret.key, kept apart from db.json) the PBKDF2 password is
// HMAC-SHA256(pepper, secret) instead of the secret itself, so a copied db.json alone is not enough
// to try the 10 000 possible PINs offline.
const (
	hashScheme = "pbkdf2-sha256"
	// PinIterations: a PIN is checked at every student login (30 students at once), so fewer rounds.
	PinIterations = 100_000
	// PasswordIterations: teacher and operator passwords (OWASP 2023 figure for PBKDF2-SHA256).
	PasswordIterations = 600_000
	saltBytes          = 16
	keyBytes           = 32
	minIterations      = 1_000
	maxIterations      = 5_000_000
)

var b64 = base64.RawStdEncoding

// HashSecret hashes a PIN or password with a fresh random salt.
func HashSecret(secret string, pepper []byte, iterations int) (string, error) {
	salt := make([]byte, saltBytes)
	if _, err := rand.Read(salt); err != nil {
		return "", err
	}
	return hashWithSalt(secret, pepper, salt, iterations)
}

func hashWithSalt(secret string, pepper []byte, salt []byte, iterations int) (string, error) {
	if iterations < minIterations || iterations > maxIterations {
		return "", fmt.Errorf("iterations out of range: %d", iterations)
	}
	key, err := pbkdf2.Key(sha256.New, pbkdfPassword(secret, pepper), salt, iterations, keyBytes)
	if err != nil {
		return "", err
	}
	return hashScheme + "$" + strconv.Itoa(iterations) + "$" + b64.EncodeToString(salt) + "$" + b64.EncodeToString(key), nil
}

func pbkdfPassword(secret string, pepper []byte) string {
	if len(pepper) == 0 {
		return secret
	}
	m := hmac.New(sha256.New, pepper)
	m.Write([]byte(secret))
	return string(m.Sum(nil))
}

// VerifySecret: does secret match the stored hash? Constant time in the comparison; a malformed
// stored value is simply false.
func VerifySecret(stored, secret string, pepper []byte) bool {
	parts := strings.Split(stored, "$")
	if len(parts) != 4 || parts[0] != hashScheme {
		return false
	}
	iter, err := strconv.Atoi(parts[1])
	if err != nil || iter < minIterations || iter > maxIterations {
		return false
	}
	salt, err1 := b64.DecodeString(parts[2])
	want, err2 := b64.DecodeString(parts[3])
	if err1 != nil || err2 != nil || len(salt) == 0 || len(want) != keyBytes {
		return false
	}
	got, err := pbkdf2.Key(sha256.New, pbkdfPassword(secret, pepper), salt, iter, keyBytes)
	if err != nil {
		return false
	}
	return subtle.ConstantTimeCompare(got, want) == 1
}

// dummyHash is checked against when the account does not exist, so an unknown 번호 or username takes
// as long to refuse as a wrong PIN (no timing hint about which accounts exist).
var dummyHash = func() string {
	h, _ := hashWithSalt("dummy", nil, make([]byte, saltBytes), PinIterations)
	return h
}()

// NewPIN: 4 random digits (crypto/rand), never 0000-like runs of one digit or 1234-like steps.
func NewPIN() (string, error) {
	for {
		n, err := rand.Int(rand.Reader, big.NewInt(10000))
		if err != nil {
			return "", err
		}
		p := fmt.Sprintf("%04d", n.Int64())
		if !weakPIN(p) {
			return p, nil
		}
	}
}

func weakPIN(p string) bool {
	same, up, down := true, true, true
	for i := 1; i < len(p); i++ {
		d := int(p[i]) - int(p[i-1])
		same = same && d == 0
		up = up && d == 1
		down = down && d == -1
	}
	return same || up || down
}

// ValidPIN: exactly 4 ASCII digits.
func ValidPIN(p string) bool {
	if len(p) != 4 {
		return false
	}
	for i := 0; i < 4; i++ {
		if p[i] < '0' || p[i] > '9' {
			return false
		}
	}
	return true
}

// randomToken: n random bytes as base64url (session tokens, ids).
func randomToken(n int) string {
	b := make([]byte, n)
	if _, err := rand.Read(b); err != nil {
		panic(err) // crypto/rand does not fail on supported platforms
	}
	return base64.RawURLEncoding.EncodeToString(b)
}

// tokenHash: what is kept of a session token (the token itself is only with the browser).
func tokenHash(token string) string {
	s := sha256.Sum256([]byte(token))
	return base64.RawURLEncoding.EncodeToString(s[:])
}

// codeAlphabet: class codes without look-alikes (0/O, 1/I/L, 2/Z, 5/S, 8/B).
const codeAlphabet = "34679ACDEFGHJKMNPQRTUVWXY"

func newClassCode() string {
	b := make([]byte, 6)
	for i := range b {
		n, err := rand.Int(rand.Reader, big.NewInt(int64(len(codeAlphabet))))
		if err != nil {
			panic(err)
		}
		b[i] = codeAlphabet[n.Int64()]
	}
	return string(b)
}

// pseudonym: HMAC-SHA256(key, label + value), hex, n characters. Used for what goes to the cloud.
func pseudonym(key []byte, label, value string, n int) string {
	m := hmac.New(sha256.New, key)
	m.Write([]byte(label))
	m.Write([]byte{0})
	m.Write([]byte(value))
	return fmt.Sprintf("%x", m.Sum(nil))[:n]
}

// deriveKey: a sub-key of the server secret for one purpose.
func deriveKey(secret []byte, purpose string) []byte {
	m := hmac.New(sha256.New, secret)
	m.Write([]byte(purpose))
	return m.Sum(nil)
}

var errBadInput = errors.New("bad input")
