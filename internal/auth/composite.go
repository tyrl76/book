package auth

import (
	"context"
	"errors"
)

type SubjectVerifier interface {
	Verify(context.Context, string) (string, error)
}

type CompositeVerifier struct {
	verifiers []SubjectVerifier
}

func NewCompositeVerifier(verifiers ...SubjectVerifier) *CompositeVerifier {
	active := make([]SubjectVerifier, 0, len(verifiers))
	for _, verifier := range verifiers {
		if verifier != nil {
			active = append(active, verifier)
		}
	}
	return &CompositeVerifier{verifiers: active}
}

func (c *CompositeVerifier) Verify(ctx context.Context, token string) (string, error) {
	var lastErr error
	for _, verifier := range c.verifiers {
		userID, err := verifier.Verify(ctx, token)
		if err == nil {
			return userID, nil
		}
		lastErr = err
	}
	if lastErr == nil {
		lastErr = errors.New("no token verifier configured")
	}
	return "", lastErr
}
