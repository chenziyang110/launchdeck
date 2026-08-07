# UI Brief

## Source Design System

- Root design system: `DESIGN.md@sha256:2c0d7b74b07d861e123a8c5619b0165907d1b32151b384b4aa2e87a7ea54f2aa`.
- Design readiness: approved existing system.
- UI work type: feature-extension.
- Relevant rules: task-focused hierarchy, stable controls, readable terminal states, narrow widths, visible keyboard/focus, no color-only meaning, explicit empty/error/disabled states.
- Token and component constraints: reuse current human output, `@clack/prompts`, Launchdeck tone colors and no-color suppression; no new design dependency without evidence.

## Experience Core

- UI work type: feature-extension.
- Surface type: CLI/TUI catalog and copy receipt.
- Platforms: Windows and Linux terminal; TTY, non-TTY, JSON, compact and no-color.
- Subject: ten standalone sample projects.
- Audience: developers choosing a realistic project to test with Launchdeck.
- Single user job: identify one sample and copy it safely to a known local destination.

## Approved Direction

- Visual thesis: restrained and scan-friendly, continuous with existing Launchdeck terminal output.
- Content thesis: ID, stack and theme first; requirements, ports and path second; next action last.
- Interaction thesis: explicit IDs for automation, keyboard-first search only in TTY, explicit destination validation and receipt after atomic success.
- Signature element: searchable stack/theme selector followed by a destination preview and outcome receipt.
- Approved visual reference: none; live project CLI patterns are the design source.
- Safe system choices: existing table/wrapping, tone labels, prompt helpers, envelope renderers.
- Deliberate risk: a compact selector adds state complexity; gain is fast human discovery, cost is complete no-match/cancel/no-TTY testing.

## Reference Inputs

- UI reference notes: none.
- Visual target: none.
- Original visual assets: none.
- Reference intents: `DESIGN.md -> preserve-structure`; current Agent lifecycle prompt/output -> inspiration and reuse-pattern.
- Ownership: project-owned.

## Fidelity Contract

- Mode: none.
- Must match: current command/output grammar, TTY activation, JSON cleanliness, typed cancellation, no-color and narrow-width behavior.
- May adapt: table columns, wrapping and exact receipt copy for sample metadata.
- Must not copy: no third-party visual or source reference exists.
- Human review condition: no mandatory approval; representative capture review is required before acceptance.

## Screen Structure

- User job and experience intent: move from catalog awareness to one safely copied source tree.
- Recognizable signature: concise inventory plus explicit destination receipt.
- Real entry points: `launchdeck example list`; `launchdeck example copy [<id>] [<destination>]`.
- Layout: command header/context, primary catalog or selector, destination/requirements support, final status and next action.
- Regions: search input, option list, selection summary, destination line, result receipt.
- Navigation: arrow keys or documented prompt keys, type-to-filter, Enter to select, Escape/Ctrl+C to cancel.
- Primary surface: terminal stdout/stderr; JSON mode has no chrome.

## Information Hierarchy

- First priority: sample ID, stack, theme and current selected/focused state.
- Second priority: destination, requirements and ports.
- Supporting details: packaged source path and next command.
- De-emphasized details: internal catalog implementation, package path mechanics and verification metadata.
- Never display ranks, scores, recommendations presented as evaluation, or hidden answers.

## Real Content And Imagery

- Real content source: the canonical ten-entry gallery catalog; use actual IDs/stacks/themes in list, selector, empty recovery and receipts.
- Imagery: none; this is a text terminal surface.
- Missing metadata is a catalog validation failure, not a placeholder or silently blank field.

## Components And States

- Components: catalog table/list, searchable single-select, destination preview, confirmation boundary when needed, spinner/status line, success/error receipt.
- Loading: only for local copy work; no network language. JSON mode emits no spinner.
- Empty: catalog empty is an internal/package integrity failure; search no-match is an editable state with cancel.
- Error: usage, unknown ID, no TTY ID, target conflict, parent/type/permission, copy and rename failures are distinct typed states.
- Selected: text marker and full selected ID/stack/theme, not color alone.
- Disabled: unavailable options state why; normal catalog should have none.
- Permission-limited: report exact destination/parent and actionable retry guidance.
- Success/failure: success only after rename; failure/cancel confirms no publication and cleanup.

## Interactions

