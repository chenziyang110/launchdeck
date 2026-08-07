package inbox

import (
	_ "embed"
	"encoding/json"
)

//go:embed seed.json
var seedJSON []byte

// SeedEvents is the deterministic dataset used when a new local store is created.
var SeedEvents = loadSeedEvents()

func loadSeedEvents() []Event {
	var events []Event
	if err := json.Unmarshal(seedJSON, &events); err != nil {
		panic("go-webhook-inbox seed is invalid: " + err.Error())
	}
	return events
}
