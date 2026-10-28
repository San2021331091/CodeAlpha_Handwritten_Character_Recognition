package controllers

import (
	"codealpha/inklab-gateway/models"
	"codealpha/inklab-gateway/services"
	"codealpha/inklab-gateway/views"
	"encoding/json"
	"github.com/gin-gonic/gin"
	"io"
	"mime"
	"net/http"
)

type RecognitionController struct{ service services.RecognitionService }

func NewRecognitionController(service services.RecognitionService) *RecognitionController {
	return &RecognitionController{service: service}
}
func (controller *RecognitionController) Health(c *gin.Context) {
	views.JSON(c, http.StatusOK, models.HealthResponse{Status: "ok", Service: "inklab-gin"})
}
func (controller *RecognitionController) ModelHealth(c *gin.Context) {
	controller.forward(c, http.MethodGet, "/health", nil)
}
func (controller *RecognitionController) Metrics(c *gin.Context) {
	controller.forward(c, http.MethodGet, "/metrics", nil)
}
func (controller *RecognitionController) Samples(c *gin.Context) {
	controller.forward(c, http.MethodGet, "/samples", nil)
}
func (controller *RecognitionController) Predict(c *gin.Context) {
	mediaType, _, err := mime.ParseMediaType(c.GetHeader("Content-Type"))
	if err != nil || mediaType != "application/json" {
		views.Error(c, http.StatusUnsupportedMediaType, "Content-Type must be application/json.")
		return
	}
	data, err := io.ReadAll(http.MaxBytesReader(c.Writer, c.Request.Body, models.MaxBodyBytes))
	if err != nil {
		views.Error(c, http.StatusRequestEntityTooLarge, "Image request must be smaller than 6 MB.")
		return
	}
	if !json.Valid(data) {
		views.Error(c, http.StatusBadRequest, "Invalid JSON request.")
		return
	}
	var prediction models.PredictionRequest
	if json.Unmarshal(data, &prediction) != nil || prediction.Image == "" {
		views.Error(c, http.StatusUnprocessableEntity, "image must be a non-empty base64 image string.")
		return
	}
	if prediction.Mode != "" && prediction.Mode != "all" && prediction.Mode != "letters" && prediction.Mode != "digits" {
		views.Error(c, http.StatusUnprocessableEntity, "mode must be all, letters, or digits.")
		return
	}
	controller.forward(c, http.MethodPost, "/predict", data)
}
func (controller *RecognitionController) forward(c *gin.Context, method, path string, body []byte) {
	response, err := controller.service.Fetch(c.Request.Context(), method, path, body)
	if err != nil {
		views.Error(c, http.StatusBadGateway, "ML service unavailable or returned an invalid response. Check that FastAPI is running.")
		return
	}
	views.MLResponse(c, response)
}
