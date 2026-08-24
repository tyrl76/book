package main

import (
	"context"
	"log/slog"
	"os"
	"strings"
	"time"

	"github.com/datau/book/migrations"
	"github.com/jackc/pgx/v5"
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	databaseURL := strings.TrimSpace(os.Getenv("DATABASE_URL"))
	if databaseURL == "" {
		logger.Error("DATABASE_URL is required")
		os.Exit(1)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()
	conn, err := pgx.Connect(ctx, databaseURL)
	if err != nil {
		logger.Error("connect database", "error", err)
		os.Exit(1)
	}
	defer func() { _ = conn.Close(context.Background()) }()

	result, err := migrations.Apply(ctx, conn)
	if err != nil {
		logger.Error("apply migrations", "error", err)
		os.Exit(1)
	}
	logger.Info("migrations complete", "applied", result.Applied, "alreadyApplied", len(result.Skipped))
}
