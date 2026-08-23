package api

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"math"
	"net/http"
	"regexp"
	"strconv"
	"strings"

	"github.com/datau/book/internal/catalog"
)

var isbnPattern = regexp.MustCompile(`^(?:\d{10}|\d{13})$`)

func (s *Server) searchBooks(response http.ResponseWriter, request *http.Request, _ string) {
	query := strings.TrimSpace(request.URL.Query().Get("query"))
	if len([]rune(query)) < 2 || len([]rune(query)) > 100 {
		writeError(response, http.StatusBadRequest, "invalid_query", "검색어는 2자 이상 100자 이하여야 합니다")
		return
	}
	limit := 20
	if raw := request.URL.Query().Get("limit"); raw != "" {
		parsed, err := strconv.Atoi(raw)
		if err != nil || parsed < 1 || parsed > 50 {
			writeError(response, http.StatusBadRequest, "invalid_limit", "limit은 1에서 50 사이여야 합니다")
			return
		}
		limit = parsed
	}
	if s.catalog == nil {
		writeError(response, http.StatusServiceUnavailable, "catalog_unavailable", "도서 검색이 설정되지 않았습니다")
		return
	}
	items, err := s.catalog.Search(request.Context(), query, limit)
	if err != nil {
		s.catalogError(response, err)
		return
	}
	writeJSON(response, http.StatusOK, map[string]any{"items": items})
}

func (s *Server) lookupBook(response http.ResponseWriter, request *http.Request, _ string) {
	isbn := normalizeISBN(request.PathValue("isbn"))
	if !isbnPattern.MatchString(isbn) {
		writeError(response, http.StatusBadRequest, "invalid_isbn", "ISBN은 숫자 10자리 또는 13자리여야 합니다")
		return
	}
	if s.catalog == nil {
		writeError(response, http.StatusServiceUnavailable, "catalog_unavailable", "도서 검색이 설정되지 않았습니다")
		return
	}
	item, err := s.catalog.LookupISBN(request.Context(), isbn)
	if err != nil {
		s.catalogError(response, err)
		return
	}
	writeJSON(response, http.StatusOK, item)
}

type createReadingRunRequest struct {
	ISBN          string  `json:"isbn"`
	TotalValue    float64 `json:"totalValue"`
	ProgressBasis string  `json:"progressBasis"`
	Status        string  `json:"status"`
}

func (s *Server) createReadingRun(response http.ResponseWriter, request *http.Request, userID string) {
	var payload createReadingRunRequest
	decoder := json.NewDecoder(http.MaxBytesReader(response, request.Body, 16<<10))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&payload); err != nil {
		writeError(response, http.StatusBadRequest, "invalid_json", "요청 본문을 확인해 주세요")
		return
	}
	payload.ISBN = normalizeISBN(payload.ISBN)
	if payload.ProgressBasis == "" {
		payload.ProgressBasis = "pages"
	}
	if payload.Status == "" {
		payload.Status = "reading"
	}
	if !isbnPattern.MatchString(payload.ISBN) || payload.TotalValue < 0 || payload.TotalValue > 1_000_000 || payload.TotalValue != math.Trunc(payload.TotalValue) ||
		(payload.ProgressBasis != "pages" && payload.ProgressBasis != "percent" && payload.ProgressBasis != "audio_seconds") ||
		(payload.Status != "reading" && payload.Status != "want_to_read") ||
		(payload.ProgressBasis == "audio_seconds" && payload.TotalValue <= 0) {
		writeError(response, http.StatusBadRequest, "invalid_book", "ISBN 또는 전체 분량을 확인해 주세요")
		return
	}
	if s.catalog == nil {
		writeError(response, http.StatusServiceUnavailable, "catalog_unavailable", "도서 검색이 설정되지 않았습니다")
		return
	}
	book, err := s.catalog.LookupISBN(request.Context(), payload.ISBN)
	if err != nil {
		s.catalogError(response, err)
		return
	}
	item, err := s.store.CreateReadingRun(request.Context(), userID, CreateReadingRunCommand{
		Book: book, TotalValue: payload.TotalValue, ProgressBasis: payload.ProgressBasis, Status: payload.Status,
	})
	if err != nil {
		if errors.Is(err, ErrConflict) {
			writeError(response, http.StatusConflict, "reading_run_exists", "이미 읽는 중인 책입니다")
			return
		}
		s.internalError(response, err)
		return
	}
	writeJSON(response, http.StatusCreated, item)
}

