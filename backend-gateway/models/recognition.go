package models

// MaxBodyBytes includes the base64 encoding and JSON envelope of a 4 MB image.
const MaxBodyBytes = 6 * 1024 * 1024

type PredictionRequest struct {
	Image string `json:"image"`
	Mode  string `json:"mode,omitempty"`
}
type ErrorResponse struct {
	Detail string `json:"detail"`
}
type HealthResponse struct {
	Status  string `json:"status"`
	Service string `json:"service"`
}
// MLResponse retains upstream JSON and status, including validation details.
type MLResponse struct {
	StatusCode int
	Body       []byte
}
