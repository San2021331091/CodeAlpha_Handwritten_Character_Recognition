package main

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"codealpha/inklab-gateway/models"
	"codealpha/inklab-gateway/routes"
)

func TestProxyPreservesPredictionAndValidationErrors(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/predict" {
			t.Errorf("unexpected path %s", r.URL.Path)
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(422)
		_, _ = w.Write([]byte(`{"detail":"No handwriting found."}`))
	}))
	defer upstream.Close()
	r := routes.New(upstream.URL, upstream.Client())
	req := httptest.NewRequest("POST", "/api/predict", strings.NewReader(`{"image":"blank"}`))
	req.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	r.ServeHTTP(response, req)
	if response.Code != 422 || !strings.Contains(response.Body.String(), "No handwriting") {
		t.Fatalf("upstream validation was lost: %d %s", response.Code, response.Body.String())
	}
}

func TestRejectsInvalidAndOversizeBodies(t *testing.T) {
	r := routes.New("http://127.0.0.1:1", &http.Client{})
	for _, tc := range []struct {
		body   string
		status int
	}{
		{"{broken", 400}, {strings.Repeat("x", models.MaxBodyBytes+1), 413}, {`{}`, 422}, {`{"image":42}`, 422}, {`{"image":"x","mode":"emoji"}`, 422},
	} {
		req := httptest.NewRequest("POST", "/api/predict", strings.NewReader(tc.body))
		req.Header.Set("Content-Type", "application/json")
		response := httptest.NewRecorder()
		r.ServeHTTP(response, req)
		if response.Code != tc.status {
			t.Fatalf("got %d, want %d", response.Code, tc.status)
		}
	}
}

func TestUnavailableUpstream(t *testing.T) {
	r := routes.New("http://127.0.0.1:1", &http.Client{})
	response := httptest.NewRecorder()
	r.ServeHTTP(response, httptest.NewRequest("GET", "/api/health", nil))
	if response.Code != 502 {
		t.Fatalf("got %d, want 502", response.Code)
	}
}
