package config

import (
	"fmt"
	"net/url"
	"os"
	"strconv"
	"strings"
)

const defaultDevUserID = "11111111-1111-4111-8111-111111111111"

type Config struct {
	DatabaseURL            string
	Port                   string
	AllowedOrigins         []string
	AllowDevAuth           bool
	LocalAuthEnabled       bool
	DevUserID              string
	SupabaseURL            string
	SupabaseIssuer         string
	SupabaseJWKSURL        string
	SupabaseServiceRoleKey string
	AdminAPIKey            string
	AdminOpenAccess        bool
	PublicAppURL           string
	KakaoRESTAPIKey        string
	GoogleBooksAPIKey      string
	ExpoPushURL            string
}

func Load() (Config, error) {
	allowDevAuth, err := strconv.ParseBool(envOr("ALLOW_DEV_AUTH", "false"))
	if err != nil {
		return Config{}, fmt.Errorf("parse ALLOW_DEV_AUTH: %w", err)
	}
	localAuthEnabled, err := strconv.ParseBool(envOr("LOCAL_AUTH_ENABLED", "true"))
	if err != nil {
		return Config{}, fmt.Errorf("parse LOCAL_AUTH_ENABLED: %w", err)
	}
	adminOpenAccess, err := strconv.ParseBool(envOr("ADMIN_OPEN_ACCESS", "false"))
	if err != nil {
		return Config{}, fmt.Errorf("parse ADMIN_OPEN_ACCESS: %w", err)
	}

	origins := strings.Split(envOr("ALLOWED_ORIGINS", "http://localhost:8081,http://127.0.0.1:8081,http://localhost:19006,http://127.0.0.1:19006"), ",")
	for index := range origins {
		origins[index] = strings.TrimSpace(origins[index])
	}

	supabaseURL := strings.TrimRight(strings.TrimSpace(os.Getenv("SUPABASE_URL")), "/")
	supabaseIssuer := strings.TrimRight(strings.TrimSpace(os.Getenv("SUPABASE_JWT_ISSUER")), "/")
	if supabaseIssuer == "" && supabaseURL != "" {
		supabaseIssuer = supabaseURL + "/auth/v1"
	}
	supabaseJWKSURL := strings.TrimSpace(os.Getenv("SUPABASE_JWKS_URL"))
	if supabaseJWKSURL == "" && supabaseIssuer != "" {
		supabaseJWKSURL = supabaseIssuer + "/.well-known/jwks.json"
	}
	if !allowDevAuth && !localAuthEnabled && supabaseIssuer == "" {
		return Config{}, fmt.Errorf("LOCAL_AUTH_ENABLED or SUPABASE_URL/SUPABASE_JWT_ISSUER is required when ALLOW_DEV_AUTH=false")
	}
	serviceRoleKey := strings.TrimSpace(os.Getenv("SUPABASE_SERVICE_ROLE_KEY"))
	adminAPIKey := strings.TrimSpace(os.Getenv("ADMIN_API_KEY"))
	if adminAPIKey != "" && len(adminAPIKey) < 32 {
		return Config{}, fmt.Errorf("ADMIN_API_KEY must be at least 32 characters when configured")
	}
	publicAppURL := strings.TrimRight(strings.TrimSpace(os.Getenv("PUBLIC_APP_URL")), "/")
	if publicAppURL != "" {
		parsed, err := url.Parse(publicAppURL)
		if err != nil || parsed.Host == "" || (parsed.Scheme != "https" && !(parsed.Scheme == "http" && (parsed.Hostname() == "localhost" || parsed.Hostname() == "127.0.0.1"))) {
			return Config{}, fmt.Errorf("PUBLIC_APP_URL must be an HTTPS origin or local HTTP origin")
		}
	}

	return Config{
		DatabaseURL:            envOr("DATABASE_URL", "postgres://book:book@localhost:55432/book?sslmode=disable"),
		Port:                   envOr("PORT", "8080"),
		AllowedOrigins:         origins,
		AllowDevAuth:           allowDevAuth,
		LocalAuthEnabled:       localAuthEnabled,
		DevUserID:              envOr("DEV_USER_ID", defaultDevUserID),
		SupabaseURL:            supabaseURL,
		SupabaseIssuer:         supabaseIssuer,
		SupabaseJWKSURL:        supabaseJWKSURL,
		SupabaseServiceRoleKey: serviceRoleKey,
		AdminAPIKey:            adminAPIKey,
		AdminOpenAccess:        adminOpenAccess,
		PublicAppURL:           publicAppURL,
		KakaoRESTAPIKey:        strings.TrimSpace(os.Getenv("KAKAO_REST_API_KEY")),
		GoogleBooksAPIKey:      strings.TrimSpace(os.Getenv("GOOGLE_BOOKS_API_KEY")),
		ExpoPushURL:            strings.TrimSpace(os.Getenv("EXPO_PUSH_URL")),
	}, nil
}

func envOr(key, fallback string) string {
	if value := strings.TrimSpace(os.Getenv(key)); value != "" {
		return value
	}
	return fallback
}
