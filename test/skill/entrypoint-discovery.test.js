import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const skillRoot = path.join(repoRoot, '.agents', 'skills', 'launchdeck-agent');

test('canonical Skill fixes one deterministic entrypoint order and reuses the handshake winner', () => {
  const skill = read('SKILL.md');
  const discovery = read('references/entrypoint-discovery.md');

  assert.match(skill, /entrypoint-discovery\.md/);
  const ordered = [
    /available Launchdeck MCP/i,
    /globally installed `launchdeck`/i,
    /`node_modules\/\.bin\/launchdeck`/i,
    /Launchdeck source checkout[\s\S]*`src\/cli\.js`/i,
    /not installed/i
  ];
  let cursor = -1;
  for (const pattern of ordered) {
    const match = pattern.exec(discovery.slice(cursor + 1));
    assert.ok(match, `missing ordered discovery rule: ${pattern}`);
    cursor += match.index + match[0].length;
  }
  assert.match(discovery, /reuse (?:that|the same) entrypoint/i);
  assert.match(discovery, /npm install --global github:chenziyang110\/launchdeck#<tag>/i);
});

test('MCP failure permits only read-only CLI discovery before any mutation dispatch', () => {
  const discovery = read('references/entrypoint-discovery.md');
  const adoption = read('references/adoption-flow.md');
  const commands = read('references/command-flows.md');
  const combined = `${discovery}\n${adoption}\n${commands}`;

  for (const command of [
    'launchdeck capabilities --json --compact',
    'launchdeck projects --json --compact'
  ]) {
    assert.ok(combined.includes(command), command);
  }
  assert.match(combined, /config discovery[\s\S]*read-only/i);
  assert.match(combined, /after (?:a )?mutation (?:may have been )?dispatch/i);
  assert.match(combined, /never (?:switch|fall back|retry)[\s\S]*(?:entrypoint|surface)/i);
});

function read(relativePath) {
  return fs.readFileSync(path.join(skillRoot, relativePath), 'utf8');
}
