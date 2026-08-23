package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/datau/book/internal/api"
	bookauth "github.com/datau/book/internal/auth"
	"github.com/datau/book/internal/catalog"
	"github.com/datau/book/internal/catalog/kakao"
	"github.com/datau/book/internal/config"
	"github.com/datau/book/internal/store/postgres"
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	slog.SetDefault(logger)

	settings, err := config.Load()
	if err != nil {
		logger.Error("load config", "error", err)
		os.Exit(1)
	}

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	store, err := postgres.Open(ctx, settings.DatabaseURL)
	if err != nil {
		logger.Error("open store", "error", err)
		os.Exit(1)
	}
	defer store.Close()

	var tokenVerifier api.TokenVerifier
	var authUserDeleter api.AuthUserDeleter
	if settings.SupabaseIssuer != "" {
		verifier, err := bookauth.NewVerifier(ctx, settings.SupabaseIssuer, settings.SupabaseJWKSURL)
		if err != nil {
			logger.Error("configure Supabase JWT verifier", "error", err)
			os.Exit(1)
		}
		tokenVerifier = verifier
	}
	if settings.SupabaseURL != "" && settings.SupabaseServiceRoleKey != "" {
		authUserDeleter = bookauth.NewAdminClient(settings.SupabaseURL, settings.SupabaseServiceRoleKey)
	}

	var catalogProvider catalog.Provider = store
	if settings.KakaoRESTAPIKey != "" {
		catalogProvider = catalog.NewLayeredProvider(kakao.NewClient(settings.KakaoRESTAPIKey), store)
	}

	handler := api.NewServer(store, api.Options{
		AllowedOrigins:  settings.AllowedOrigins,
		AllowDevAuth:    settings.AllowDevAuth,
		DevUserID:       settings.DevUserID,
		TokenVerifier:   tokenVerifier,
		Catalog:         catalogProvider,
		AuthUserDeleter: authUserDeleter,
		AdminAPIKey:     settings.AdminAPIKey,
		PublicAppURL:    settings.PublicAppURL,
		Logger:          logger,
	})
	server := &http.Server{
		Addr:              ":" + settings.Port,
		Handler:           handler,
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       15 * time.Second,
		WriteTimeout:      15 * time.Second,
		IdleTimeout:       60 * time.Second,
	}

	go func() {
		logger.Info("api listening", "address", server.Addr, "devAuth", settings.AllowDevAuth, "supabaseAuth", tokenVerifier != nil, "kakaoCatalog", settings.KakaoRESTAPIKey != "")
		if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			logger.Error("serve api", "error", err)
			stop()
		}
	}()

	<-ctx.Done()
	shutdownContext, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := server.Shutdown(shutdownContext); err != nil {
		logger.Error("shutdown api", "error", err)
	}
}
