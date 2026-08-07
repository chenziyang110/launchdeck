package inbox

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

var ErrEventNotFound = errors.New("event not found")

type persistedState struct {
	Events []Event `json:"events"`
}

// Store keeps a small webhook inbox in a local JSON file. The mutex makes
// concurrent HTTP requests safe while keeping the sample dependency-free.
type Store struct {
	mu     sync.RWMutex
	path   string
	events []Event
}

// OpenStore opens an existing store or creates and seeds a new one.
func OpenStore(path string) (*Store, error) {
	if strings.TrimSpace(path) == "" {
		return nil, fmt.Errorf("persistence path is required")
	}

	store := &Store{path: filepath.Clean(path)}
	contents, err := os.ReadFile(store.path)
	if errors.Is(err, os.ErrNotExist) {
		store.events = normalizeEvents(SeedEvents)
		if err := store.persistLocked(); err != nil {
			return nil, err
		}
		return store, nil
	}
	if err != nil {
		return nil, fmt.Errorf("read persistence file: %w", err)
	}

	var state persistedState
	if err := json.Unmarshal(contents, &state); err != nil {
		return nil, fmt.Errorf("decode persistence file: %w", err)
	}
	for _, event := range state.Events {
		if err := event.validate(); err != nil {
			return nil, fmt.Errorf("validate persisted event %q: %w", event.ID, err)
		}
	}
	store.events = normalizeEvents(state.Events)
	return store, nil
}

// Path returns the file used for local persistence.
func (store *Store) Path() string {
	return store.path
}

// List returns events in stable ID order.
func (store *Store) List() []Event {
	store.mu.RLock()
	defer store.mu.RUnlock()

	events := cloneEvents(store.events)
	sortEvents(events)
	return events
}

// Get returns one event by its stable ID.
func (store *Store) Get(id string) (Event, error) {
	store.mu.RLock()
	defer store.mu.RUnlock()

	for _, event := range store.events {
		if event.ID == id {
			return cloneEvent(event), nil
		}
	}
	return Event{}, ErrEventNotFound
}

// Add appends a webhook, assigns a stable local ID, and persists it.
func (store *Store) Add(request IncomingWebhook) (Event, error) {
	if err := request.validate(); err != nil {
		return Event{}, err
	}

	store.mu.Lock()
	defer store.mu.Unlock()

	event := Event{
		ID:         nextEventID(store.events),
		EventType:  strings.TrimSpace(request.EventType),
		Source:     strings.TrimSpace(request.Source),
		Payload:    normalizeRawJSON(request.Payload),
		ReceivedAt: time.Now().UTC().Format(time.RFC3339),
	}
	store.events = append(store.events, event)
	if err := store.persistLocked(); err != nil {
		store.events = store.events[:len(store.events)-1]
		return Event{}, err
	}
	return cloneEvent(event), nil
}

func (store *Store) persistLocked() error {
	if err := os.MkdirAll(filepath.Dir(store.path), 0o755); err != nil {
		return fmt.Errorf("create persistence directory: %w", err)
	}

	contents, err := json.Marshal(persistedState{Events: store.events})
	if err != nil {
		return fmt.Errorf("encode persistence file: %w", err)
	}
	contents = append(contents, '\n')
	if err := os.WriteFile(store.path, contents, 0o644); err != nil {
		return fmt.Errorf("write persistence file: %w", err)
	}
	return nil
}

func nextEventID(events []Event) string {
	maxID := 0
	for _, event := range events {
		value, err := strconv.Atoi(strings.TrimPrefix(event.ID, "evt-"))
		if err == nil && value > maxID {
			maxID = value
		}
	}
	return fmt.Sprintf("evt-%04d", maxID+1)
}

func sortEvents(events []Event) {
	sort.SliceStable(events, func(left, right int) bool {
		return events[left].ID < events[right].ID
	})
}

func normalizeEvents(events []Event) []Event {
	normalized := cloneEvents(events)
	for index := range normalized {
		normalized[index].Payload = normalizeRawJSON(normalized[index].Payload)
	}
	return normalized
}

func normalizeRawJSON(payload json.RawMessage) json.RawMessage {
	var compacted bytes.Buffer
	if err := json.Compact(&compacted, payload); err != nil {
		return append(json.RawMessage(nil), payload...)
	}
	return append(json.RawMessage(nil), compacted.Bytes()...)
}
