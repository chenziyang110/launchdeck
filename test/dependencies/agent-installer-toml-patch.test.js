import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  TomlDocument,
  TomlFormat,
  parse,
  patch
} from '@decimalturn/toml-patch';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, '..', '..');
const dependencyPackage = JSON.parse(
  fs.readFileSync(
    path.join(repoRoot, 'node_modules', '@decimalturn', 'toml-patch', 'package.json'),
    'utf8'
  )
);

test('TOML patch dependency is exact, MIT licensed, dependency-free, and hook-free', () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));

  assert.equal(packageJson.dependencies['@decimalturn/toml-patch'], '2.1.0');
  assert.equal(dependencyPackage.name, '@decimalturn/toml-patch');
  assert.equal(dependencyPackage.version, '2.1.0');
  assert.equal(dependencyPackage.license, 'MIT');
  assert.deepEqual(dependencyPackage.dependencies ?? {}, {});
  assert.equal(dependencyPackage.scripts?.preinstall, undefined);
  assert.equal(dependencyPackage.scripts?.install, undefined);
  assert.equal(dependencyPackage.scripts?.postinstall, undefined);
});

test('narrow Codex entry patch preserves comments, line endings, and unrelated tables', () => {
  const source = [
    '# user-owned heading',
    'model = "gpt-5"',
    '',
    '[mcp_servers.keep]',
    '# keep this comment and spacing',
    'command  =  "keep-server"',
    'args = ["--safe"]',
    ''
  ].join('\r\n');
  const updated = parse(source);
  updated.mcp_servers.launchdeck = {
    command: 'C:\\Launchdeck\\agent-launcher.cmd',
    args: ['mcp', 'serve'],
    env: {
      LAUNCHDECK_BUILD_ID: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
    }
  };

  const format = TomlFormat.autoDetectFormat(source);
  format.inlineTableStart = Math.max(format.inlineTableStart ?? 1, 2);
  const rendered = patch(source, updated, format);
  const roundTrip = parse(rendered);

  assert.match(rendered, /^# user-owned heading\r\n/);
  assert.match(rendered, /# keep this comment and spacing\r\ncommand  =  "keep-server"/);
  assert.equal(rendered.replaceAll('\r\n', '').includes('\n'), false);
  assert.deepEqual({ ...roundTrip.mcp_servers.keep }, {
    command: 'keep-server',
    args: ['--safe']
  });
  assert.deepEqual(
    JSON.parse(JSON.stringify(roundTrip.mcp_servers.launchdeck)),
    updated.mcp_servers.launchdeck
  );
});

test('owned-entry removal preserves adjacent user content and remains parseable', () => {
  const source = [
    '# root comment',
    '[mcp_servers.keep]',
    'command = "keep-server"',
    '',
    '[mcp_servers.launchdeck]',
    'command = "/opt/launchdeck/agent-launcher"',
    'args = ["mcp", "serve"]',
    '',
    '[notice]',
    'message = "leave me alone"',
    ''
  ].join('\n');
  const updated = parse(source);
  delete updated.mcp_servers.launchdeck;

  const rendered = patch(source, updated);

  assert.equal(rendered.includes('[mcp_servers.launchdeck]'), false);
  assert.match(rendered, /^# root comment/m);
  assert.match(rendered, /\[mcp_servers\.keep\]\ncommand = "keep-server"/);
  assert.match(rendered, /\[notice\]\nmessage = "leave me alone"/);
  assert.equal(parse(rendered).notice.message, 'leave me alone');
});

test('TomlDocument rejects malformed source instead of producing a replacement file', () => {
  assert.throws(
    () => new TomlDocument('[mcp_servers.launchdeck\ncommand = "broken"'),
    /toml|expected|unexpected|unterminated|invalid/i
  );
});
