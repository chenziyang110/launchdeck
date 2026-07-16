import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const EVENT_SCHEMA_VERSION = 1;
const DEFAULT_EVENT_LIMIT = 200;
const MAX_EVENT_LIMIT = 1_000;
const SECRET_KEY_PATTERN = /(?:^|[_-])(?:token|secret|password|passwd|pwd|credential|credentials|api[_-]?key|access[_-]?key|private[_-]?key|auth)(?:$|[_-])/i;
const CAMEL_SECRET_KEY_PATTERN = /(?:token|secret|password|passwd|credential|apiKey|accessKey|privateKey|auth)/i;
const SECRET_VALUE_PATTERN = /(?:bearer\s+[a-z0-9._~+/=-]{12,}|[a-z0-9_-]*(?:token|secret|password)[a-z0-9_-]*)/i;
const REDACTED = '[REDACTED]';

export async function appendEvent(input) {
  const homeDir = requireHomeDir(input?.homeDir);
  const event = buildEventRecord(input);
  const eventPath = eventsPath(homeDir);

  fs.mkdirSync(path.dirname(eventPath), { recursive: true });
  fs.appendFileSync(eventPath, `${JSON.stringify(event)}\n`, { encoding: 'utf8', flag: 'a' });

  return event;
}

export async function readEvents(options = {}) {
  const homeDir = requireHomeDir(options.homeDir);
  const eventPath = eventsPath(homeDir);
  const warnings = [];
  const errors = [];

  if (!fs.existsSync(eventPath)) {
    return { events: [], warnings, errors };
  }

  let content;
  try {
    content = fs.readFileSync(eventPath, 'utf8');
  } catch (error) {
    return {
      events: [],
      warnings,
      errors: [{
        code: 'event_store_read_failed',
        message: `Failed to read event store: ${eventPath}`,
        path: eventPath,
        causeCode: error?.code,
        causeMessage: error?.message
      }]
    };
  }

  const events = [];
  const lines = content.split(/\r?\n/);
  for (const [index, line] of lines.entries()) {
    if (!line.trim()) {
      continue;
    }

    try {
      events.push(JSON.parse(line));
    } catch (error) {
      warnings.push({
        line: index + 1,
        code: 'event_line_invalid_json',
        message: `Skipping malformed event JSON on line ${index + 1}.`,
        causeMessage: error?.message
      });
    }
  }

  return {
    events: boundEvents(events, options),
    warnings,
    errors
  };
}

export function eventsPath(homeDir) {
  return path.join(requireHomeDir(homeDir), 'events', 'events.jsonl');
}

export function redactLogLine(line) {
  return redactString(String(line ?? ''));
}

function buildEventRecord(input = {}) {
  return omitUndefined({
    schemaVersion: EVENT_SCHEMA_VERSION,
    eventId: input.eventId ?? makeId('evt'),
    transactionId: input.transactionId ?? makeId('tx'),
    timestamp: input.timestamp ?? new Date().toISOString(),
    level: input.level ?? 'info',
    type: input.type,
    projectId: input.projectId,
    alias: input.alias,
    task: input.task,
    runId: input.runId,
    status: input.status,
    code: input.code,
    message: input.message,
    data: input.data === undefined ? undefined : redactValue(input.data),
    next: Array.isArray(input.next) ? redactValue(input.next) : []
  });
}

function boundEvents(events, options) {
  const limit = normalizeLimit(options.limit);
  if (options.order === 'newest-first') {
    return [...events].reverse().slice(0, limit);
  }
  return events.slice(Math.max(0, events.length - limit));
}

function normalizeLimit(limit) {
  if (limit === undefined) {
    return DEFAULT_EVENT_LIMIT;
  }
  const numericLimit = Number(limit);
  if (!Number.isFinite(numericLimit) || numericLimit <= 0) {
    return DEFAULT_EVENT_LIMIT;
  }
  return Math.min(Math.trunc(numericLimit), MAX_EVENT_LIMIT);
}

function redactValue(value, key = '') {
  if (shouldRedactKey(key)) {
    return REDACTED;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => redactValue(entry));
  }

  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([entryKey, entryValue]) => [
        entryKey,
        redactValue(entryValue, entryKey)
      ])
    );
  }

  if (typeof value === 'string' && shouldRedactValue(value)) {
    return REDACTED;
  }

  return value;
}

function shouldRedactKey(key) {
  if (!key) {
    return false;
  }
  return SECRET_KEY_PATTERN.test(key) || CAMEL_SECRET_KEY_PATTERN.test(key);
}

function shouldRedactValue(value) {
  return SECRET_VALUE_PATTERN.test(value);
}

function redactString(value) {
  let redacted = value.replace(
    /([A-Za-z_][A-Za-z0-9_-]*(?:TOKEN|SECRET|PASSWORD|PASSWD|PWD|CREDENTIAL|API[_-]?KEY|ACCESS[_-]?KEY|PRIVATE[_-]?KEY|AUTH)[A-Za-z0-9_-]*\s*=\s*)([^\s]+)/gi,
    `$1${REDACTED}`
  );
  redacted = redacted.replace(/(bearer\s+)[a-z0-9._~+/=-]{12,}/gi, `$1${REDACTED}`);
  return redacted;
}

function makeId(prefix) {
  return `${prefix}_${crypto.randomBytes(16).toString('base64url')}`;
}

function requireHomeDir(homeDir) {
  if (typeof homeDir !== 'string' || !homeDir.trim()) {
    throw new TypeError('homeDir is required.');
  }
  return path.resolve(homeDir);
}

function omitUndefined(record) {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => value !== undefined)
  );
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
