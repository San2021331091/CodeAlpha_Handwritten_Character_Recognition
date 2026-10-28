package main

import (
	"codealpha/inklab-gateway/config"
	"codealpha/inklab-gateway/routes"
	"log"
	"net/http"
	"time"
)

func main() {
	settings, err := config.Load()
	if err != nil {
		log.Fatal(err)
	}
	server := &http.Server{
		Addr:              settings.Address,
		Handler:           routes.New(settings.MLServiceURL, &http.Client{Timeout: 30 * time.Second}),
		ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 15 * time.Second,
		WriteTimeout: 40 * time.Second, IdleTimeout: 60 * time.Second, MaxHeaderBytes: 1 << 20,
	}
	log.Printf("InkLab Gin gateway listening on %s", settings.Address)
	log.Fatal(server.ListenAndServe())
}
