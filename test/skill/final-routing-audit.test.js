import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { validateEvidenceCell } from '../../scripts/run-agent-evidence.js';
import { createReadinessCell } from '../host/helpers/readiness-fixture.js';

const repoRoot = path.resolve(import.meta.dirname, '..', '..');
const forbidden = readJson('test/skill/fixtures/forbidden-calls.json');
const publicSkillFiles = [
  '.agents/skills/launchdeck-agent/SKILL.md',
  ...fs.readdirSync(path.join(repoRoot, '.agents/skills/launchdeck-agent/references'))
    .filter((name) => name.endsWith('.md'))
    .map((name) => `.agents/skills/launchdeck-agent/references/${name}`)
];

test('canonical Skill and next-action wording preserve the operation gate', () => {
  const text = publicSkillFiles.map((file) => fs.readFileSync(path.join(repoRoot, file), 'utf8')).join('\n');
  for (const operation of forbidden.forbiddenOperations) assert.equal(text.includes(operation), false, operation);
  for (const pattern of forbidden.forbiddenExecutablePatterns) {
    assert.equal(executableCodeSpans(text).some((command) => command.includes(pattern)), false, pattern);
  }
  assert.match(text, /Treat risk, ownership, scope, compatibility, lock, digest, config, and input refusals as final\./);
});

test('evidence cells reject broad host labels instead of laundering them through a final audit', () => {
  for (const key of ['ready', 'readiness', 'rollup', 'overallReady', 'overallStatus']) {
    const validation = validateEvidenceCell({ ...createReadinessCell(), [key]: true });
    assert.equal(validation.ok, false, key);
    assert.equal(validation.errors.some((error) => error.code === 'additional_property'), true, key);
  }
});

function executableCodeSpans(content) {
  return [...content.matchAll(/`([^`\r\n]+)`/g)].map((match) => match[1]);
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, relativePath), 'utf8'));
}
