package inbox

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
)

const serviceName = "go-webhook-inbox"

// NewHandler returns the HTTP API for a persistence-backed webhook inbox.
func NewHandler(store *Store) http.Handler {
	if store == nil {
		panic("go-webhook-inbox requires a store")
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/", root)
	mux.HandleFunc("/health", health(store))
	mux.HandleFunc("/api/events", events(store))
	mux.HandleFunc("/api/events/", event(store))
	mux.HandleFunc("/api/webhooks", webhooks(store))
	return mux
}

func root(response http.ResponseWriter, request *http.Request) {
	if request.URL.Path != "/" {
		notFound(response, request)
		return
	}
	if request.Method != http.MethodGet {
		methodNotAllowed(response, http.MethodGet)
		return
	}
	writeJSON(response, http.StatusOK, map[string]any{
		"service":  serviceName,
		"health":   "/health",
		"events":   "/api/events",
		"webhooks": "/api/webhooks",
	})
}

func health(store *Store) http.HandlerFunc {
	return func(response http.ResponseWriter, request *http.Request) {
		if request.Method != http.MethodGet {
			methodNotAllowed(response, http.MethodGet)
			return
		}
		writeJSON(response, http.StatusOK, map[string]any{
			"status":           "ok",
			"service":          serviceName,
			"persistence":      "json-file",
			"eventCount":       len(store.List()),
			"seededEventCount": len(SeedEvents),
		})
	}
}

func events(store *Store) http.HandlerFunc {
	return func(response http.ResponseWriter, request *http.Request) {
		if request.URL.Path != "/api/events" {
			notFound(response, request)
			return
		}
		if request.Method != http.MethodGet {
			methodNotAllowed(response, http.MethodGet)
			return
		}
		items := store.List()
		writeJSON(response, http.StatusOK, map[string]any{
			"events": items,
			"count":  len(items),
		})
	}
}

func event(store *Store) http.HandlerFunc {
	return func(response http.ResponseWriter, request *http.Request) {
		if request.Method != http.MethodGet {
			methodNotAllowed(response, http.MethodGet)
			return
		}
		id := strings.TrimPrefix(request.URL.Path, "/api/events/")
		if id == "" || strings.Contains(id, "/") {
			notFound(response, request)
			return
		}
		item, err := store.Get(id)
		if errors.Is(err, ErrEventNotFound) {
			writeError(response, http.StatusNotFound, "event not found")
			return
		}
		if err != nil {
			writeError(response, http.StatusInternalServerError, err.Error())
			return
		}
		writeJSON(response, http.StatusOK, item)
	}
}

func webhooks(store *Store) http.HandlerFunc {
	return func(response http.ResponseWriter, request *http.Request) {
		if request.URL.Path != "/api/webhooks" {
			notFound(response, request)
			return
		}
		if request.Method != http.MethodPost {
			methodNotAllowed(response, http.MethodPost)
			return
		}

		var payload IncomingWebhook
		decoder := json.NewDecoder(http.MaxBytesReader(response, request.Body, 1<<20))
		decoder.DisallowUnknownFields()
		if err := decoder.Decode(&payload); err != nil {
			writeError(response, http.StatusBadRequest, "request body must be a JSON object")
			return
		}
		var trailing any
		if err := decoder.Decode(&trailing); !errors.Is(err, io.EOF) {
			writeError(response, http.StatusBadRequest, "request body must contain one JSON object")
			return
		}

		created, err := store.Add(payload)
		if err != nil {
			writeError(response, http.StatusBadRequest, fmt.Sprintf("invalid webhook: %v", err))
			return
		}
		writeJSON(response, http.StatusCreated, created)
	}
}

func notFound(response http.ResponseWriter, request *http.Request) {
	writeError(response, http.StatusNotFound, fmt.Sprintf("route %s was not found", request.URL.Path))
}

func methodNotAllowed(response http.ResponseWriter, allowed string) {
	response.Header().Set("Allow", allowed)
	writeError(response, http.StatusMethodNotAllowed, "method not allowed")
}

func writeError(response http.ResponseWriter, status int, message string) {
	writeJSON(response, status, map[string]string{"error": message})
}

func writeJSON(response http.ResponseWriter, status int, value any) {
	response.Header().Set("Content-Type", "application/json")
	response.WriteHeader(status)
	if err := json.NewEncoder(response).Encode(value); err != nil {
		return
	}
}
