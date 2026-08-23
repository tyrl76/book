package auth

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

type AdminClient struct {
	baseURL string
	apiKey  string
	client  *http.Client
}

func NewAdminClient(baseURL, serviceRoleKey string) *AdminClient {
	return &AdminClient{
		baseURL: strings.TrimRight(baseURL, "/"),
		apiKey:  strings.TrimSpace(serviceRoleKey),
		client:  &http.Client{Timeout: 10 * time.Second},
	}
}

func (c *AdminClient) DeleteUser(ctx context.Context, userID string) error {
	if c.baseURL == "" || c.apiKey == "" {
		return errors.New("Supabase admin client is not configured")
	}
	endpoint := c.baseURL + "/auth/v1/admin/users/" + url.PathEscape(userID)
	request, err := http.NewRequestWithContext(ctx, http.MethodDelete, endpoint, nil)
	if err != nil {
		return fmt.Errorf("create Supabase delete request: %w", err)
	}
	request.Header.Set("Authorization", "Bearer "+c.apiKey)
	request.Header.Set("apikey", c.apiKey)
	response, err := c.client.Do(request)
	if err != nil {
		return fmt.Errorf("delete Supabase auth user: %w", err)
	}
	defer response.Body.Close()
	if response.StatusCode == http.StatusOK || response.StatusCode == http.StatusNoContent || response.StatusCode == http.StatusNotFound {
		return nil
	}
	body, _ := io.ReadAll(io.LimitReader(response.Body, 4<<10))
	return fmt.Errorf("delete Supabase auth user: status %d: %s", response.StatusCode, strings.TrimSpace(string(body)))
}
