package config

import (
	"fmt"
	"net/url"
	"os"
)

type Settings struct {
	Address      string
	MLServiceURL string
}

func Load() (Settings, error) {
	settings := Settings{Address: os.Getenv("GATEWAY_ADDR"), MLServiceURL: os.Getenv("ML_SERVICE_URL")}
	parsed, err := url.Parse(settings.MLServiceURL)
	if err != nil || parsed.Host == "" || (parsed.Scheme != "http" && parsed.Scheme != "https") {
		return Settings{}, fmt.Errorf("ML_SERVICE_URL must be an absolute HTTP(S) URL")
	}
	return settings, nil
}
