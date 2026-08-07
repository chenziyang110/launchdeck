package inbox

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
)

func TestHealthAndEventListExposeReadySeed(t *testing.T) {
	store, err := OpenStore(filepath.Join(t.TempDir(), "events.json"))
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	handler := NewHandler(store)

	health := request(t, handler, http.MethodGet, "/health", "")
	if health.Code != http.StatusOK {
		t.Fatalf("health status = %d, want 200", health.Code)
	}
	var healthBody map[string]any
	decode(t, health.Body.String(), &healthBody)
	if healthBody["status"] != "ok" || healthBody["service"] != serviceName {
		t.Fatalf("unexpected health body: %#v", healthBody)
	}

	list := request(t, handler, http.MethodGet, "/api/events", "")
	if list.Code != http.StatusOK {
		t.Fatalf("list status = %d, want 200", list.Code)
	}
	var listBody struct {
		Events []Event `json:"events"`
		Count  int     `json:"count"`
	}
	decode(t, list.Body.String(), &listBody)
	if listBody.Count != len(SeedEvents) || len(listBody.Events) != len(SeedEvents) {
		t.Fatalf("unexpected list body: %#v", listBody)
	}
}

func TestWebhookPostReturnsAndPersistsEvent(t *testing.T) {
	path := filepath.Join(t.TempDir(), "events.json")
	store, err := OpenStore(path)
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	handler := NewHandler(store)

	response := request(t, handler, http.MethodPost, "/api/webhooks", `{"eventType":"payment.received","source":"payments","payload":{"paymentId":"pay-7"}}`)
	if response.Code != http.StatusCreated {
		t.Fatalf("post status = %d, want 201: %s", response.Code, response.Body.String())
	}
	var created Event
	decode(t, response.Body.String(), &created)
	if created.ID != "evt-0004" || created.EventType != "payment.received" {
		t.Fatalf("unexpected created event: %#v", created)
	}

	stored, err := store.Get(created.ID)
	if err != nil {
		t.Fatalf("get created event: %v", err)
	}
	if string(stored.Payload) != string(created.Payload) {
		t.Fatalf("stored payload = %s, want %s", stored.Payload, created.Payload)
	}
}

func TestWebhookPostRejectsInvalidPayloadWithoutMutation(t *testing.T) {
	store, err := OpenStore(filepath.Join(t.TempDir(), "events.json"))
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	handler := NewHandler(store)

	response := request(t, handler, http.MethodPost, "/api/webhooks", `{"eventType":"bad","source":"test","payload":[]}`)
	if response.Code != http.StatusBadRequest {
		t.Fatalf("invalid post status = %d, want 400", response.Code)
	}
	if got := len(store.List()); got != len(SeedEvents) {
		t.Fatalf("invalid request changed event count to %d", got)
	}
}

func request(t *testing.T, handler http.Handler, method, path, body string) *httptest.ResponseRecorder {
	t.Helper()
	request := httptest.NewRequest(method, path, strings.NewReader(body))
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	return response
}

func decode(t *testing.T, body string, target any) {
	t.Helper()
	if err := json.Unmarshal([]byte(body), target); err != nil {
		t.Fatalf("decode response %q: %v", body, err)
	}
}
