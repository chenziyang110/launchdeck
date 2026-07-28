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
const flaskAuthor = fs.readFileSync(
  new URL('../fixtures/agent-first-flask/installed-agent-author.js', import.meta.url),
  'utf8'
);

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

test('intent routing distinguishes author-only, launch-only, and explicit configure-validate-launch requests', () => {
  assert.match(intent, /explicit configure.*validate.*launch|configure.*validate.*launch.*explicit/is);
  assert.match(intent, /current request/i);
  assert.match(intent, /generic (?:confirmation|yes)/i);
  assert.match(intent, /authoring-only|configuration authoring alone/i);
  assert.match(intent, /launch-only|lifecycle-only/i);
  assert.match(intent, /missing config/i);
  assert.match(intent, /combined intent/i);
});

test('combined intent is recoverable only across proven safe phase boundaries', () => {
  for (const phrase of [
    're-run `capabilities.get`',
    'exactly one low-risk lifecycle mutation',
    'bounded status',
    'readiness',
    'partial completion',
    'do not roll back',
    'effect certainty'
  ]) {
    assert.equal(adoption.toLowerCase().includes(phrase.toLowerCase())
      || intent.toLowerCase().includes(phrase.toLowerCase()), true, phrase);
  }
  assert.match(adoption, /validation fails?[\s\S]*?stop/i);
  assert.match(adoption, /medium|unknown/);
  assert.match(adoption, /existing config collision|config collision/i);
  assert.match(adoption, /scope ambiguity|ambiguous scope/i);
});

test('monorepo authoring presents nested config and root cwd as explicit alternatives', () => {
  assert.match(adoption, /independent child config/);
  assert.match(adoption, /`launchdeck init --nested`/);
  assert.match(adoption, /workspace config.*`cwd`/s);
  assert.match(adoption, /must not overwrite the ancestor config/);
});

test('Agent task authoring proposes read-only then uses the workspace edit boundary', () => {
  assert.match(adoption, /`launchdeck config propose --workspace --cwd <child>`/);
  assert.match(adoption, /normal workspace file-editing surface/);
  assert.match(adoption, /exact task patch/);
  assert.match(adoption, /`launchdeck config validate --json --compact`/);
  assert.doesNotMatch(adoption, /launchdeck config patch|--yes|--force/);
});

test('low-risk authoring uses the complete local boundary and keeps Flask generation executable', () => {
  for (const phrase of [
    'fixed project-internal `cwd`',
    'local development server or build tool',
    'remote or production target',
    'sensitive `env`',
    'destructive command or raw shell chain'
  ]) {
    assert.equal(adoption.includes(phrase) || discovery.includes(phrase), true, phrase);
  }
  assert.match(adoption, /Otherwise author `risk: medium`/);
  assert.match(adoption, /must not execute that task/);
  assert.match(discovery, /Flask|Vite/);
  assert.match(flaskAuthor, /start:[\s\S]*?risk: low/);
  assert.match(flaskAuthor, /test:[\s\S]*?risk: low/);
});

function readSkill(relativePath) {
  return fs.readFileSync(new URL(`../../.agents/skills/launchdeck-agent/${relativePath}`, import.meta.url), 'utf8');
}
