package auth

import (
	"context"
	"errors"
	"fmt"
	"regexp"
	"time"

	"github.com/MicahParks/keyfunc/v3"
	"github.com/golang-jwt/jwt/v5"
)

var ErrInvalidToken = errors.New("invalid access token")

var uuidPattern = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$`)

type supabaseClaims struct {
	Role string `json:"role"`
	jwt.RegisteredClaims
}

type Verifier struct {
	issuer string
	keys   keyfunc.Keyfunc
}

func NewVerifier(ctx context.Context, issuer, jwksURL string) (*Verifier, error) {
	if issuer == "" || jwksURL == "" {
		return nil, errors.New("Supabase issuer and JWKS URL are required")
	}
	keys, err := keyfunc.NewDefaultCtx(ctx, []string{jwksURL})
	if err != nil {
		return nil, fmt.Errorf("load Supabase JWKS: %w", err)
	}
	return &Verifier{issuer: issuer, keys: keys}, nil
}

func (v *Verifier) Verify(ctx context.Context, rawToken string) (string, error) {
	claims := &supabaseClaims{}
	token, err := jwt.ParseWithClaims(
		rawToken,
		claims,
		v.keys.KeyfuncCtx(ctx),
		jwt.WithValidMethods([]string{"ES256", "RS256", "EdDSA"}),
		jwt.WithIssuer(v.issuer),
		jwt.WithAudience("authenticated"),
		jwt.WithExpirationRequired(),
		jwt.WithLeeway(30*time.Second),
	)
	if err != nil || !token.Valid {
		return "", fmt.Errorf("%w: signature or claims validation failed", ErrInvalidToken)
	}
	if claims.Role != "authenticated" || !uuidPattern.MatchString(claims.Subject) {
		return "", fmt.Errorf("%w: invalid role or subject", ErrInvalidToken)
	}
	return claims.Subject, nil
}
