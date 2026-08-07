package inbox

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
)

var errInvalidEvent = errors.New("event is invalid")

// Event is the durable representation of a webhook received by the inbox.
type Event struct {
	ID         string          `json:"id"`
	EventType  string          `json:"eventType"`
	Source     string          `json:"source"`
	Payload    json.RawMessage `json:"payload"`
	ReceivedAt string          `json:"receivedAt"`
}

// IncomingWebhook is the small public request shape accepted by the API.
type IncomingWebhook struct {
	EventType string          `json:"eventType"`
	Source    string          `json:"source"`
	Payload   json.RawMessage `json:"payload"`
}

func (event Event) validate() error {
	if strings.TrimSpace(event.ID) == "" || strings.TrimSpace(event.EventType) == "" {
		return fmt.Errorf("%w: id and eventType are required", errInvalidEvent)
	}
	if strings.TrimSpace(event.Source) == "" {
		return fmt.Errorf("%w: source is required", errInvalidEvent)
	}
	if !json.Valid(event.Payload) || bytes.Equal(bytes.TrimSpace(event.Payload), []byte("null")) {
		return fmt.Errorf("%w: payload must be valid JSON", errInvalidEvent)
	}
	if strings.TrimSpace(event.ReceivedAt) == "" {
		return fmt.Errorf("%w: receivedAt is required", errInvalidEvent)
	}
	return nil
}

func (request IncomingWebhook) validate() error {
	if strings.TrimSpace(request.EventType) == "" {
		return fmt.Errorf("eventType is required")
	}
	if strings.TrimSpace(request.Source) == "" {
		return fmt.Errorf("source is required")
	}
	trimmedPayload := bytes.TrimSpace(request.Payload)
	if len(trimmedPayload) == 0 || !json.Valid(trimmedPayload) || bytes.Equal(trimmedPayload, []byte("null")) {
		return fmt.Errorf("payload must be valid JSON")
	}
	if trimmedPayload[0] != '{' {
		return fmt.Errorf("payload must be a JSON object")
	}
	return nil
}

func cloneEvent(event Event) Event {
	event.Payload = append(json.RawMessage(nil), event.Payload...)
	return event
}

func cloneEvents(events []Event) []Event {
	cloned := make([]Event, len(events))
	for index, event := range events {
		cloned[index] = cloneEvent(event)
	}
	return cloned
}
