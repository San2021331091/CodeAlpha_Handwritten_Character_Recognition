package routes

import (
	"codealpha/inklab-gateway/controllers"
	"codealpha/inklab-gateway/middleware"
	"codealpha/inklab-gateway/services"
	"github.com/gin-gonic/gin"
	"net/http"
)

func New(serviceURL string, client *http.Client) *gin.Engine {
	router := gin.New()
	router.Use(gin.Logger(), gin.Recovery(), middleware.ResponseHeaders())
	controller := controllers.NewRecognitionController(services.NewMLClient(serviceURL, client))
	router.GET("/health", controller.Health)
	api := router.Group("/api")
	api.GET("/health", controller.ModelHealth)
	api.GET("/metrics", controller.Metrics)
	api.GET("/samples", controller.Samples)
	api.POST("/predict", controller.Predict)
	return router
}
