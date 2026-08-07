import { createSuccessEnvelope } from '../output.js';
import { CATALOG_FIELDS, loadCatalog } from './catalog.js';

const DEFAULT_COLUMNS = 120;
const MIN_COLUMNS = 40;

const COLORS = Object.freeze({
  cyan: '\x1B[36m',
  dim: '\x1B[90m',
  reset: '\x1B[0m'
});

/**
 * Return the example catalog in the format used by the example list command.
 *
 * Machine modes return the shared schemaVersion 1 envelope. Human mode
 * returns terminal text; neither mode performs any filesystem mutation.
 */
export function listExamples(source, options = {}) {
  const settings = normalizeArguments(source, options);
  const entries = catalogEntries(settings.catalog ?? loadCatalog({ rootDir: settings.rootDir }));
  const machineMode = settings.json === true
    || settings.compact === true
    || settings.mode === 'json'
    || settings.mode === 'compact';

  if (machineMode) {
    return createExampleListEnvelope(entries);
  }

  return formatExampleList(entries, settings);
}

/**
 * Build the canonical machine-readable list envelope.
 */
export function createExampleListEnvelope(source, options = {}) {
  const settings = normalizeArguments(source, options);
  const entries = catalogEntries(settings.catalog ?? loadCatalog({ rootDir: settings.rootDir }));
  return createSuccessEnvelope('example list', { entries });
}

/**
 * Render catalog entries as a scan-friendly human list.
 */
export function formatExampleList(source, options = {}) {
  const settings = normalizeArguments(source, options);
  const entries = catalogEntries(settings.catalog ?? loadCatalog({ rootDir: settings.rootDir }));
  const width = normalizeColumns(settings.columns ?? settings.terminal?.columns);
  const useColor = settings.color !== false
    && settings.noColor !== true
    && settings.terminal?.noColor !== true
    && (settings.isTTY === true || settings.terminal?.isTTY === true);
  const lines = [];

  lines.push(style('Launchdeck example gallery', 'cyan', useColor));
  lines.push(`${entries.length} standalone examples available.`);
  lines.push('');

  if (entries.length === 0) {
    lines.push('No examples available.');
  } else {
    entries.forEach((entry, index) => {
      const title = `${index + 1}. ${entry.id} — ${entry.title}`;
      lines.push(...wrapLine(style(title, 'cyan', useColor), width));
      lines.push(...wrapField('Stack', entry.stack, width));
      lines.push(...wrapField('Theme', entry.theme, width));
      lines.push(...wrapField('Requirements', entry.requirements.join(', '), width));
      lines.push(...wrapField('Ports', entry.ports.join(', '), width));
      lines.push(...wrapField('Source', entry.sourcePath, width));
      if (index < entries.length - 1) lines.push('');
    });
  }

  lines.push('');
  lines.push(style('Next: launchdeck example copy <id> [destination]', 'dim', useColor));
  return `${lines.join('\n')}\n`;
}

function normalizeArguments(source, options) {
  if (Array.isArray(source)) {
    return { ...options, catalog: source };
  }
  if (source && typeof source === 'object') {
    return { ...source, ...options };
  }
  return options;
}

function catalogEntries(entries) {
  if (!Array.isArray(entries)) {
    throw new TypeError('Example list catalog must be an array.');
  }

  return entries.map((entry) => Object.fromEntries(
    CATALOG_FIELDS.map((field) => [field, cloneCatalogValue(entry?.[field])])
  ));
}

function cloneCatalogValue(value) {
  return Array.isArray(value) ? [...value] : value;
}

function normalizeColumns(columns) {
  if (!Number.isInteger(columns) || columns <= 0) {
    return DEFAULT_COLUMNS;
  }
  return Math.max(MIN_COLUMNS, columns);
}

function wrapField(label, value, width) {
  const prefix = `   ${label}: `;
  const continuation = ' '.repeat(prefix.length);
  return wrapLine(`${prefix}${value}`, width, continuation);
}

function wrapLine(value, width, continuation = '') {
  const text = String(value);
  if (text.length <= width) return [text];

  const words = text.split(/\s+/).filter(Boolean);
  const lines = [];
  let current = '';
  let first = true;

  for (const word of words) {
    const indent = first ? '' : continuation;
    const available = Math.max(1, width - indent.length);
    if (word.length > available && current === '') {
      let remaining = word;
      while (remaining.length > available) {
        lines.push(`${indent}${remaining.slice(0, available)}`);
        remaining = remaining.slice(available);
        first = false;
      }
      current = remaining;
      continue;
    }

    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= available) {
      current = candidate;
      continue;
    }

    lines.push(`${indent}${current}`);
    first = false;
    current = word;
  }

  if (current) {
    lines.push(`${first ? '' : continuation}${current}`);
  }
  return lines;
}

function style(value, tone, enabled) {
  if (!enabled) return value;
  return `${COLORS[tone]}${value}${COLORS.reset}`;
}
