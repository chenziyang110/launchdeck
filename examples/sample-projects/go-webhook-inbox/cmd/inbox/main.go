package main

import (
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"time"

	"example.com/go-webhook-inbox/internal/inbox"
)

const defaultPort = 8106

func main() {
	port, err := configuredPort()
	if err != nil {
		log.Fatal(err)
	}
	host := os.Getenv("HOST")
	if host == "" {
		host = "127.0.0.1"
	}
	dataPath := os.Getenv("INBOX_DATA_PATH")
	if dataPath == "" {
		dataPath = filepath.Join("data", "events.json")
	}

	store, err := inbox.OpenStore(dataPath)
	if err != nil {
		log.Fatalf("open inbox persistence: %v", err)
	}

	address := net.JoinHostPort(host, strconv.Itoa(port))
	server := &http.Server{
		Addr:              address,
		Handler:           inbox.NewHandler(store),
		ReadHeaderTimeout: 5 * time.Second,
	}
	log.Printf("go-webhook-inbox listening at http://%s/health (data: %s)", address, store.Path())
	if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatal(err)
	}
}

func configuredPort() (int, error) {
	value := os.Getenv("PORT")
	if value == "" {
		return defaultPort, nil
	}
	port, err := strconv.Atoi(value)
	if err != nil || port < 1 || port > 65535 {
		return 0, fmt.Errorf("PORT must be an integer between 1 and 65535")
	}
	return port, nil
}
