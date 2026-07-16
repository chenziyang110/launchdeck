# Open Questions: Launchdeck Agent Skill Suite

## Product Questions

- Should the first skill suite support only local filesystem projects, or also monorepos with multiple launchable apps?
- Should `.launchdeck.yml` creation be fully automatic after confidence is high, or should the first version always present a proposed config for user/agent review?
- Which ecosystems must be first-class discovery targets: Node, Python, Go, Rust, Java, Docker Compose, .NET, PHP?
- Which natural-language intents should route into Launchdeck skills by default versus remain ordinary agent behavior?

## Technical Questions

- What confidence model should discovery use before suggesting a command as `dev`, `start`, `build`, `test`, or `clean`?
- What local cache or marker should the skill use to know that first-run discovery has already been completed?
- How should the skill detect ports when project scripts do not declare them clearly?
- What should the skill do when a project already has Makefile/justfile/Taskfile/package scripts that overlap with Launchdeck tasks?
- Should the first version include deterministic scanner scripts, or keep discovery prose-only until repeated failures show where scripts are needed?
- RESOLVED DEFAULT: V0 eval prompts should live inside the `launchdeck-agent` package as `references/eval-prompts.md`; executable fixture structure can be decided later if prose evals expose repeatable failure patterns.
- RESOLVED DEFAULT: The first released suite should ship as one router skill plus bundled references that simulate subskills until trigger behavior is proven.
- How aggressive should the router description be for triggering near-miss intents such as "preview this app" or "open the local site"?
- What exact threshold should make a reference subflow graduate into its own separate skill?

## Safety Questions

- What is the minimum evidence required before the skill may run `launchdeck start` automatically?
- RESOLVED DEFAULT: When a port is occupied but Launchdeck ownership is not verified, the skill should use inspect-only behavior, refuse automatic kill/stop, report owner evidence, and offer safe manual or configuration alternatives.
- RESOLVED DEFAULT: Risky clean/reset should be presented as named targets with impact and should require explicit confirmation; reset remains out of automatic scope and must be treated as a separate destructive request.
