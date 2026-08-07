package inbox

import (
	"bytes"
	"encoding/json"
	"path/filepath"
	"reflect"
	"testing"
)

func TestNewStoreUsesDeterministicIdempotentSeed(t *testing.T) {
	path := filepath.Join(t.TempDir(), "data", "events.json")

	first, err := OpenStore(path)
	if err != nil {
		t.Fatalf("open first store: %v", err)
	}
	firstEvents := first.List()
	if !eventsSemanticallyEqual(firstEvents, SeedEvents) {
		t.Fatalf("seed mismatch: got %#v, want %#v", firstEvents, SeedEvents)
	}

	second, err := OpenStore(path)
	if err != nil {
		t.Fatalf("reopen store: %v", err)
	}
	if got := second.List(); !eventsSemanticallyEqual(got, SeedEvents) {
		t.Fatalf("reopening changed seed: got %#v, want %#v", got, SeedEvents)
	}
}

func TestAddedWebhookPersistsAndReceivesNextStableID(t *testing.T) {
	path := filepath.Join(t.TempDir(), "events.json")
	store, err := OpenStore(path)
	if err != nil {
		t.Fatalf("open store: %v", err)
	}

	created, err := store.Add(IncomingWebhook{
		EventType: "deployment.completed",
		Source:    "release-service",
		Payload:   []byte(`{"deploymentId":"dep-42","status":"ready"}`),
	})
	if err != nil {
		t.Fatalf("add webhook: %v", err)
	}
	if created.ID != "evt-0004" {
		t.Fatalf("created ID = %q, want evt-0004", created.ID)
	}

	reopened, err := OpenStore(path)
	if err != nil {
		t.Fatalf("reopen store: %v", err)
	}
	got, err := reopened.Get(created.ID)
	if err != nil {
		t.Fatalf("get persisted webhook: %v", err)
	}
	if !reflect.DeepEqual(got, created) {
		t.Fatalf("persisted event = %#v, want %#v", got, created)
	}
}

func eventsSemanticallyEqual(got, want []Event) bool {
	if len(got) != len(want) {
		return false
	}
	for index := range got {
		gotEvent := got[index]
		wantEvent := want[index]
		gotPayload := compactJSON(gotEvent.Payload)
		wantPayload := compactJSON(wantEvent.Payload)
		gotEvent.Payload = gotPayload
		wantEvent.Payload = wantPayload
		if !reflect.DeepEqual(gotEvent, wantEvent) {
			return false
		}
	}
	return true
}

func compactJSON(payload json.RawMessage) json.RawMessage {
	var compacted bytes.Buffer
	if err := json.Compact(&compacted, payload); err != nil {
		return payload
	}
	return compacted.Bytes()
}
