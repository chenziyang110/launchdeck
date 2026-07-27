import os from 'node:os';
import path from 'node:path';
import { parse } from '@decimalturn/toml-patch';

export function readCodexProjectTrust(input = {}) {
  const fs = input.fs;
  const projectRoot = input.projectRoot;
  if (!fs || typeof fs.existsSync !== 'function' || typeof fs.readFileSync !== 'function') return false;
  if (typeof projectRoot !== 'string' || !path.isAbsolute(projectRoot)) return false;

  const env = input.env ?? process.env;
  const codexHome = typeof env.CODEX_HOME === 'string' && env.CODEX_HOME.trim() !== ''
    ? path.resolve(env.CODEX_HOME)
    : path.join(input.homeDir ?? os.homedir(), '.codex');
  const configPath = path.join(codexHome, 'config.toml');
  if (!fs.existsSync(configPath)) return false;

  try {
    const document = parse(fs.readFileSync(configPath, 'utf8'));
    const projects = document?.projects;
    if (!projects || typeof projects !== 'object' || Array.isArray(projects)) return false;
    const expected = normalizeProjectPath(projectRoot, input.platform ?? process.platform);
    return Object.entries(projects).some(([candidate, record]) => (
      normalizeProjectPath(candidate, input.platform ?? process.platform) === expected
      && record?.trust_level === 'trusted'
    ));
  } catch {
    return false;
  }
}

function normalizeProjectPath(value, platform) {
  const normalized = path.normalize(path.resolve(String(value)));
  return platform === 'win32' ? normalized.toLowerCase() : normalized;
}