type CreateManualReadingRunCommand struct {
	Title         string
	Author        string
	TotalValue    float64
	ProgressBasis string
	Status        string
}

type ManualReadingStore interface {
	CreateManualReadingRun(context.Context, string, CreateManualReadingRunCommand) (ReadingRun, error)
}

type createManualReadingRunRequest struct {
	Title         string  `json:"title"`
	Author        string  `json:"author"`
	TotalValue    float64 `json:"totalValue"`
	ProgressBasis string  `json:"progressBasis"`
	Status        string  `json:"status"`
}

func (s *Server) createManualReadingRun(response http.ResponseWriter, request *http.Request, userID string) {
	store, ok := s.store.(ManualReadingStore)
	if !ok {
		writeError(response, http.StatusNotImplemented, "feature_unavailable", "수동 도서 등록 저장소가 설정되지 않았습니다")
		return
	}
	var payload createManualReadingRunRequest
	decoder := json.NewDecoder(http.MaxBytesReader(response, request.Body, 16<<10))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&payload); err != nil {
		writeError(response, http.StatusBadRequest, "invalid_json", "요청 본문을 확인해 주세요")
		return
	}
	payload.Title = strings.TrimSpace(payload.Title)
	payload.Author = strings.TrimSpace(payload.Author)
	if payload.Status == "" {
		payload.Status = "reading"
	}
	if len([]rune(payload.Title)) < 1 || len([]rune(payload.Title)) > 200 || len([]rune(payload.Author)) > 120 ||
		(payload.ProgressBasis != "pages" && payload.ProgressBasis != "percent" && payload.ProgressBasis != "audio_seconds") ||
		(payload.Status != "reading" && payload.Status != "want_to_read") || payload.TotalValue <= 0 || payload.TotalValue > 1_000_000 || payload.TotalValue != math.Trunc(payload.TotalValue) {
		writeError(response, http.StatusBadRequest, "invalid_book", "제목과 전체 분량을 확인해 주세요")
		return
	}
	if payload.ProgressBasis == "percent" {
		payload.TotalValue = 100
	}
	item, err := store.CreateManualReadingRun(request.Context(), userID, CreateManualReadingRunCommand{
		Title: payload.Title, Author: payload.Author, TotalValue: payload.TotalValue,
		ProgressBasis: payload.ProgressBasis, Status: payload.Status,
	})
	if err != nil {
		s.internalError(response, err)
		return
	}
	writeJSON(response, http.StatusCreated, item)
}

type bootstrapUserRequest struct {
	Nickname string `json:"nickname"`
}

func (s *Server) bootstrapUser(response http.ResponseWriter, request *http.Request, userID string) {
	payload := bootstrapUserRequest{}
	decoder := json.NewDecoder(http.MaxBytesReader(response, request.Body, 8<<10))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&payload); err != nil && !errors.Is(err, io.EOF) {
		writeError(response, http.StatusBadRequest, "invalid_json", "요청 본문을 확인해 주세요")
		return
	}
	payload.Nickname = strings.TrimSpace(payload.Nickname)
	if len([]rune(payload.Nickname)) > 40 {
		writeError(response, http.StatusBadRequest, "invalid_nickname", "닉네임은 40자 이하여야 합니다")
		return
	}
	if err := s.store.EnsureUser(request.Context(), userID, payload.Nickname); err != nil {
		s.internalError(response, err)
		return
	}
	response.WriteHeader(http.StatusNoContent)
}

func (s *Server) catalogError(response http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, catalog.ErrNotFound):
		writeError(response, http.StatusNotFound, "book_not_found", "도서를 찾을 수 없습니다")
	case errors.Is(err, catalog.ErrUnavailable):
		writeError(response, http.StatusServiceUnavailable, "catalog_unavailable", "도서 검색 서비스에 연결할 수 없습니다")
	default:
		s.internalError(response, err)
	}
}

func normalizeISBN(value string) string {
	replacer := strings.NewReplacer("-", "", " ", "")
	return replacer.Replace(strings.TrimSpace(value))
}
