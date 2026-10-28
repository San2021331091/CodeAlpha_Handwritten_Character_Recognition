package views

import (
	"codealpha/inklab-gateway/models"
	"github.com/gin-gonic/gin"
)

// The API's MVC view renders JSON; Next.js renders the user interface.
func JSON(c *gin.Context, status int, value any) { c.JSON(status, value) }
func Error(c *gin.Context, status int, detail string) {
	JSON(c, status, models.ErrorResponse{Detail: detail})
}
func MLResponse(c *gin.Context, response models.MLResponse) {
	c.Data(response.StatusCode, "application/json", response.Body)
}
