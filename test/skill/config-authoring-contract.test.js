import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const skill = readSkill('SKILL.md');
const adoption = readSkill('references/adoption-flow.md');
const discovery = readSkill('references/discovery-rules.md');
const intent = readSkill('references/intent-routing.md');
const readme = fs.readFileSync(new URL('../../README.md', import.meta.url), 'utf8');
const policy = fs.readFileSync(new URL('../../src/kernel/policy.js', import.meta.url), 'utf8');
const cli = fs.readFileSync(new URL('../../src/cli.js', import.meta.url), 'utf8');
const toolProjection = fs.readFileSync(new URL('../../src/mcp/tool-projection.js', import.meta.url), 'utf8');

test('Skill routing reflects the live registered-project adoption contract', () => {
  assert.match(policy, /requiresProject\(definition\) && projectScope !== 'resolved'/);
  assert.match(toolProjection, /'adoption\.inspect': 'Inspect a registered project/);
  assert.match(cli, /async function adoptionCommand[\s\S]*?const config = loadConfig\(process\.cwd\(\)\)/);
  assert.match(adoption, /requires a registered, resolved project scope/);
  assert.match(adoption, /Do not use CLI fallback for adoption inspection/);
});

test('canonical Skill routes explicit config authoring separately from read-only adoption inspection', () => {
  assert.match(skill, /create or generate a project-adapted `\.launchdeck\.yml`/);
  assert.match(intent, /Explicit configuration authoring/);
  assert.match(intent, /Inspection-only adoption wording never authorizes a write/);
  assert.match(adoption, /## Explicit Configuration Authoring/);
  assert.match(adoption, /Authoring requires explicit user intent/);
  assert.match(adoption, /`adoption\.inspect` remains read-only/);
  assert.match(adoption, /requires a registered, resolved project scope/);
  assert.match(adoption, /unregistered project with no supported config.*bounded workspace read-only surface/s);
});

test('config authoring is bounded, evidence-backed, and conservative', () => {
  assert.match(discovery, /bounded allowlist/);
  assert.match(discovery, /Do not read secret-bearing files/);
  assert.match(discovery, /Only `exact` or `strong` candidates may be authored/);
  assert.match(discovery, /`weak`, `unknown`, and conflicting candidates remain proposal-only/);

  for (const field of [
    '`version`', '`tasks`', '`command`', '`description`', '`cwd`', '`longRunning`',
    '`ports`', '`risk`', '`log`', '`clean.safe`'
  ]) {
    assert.equal(adoption.includes(field), true, field);
  }
  assert.match(adoption, /Never synthesize secrets/);
});

test('config authoring preserves existing config and cannot chain lifecycle operations', () => {
  assert.match(adoption, /Do not overwrite, merge, migrate, or repair it/);
  assert.match(adoption, /`launchdeck doctor --json --compact`/);
  assert.match(adoption, /Never chain registration, start, run, stop, restart, clean, or raw process control/);
  assert.match(readme, /explicitly asks to create a project-adapted `\.launchdeck\.yml`/);
});

function readSkill(relativePath) {
  return fs.readFileSync(new URL(`../../.agents/skills/launchdeck-agent/${relativePath}`, import.meta.url), 'utf8');
}
