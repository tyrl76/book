package auth

import (
	"context"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"errors"
	"math/big"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

const testUserID = "11111111-1111-4111-8111-111111111111"

func TestVerifierAcceptsValidSupabaseToken(t *testing.T) {
	privateKey, server := testJWKSServer(t)
	defer server.Close()

	issuer := server.URL + "/auth/v1"
	verifier, err := NewVerifier(context.Background(), issuer, server.URL+"/jwks")
	if err != nil {
		t.Fatalf("NewVerifier: %v", err)
	}
	raw := signToken(t, privateKey, issuer, "authenticated", time.Now().Add(time.Hour))

	userID, err := verifier.Verify(context.Background(), raw)
	if err != nil {
		t.Fatalf("Verify: %v", err)
	}
	if userID != testUserID {
		t.Fatalf("userID = %q, want %q", userID, testUserID)
	}
}

func TestVerifierRejectsWrongAudienceAndExpiredToken(t *testing.T) {
	privateKey, server := testJWKSServer(t)
	defer server.Close()
	issuer := server.URL + "/auth/v1"
	verifier, err := NewVerifier(context.Background(), issuer, server.URL+"/jwks")
	if err != nil {
		t.Fatalf("NewVerifier: %v", err)
	}

	wrongAudience := signToken(t, privateKey, issuer, "anon", time.Now().Add(time.Hour))
	if _, err := verifier.Verify(context.Background(), wrongAudience); !errors.Is(err, ErrInvalidToken) {
		t.Fatalf("wrong audience error = %v", err)
	}
	expired := signToken(t, privateKey, issuer, "authenticated", time.Now().Add(-time.Hour))
	if _, err := verifier.Verify(context.Background(), expired); !errors.Is(err, ErrInvalidToken) {
		t.Fatalf("expired error = %v", err)
	}
}

func testJWKSServer(t *testing.T) (*ecdsa.PrivateKey, *httptest.Server) {
	t.Helper()
	privateKey, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		t.Fatalf("generate key: %v", err)
	}
	server := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		if request.URL.Path != "/jwks" {
			http.NotFound(response, request)
			return
		}
		response.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(response).Encode(map[string]any{"keys": []map[string]any{{
			"kty": "EC",
			"kid": "test-key",
			"use": "sig",
			"alg": "ES256",
			"crv": "P-256",
			"x":   encodeCoordinate(privateKey.PublicKey.X),
			"y":   encodeCoordinate(privateKey.PublicKey.Y),
		}}})
	}))
	return privateKey, server
}

func signToken(t *testing.T, key *ecdsa.PrivateKey, issuer, audience string, expiresAt time.Time) string {
	t.Helper()
	claims := supabaseClaims{
		Role: "authenticated",
		RegisteredClaims: jwt.RegisteredClaims{
			Issuer:    issuer,
			Subject:   testUserID,
			Audience:  jwt.ClaimStrings{audience},
			ExpiresAt: jwt.NewNumericDate(expiresAt),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodES256, claims)
	token.Header["kid"] = "test-key"
	raw, err := token.SignedString(key)
	if err != nil {
		t.Fatalf("sign token: %v", err)
	}
	return raw
}

func encodeCoordinate(value *big.Int) string {
	bytes := value.FillBytes(make([]byte, 32))
	return base64.RawURLEncoding.EncodeToString(bytes)
}
