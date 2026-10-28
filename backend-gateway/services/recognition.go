package services

import (
	"bytes"
	"codealpha/inklab-gateway/models"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
)

// RecognitionService keeps HTTP transport out of the controller.
type RecognitionService interface {
	Fetch(context.Context, string, string, []byte) (models.MLResponse, error)
}

type MLClient struct {
	baseURL    string
	httpClient *http.Client
}

func NewMLClient(baseURL string, client *http.Client) *MLClient {
	return &MLClient{baseURL: strings.TrimRight(baseURL, "/"), httpClient: client}
}

func (client *MLClient) Fetch(ctx context.Context, method, path string, payload []byte) (models.MLResponse, error) {
	req, err := http.NewRequestWithContext(ctx, method, client.baseURL+path, bytes.NewReader(payload))
	if err != nil {
		return models.MLResponse{}, fmt.Errorf("create ML request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	response, err := client.httpClient.Do(req)
	if err != nil {
		return models.MLResponse{}, fmt.Errorf("ML service unavailable: %w", err)
	}
	defer response.Body.Close()
	data, err := io.ReadAll(io.LimitReader(response.Body, models.MaxBodyBytes+1))
	if err != nil || len(data) > models.MaxBodyBytes || !json.Valid(data) {
		return models.MLResponse{}, fmt.Errorf("invalid response from ML service")
	}
	return models.MLResponse{StatusCode: response.StatusCode, Body: data}, nil
}
