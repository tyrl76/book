package config

import (
	"strings"
	"testing"
)

func TestLoadRequiresSupabaseWhenDevAuthDisabled(t *testing.T) {
	t.Setenv("ALLOW_DEV_AUTH", "false")
	t.Setenv("SUPABASE_URL", "")
	t.Setenv("SUPABASE_JWT_ISSUER", "")
	t.Setenv("SUPABASE_JWKS_URL", "")

	_, err := Load()
	if err == nil || !strings.Contains(err.Error(), "SUPABASE_URL") {
		t.Fatalf("error = %v, want missing Supabase configuration", err)
	}
}

func TestLoadDerivesSupabaseIssuerAndJWKS(t *testing.T) {
	t.Setenv("ALLOW_DEV_AUTH", "false")
	t.Setenv("SUPABASE_URL", "https://project.supabase.co/")
	t.Setenv("SUPABASE_JWT_ISSUER", "")
	t.Setenv("SUPABASE_JWKS_URL", "")
	t.Setenv("SUPABASE_SERVICE_ROLE_KEY", "service-role-test-key")
	t.Setenv("ADMIN_API_KEY", "12345678901234567890123456789012")

	settings, err := Load()
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if settings.SupabaseIssuer != "https://project.supabase.co/auth/v1" {
		t.Fatalf("issuer = %q", settings.SupabaseIssuer)
	}
	if settings.SupabaseJWKSURL != "https://project.supabase.co/auth/v1/.well-known/jwks.json" {
		t.Fatalf("JWKS URL = %q", settings.SupabaseJWKSURL)
	}
}

func TestLoadRejectsInsecurePublicAppURL(t *testing.T) {
	t.Setenv("ALLOW_DEV_AUTH", "true")
	t.Setenv("PUBLIC_APP_URL", "http://example.com")

	_, err := Load()
	if err == nil || !strings.Contains(err.Error(), "PUBLIC_APP_URL") {
		t.Fatalf("error = %v, want invalid public URL", err)
	}
}