- Primary flow: list -> choose/enter ID -> resolve destination -> validate -> stage -> atomic publish -> receipt.
- Secondary flow: direct `copy <id> <destination> --json` with no prompt.
- Keyboard/focus: focus begins in search for omitted-ID TTY; query is retained on no-match; Enter selects; Escape/Ctrl+C cancels; explicit-ID path has no focus UI.
- Feedback timing: validate ID and destination synchronously; show local copy progress only for human TTY; write final outcome after cleanup/publication is known.
- Cancellation before mutation exits directly; cancellation during supported prompt state leaves no filesystem object.

## Responsive Behavior

- Primary viewport: at roughly 120 columns, show ID, stack, theme, requirements and ports in aligned columns.
- Narrow viewport: at roughly 60 columns, keep ID/stack/theme scannable and wrap requirements/ports beneath without horizontal scrolling.
- Overflow: truncate only decorative or secondary prose with a visible convention; never truncate the selected ID, destination, error code or next action.
- Non-TTY/no-color: plain text labels and stable line order; no ANSI dependency.

## Accessibility And Keyboard Requirements

- Semantic structure: predictable heading/status/order and text labels for focus, selected, success, cancelled and error.
- Focus visibility: a non-color marker plus selected text.
- Keyboard operation: all selector actions available without mouse; cancellation is documented and typed.
- Contrast intent: existing DESIGN.md tone palette only when supported; meaning remains complete with color disabled.
- Screen-reader/log use: JSON and plain no-color output contain equivalent semantic fields without spinner control sequences.

## Must Preserve

- Layout structure: concise catalog/selector followed by explicit outcome, not a decorative landing experience.
- Information hierarchy: ID/stack/theme before supporting requirements and ports.
- Component density: enough entries visible to compare ten options without ten separate cards.
- Visible data volume: list exposes all ten; selector exposes filtered results and no-match state.
- Primary interactions: explicit ID automation, TTY-only search, typed cancel and safe destination publication.

## May Adapt

- Exact symbols or icons may use existing project-supported glyph fallbacks.
- Minor spacing and column widths may respond to terminal width.
- Human copy may be refined while preserving IDs, state, destination and next action.
- Prompt helper composition and internal markup may change; observable activation and outcomes may not.

## Must Not

- Do not reinterpret the catalog as cards, a wizard, benchmark leaderboard or recommendation engine.
- Do not add decorative gradients, branding art, network download language or unrelated onboarding.
- Do not rely on color alone or hide empty, error, disabled or cancelled states.
- Do not prompt under JSON or non-TTY conditions.
- Do not install, run, configure, initialize Git, contact the network or evaluate a project.
- Do not print success before atomic rename or obscure cleanup failure.
- Do not copy third-party source code or protected brand expression.

## Required Evidence

- Structure snapshot: human list/copy and JSON envelope field inventory.
- Visual captures: 60-column and 120-column list, selector, no-match, destination conflict, success, cancelled and rollback failure.
- Runtime diagnostics: stdout/stderr separation, ANSI absence in no-color, exactly one JSON object, exit code and filesystem residue.
- Browser mapping: not applicable.
- Key states: all eleven states listed in `spec-contract.json#/design_contract/required_states`.
- Keyboard/focus check: search, move, select, no-match edit and cancel.
- Accessibility check: no-color/text distinction and narrow readability.
- Difference inventory: compare with current Agent lifecycle selector and receipt; document intentional table/content differences.
- Accepted deviations: none without reviewer evidence.
- Visual acceptance matrix: each entry point x 60/120 width x normal/no-color/error, with captured expected result.
- Human review: not required unless agent review finds an unresolved visual or interaction ambiguity.

## Worker Contract

- Required references: `spec-contract.json#/design_contract`, this brief, `DESIGN.md`, current lifecycle prompter/output and targeted visual tests.
- Required packet fields: entry point, TTY/JSON/color/width state, sample ID, destination state, expected typed outcome, AC and CA refs.
- Required evidence kinds: `structure_snapshot`, `visual_capture`, `runtime_diagnostics`, `visual_comparison_or_human_review`.
- Visual convergence loop: run real entry point -> capture representative width/state -> compare with DESIGN.md and this brief -> fix -> recapture.
- Done condition: behavior checks, filesystem checks and visual/interaction acceptance all pass.
- Stop and reopen: any proposal to prompt automation, add side effects, hide a required state, claim macOS/evaluation, or abandon current CLI grammar.
