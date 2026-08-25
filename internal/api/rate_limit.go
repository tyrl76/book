package api

import (
	"net"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"
)

type requestRateLimitBucket struct {
	windowStarted time.Time
	lastSeen      time.Time
	attempts      int
}

type requestRateLimiter struct {
	mu        sync.Mutex
	buckets   map[string]requestRateLimitBucket
	now       func() time.Time
	lastSweep time.Time
}

func newRequestRateLimiter() *requestRateLimiter {
	now := time.Now
	return &requestRateLimiter{
		buckets:   make(map[string]requestRateLimitBucket),
		now:       now,
		lastSweep: now(),
	}
}

func (limiter *requestRateLimiter) allow(key string, limit int, window time.Duration) (bool, time.Duration) {
	limiter.mu.Lock()
	defer limiter.mu.Unlock()

	now := limiter.now()
	if now.Sub(limiter.lastSweep) >= 10*time.Minute {
		for bucketKey, bucket := range limiter.buckets {
			if now.Sub(bucket.lastSeen) >= time.Hour {
				delete(limiter.buckets, bucketKey)
			}
		}
		limiter.lastSweep = now
	}

	bucket, exists := limiter.buckets[key]
	if !exists || now.Sub(bucket.windowStarted) >= window || now.Before(bucket.windowStarted) {
		limiter.buckets[key] = requestRateLimitBucket{windowStarted: now, lastSeen: now, attempts: 1}
		return true, 0
	}
	bucket.lastSeen = now
	if bucket.attempts >= limit {
		limiter.buckets[key] = bucket
		return false, window - now.Sub(bucket.windowStarted)
	}
	bucket.attempts++
	limiter.buckets[key] = bucket
	return true, 0
}

func (s *Server) rateLimit(scope string, limit int, window time.Duration, next http.HandlerFunc) http.HandlerFunc {
	return func(response http.ResponseWriter, request *http.Request) {
		allowed, retryAfter := s.rateLimiter.allow(scope+":"+clientAddress(request), limit, window)
		if !allowed {
			seconds := int(retryAfter/time.Second) + 1
			if seconds < 1 {
				seconds = 1
			}
			response.Header().Set("Retry-After", strconv.Itoa(seconds))
			response.Header().Set("Cache-Control", "no-store")
			writeError(response, http.StatusTooManyRequests, "rate_limited", "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요")
			return
		}
		next(response, request)
	}
}

func clientAddress(request *http.Request) string {
	if forwarded := strings.Split(request.Header.Get("X-Forwarded-For"), ","); len(forwarded) > 0 {
		candidate := strings.TrimSpace(forwarded[0])
		if parsed := net.ParseIP(candidate); parsed != nil {
			return parsed.String()
		}
	}
	host, _, err := net.SplitHostPort(strings.TrimSpace(request.RemoteAddr))
	if err == nil {
		if parsed := net.ParseIP(host); parsed != nil {
			return parsed.String()
		}
	}
	if parsed := net.ParseIP(strings.Trim(strings.TrimSpace(request.RemoteAddr), "[]")); parsed != nil {
		return parsed.String()
	}
	return "unknown"
}
