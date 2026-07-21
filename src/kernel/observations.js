import crypto from 'node:crypto';
import { LaunchdeckError } from '../errors.js';
import { canonicalDigest, canonicalJson } from './compatibility.js';

const CURSOR_VERSION = 1;
const DEFAULT_CURSOR_TTL_MS = 5 * 60 * 1000;
const SECRET_KEY_PATTERN = /(?:token|secret|password|passwd|pwd|credential|api[_-]?key|access[_-]?key|private[_-]?key|auth)/i;
const SECRET_VALUE_PATTERN = /(?:bearer\s+[a-z0-9._~+/=-]{12,}|[a-z0-9_-]*(?:token|secret|password)[a-z0-9_-]*)/i;
const REDACTED = '[REDACTED]';

export function createObservationService(options = {}) {
  const clock = options.clock ?? (() => new Date());
  const cursorTtlMs = normalizePositiveInteger(options.cursorTtlMs ?? DEFAULT_CURSOR_TTL_MS, 'cursorTtlMs');
  const cursorSecret = normalizeSecret(options.cursorSecret);

  return Object.freeze({
    page(input = {}) {
      const limit = normalizeLimit(input.limit, 200);
      const items = Array.isArray(input.items) ? input.items : [];
      const state = pageState(input, limit, items.length);
      const pageItems = items.slice(state.nextOffset, state.snapshotHighWater).slice(0, limit);
      const nextOffset = state.nextOffset + pageItems.length;
      return {
        items: redactValue(pageItems),
        nextCursor: nextOffset < state.snapshotHighWater
          ? encodeCursor({ ...state, nextOffset })
          : null
      };
    },
    pageLogLines(input = {}) {
      const limit = normalizeLimit(input.limit, 200);
      const maxBytes = normalizeMaxBytes(input.maxBytes);
      const lines = (Array.isArray(input.lines) ? input.lines : []).map((line) => redactLogLine(line));
      const state = pageState({ ...input, kind: 'task-logs' }, limit, lines.length, { maxBytes });
      const selected = [];
      let bytes = 0;
      let offset = state.nextOffset;
      while (offset < state.snapshotHighWater && selected.length < limit) {
        const line = lines[offset];
        const separatorBytes = selected.length === 0 ? 0 : 1;
        const lineBytes = Buffer.byteLength(line, 'utf8');
        if (bytes + separatorBytes + lineBytes > maxBytes) break;
        selected.push(line);
        bytes += separatorBytes + lineBytes;
        offset += 1;
      }
      if (selected.length === 0 && offset < state.snapshotHighWater) {
        const truncated = truncateUtf8(lines[offset], maxBytes);
        selected.push(truncated);
        offset += 1;
      }
      return {
        lines: selected,
        bytes: Buffer.byteLength(selected.join('\n'), 'utf8'),
        nextCursor: offset < state.snapshotHighWater
          ? encodeCursor({ ...state, nextOffset: offset })
          : null
      };
    },
    pageJsonLines(input = {}) {
      const warnings = [];
      const items = [];
      for (const [index, line] of String(input.content ?? '').split(/\r?\n/).entries()) {
        if (!line.trim()) continue;
        try {
          items.push(JSON.parse(line));
        } catch (error) {
          warnings.push({
            line: index + 1,
            code: 'observation_line_invalid_json',
            message: `Skipping malformed observation JSON on line ${index + 1}.`,
            causeMessage: String(error?.message ?? error).slice(0, 512)
          });
        }
      }
      return {
        ...this.page({ ...input, items }),
        warnings
      };
    }
  });

  function pageState(input, limit, itemCount, extraQuery = {}) {
    const kind = requireToken(input.kind, 'kind');
    const resourceId = requireToken(input.resourceId, 'resourceId');
    const queryDigest = canonicalDigest({ query: input.query ?? {}, limit, ...extraQuery });
    if (!input.cursor) {
      const issuedAt = now(clock);
      return {
        version: CURSOR_VERSION,
        kind,
        resourceDigest: canonicalDigest(resourceId),
        queryDigest,
        nextOffset: 0,
        snapshotHighWater: itemCount,
        issuedAt: issuedAt.toISOString(),
        expiresAt: new Date(issuedAt.getTime() + cursorTtlMs).toISOString()
      };
    }
    const decoded = decodeCursor(input.cursor);
    if (decoded.kind !== kind || decoded.resourceDigest !== canonicalDigest(resourceId)) {
      throw observationError('cursor_scope_mismatch', 'Cursor is bound to a different observation resource.');
    }
    if (decoded.queryDigest !== queryDigest) {
      throw observationError('cursor_query_mismatch', 'Cursor is bound to a different normalized query.');
    }
    if (Date.parse(decoded.expiresAt) < now(clock).getTime()) {
      throw observationError('cursor_expired', 'Observation cursor has expired.');
    }
    return decoded;
  }

  function encodeCursor(payload) {
    const compact = {
      v: payload.version,
      k: payload.kind,
      r: payload.resourceDigest,
      q: payload.queryDigest,
      o: payload.nextOffset,
      h: payload.snapshotHighWater,
      i: payload.issuedAt,
      e: payload.expiresAt
    };
    const encoded = Buffer.from(canonicalJson(compact), 'utf8').toString('base64url');
    const signature = crypto.createHmac('sha256', cursorSecret).update(encoded).digest('base64url');
    return `${encoded}.${signature}`;
  }

  function decodeCursor(token) {
    const normalized = String(token ?? '');
    const [encoded, signature, extra] = normalized.split('.');
    if (!encoded || !signature || extra !== undefined) throw observationError('cursor_invalid', 'Observation cursor is invalid.');
    const expected = crypto.createHmac('sha256', cursorSecret).update(encoded).digest();
    let actual;
    try {
      actual = Buffer.from(signature, 'base64url');
    } catch {
      throw observationError('cursor_invalid', 'Observation cursor is invalid.');
    }
    if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) {
      throw observationError('cursor_invalid', 'Observation cursor integrity check failed.');
    }
    let decoded;
    try {
      const compact = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
      decoded = {
        version: compact.v,
        kind: compact.k,
        resourceDigest: compact.r,
        queryDigest: compact.q,
        nextOffset: compact.o,
        snapshotHighWater: compact.h,
        issuedAt: compact.i,
        expiresAt: compact.e
      };
    } catch {
      throw observationError('cursor_invalid', 'Observation cursor payload is invalid.');
    }
    if (decoded?.version !== CURSOR_VERSION
      || !Number.isInteger(decoded.nextOffset)
      || decoded.nextOffset < 0
      || !Number.isInteger(decoded.snapshotHighWater)
      || decoded.snapshotHighWater < decoded.nextOffset
      || !Number.isFinite(Date.parse(decoded.issuedAt))
      || !Number.isFinite(Date.parse(decoded.expiresAt))) {
      throw observationError('cursor_invalid', 'Observation cursor payload is invalid.');
    }
    return decoded;
  }
}

export function redactObservation(value) {
  return redactValue(value);
}

function redactValue(value, key = '') {
  if (key && SECRET_KEY_PATTERN.test(key)) return REDACTED;
  if (Array.isArray(value)) return value.map((entry) => redactValue(entry));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([entryKey, entryValue]) => [
      entryKey,
      redactValue(entryValue, entryKey)
    ]));
  }
  if (typeof value === 'string' && SECRET_VALUE_PATTERN.test(value)) return REDACTED;
  return value;
}

function redactLogLine(line) {
  let redacted = String(line ?? '').replace(
    /([A-Za-z_][A-Za-z0-9_-]*(?:TOKEN|SECRET|PASSWORD|PASSWD|PWD|CREDENTIAL|API[_-]?KEY|ACCESS[_-]?KEY|PRIVATE[_-]?KEY|AUTH)[A-Za-z0-9_-]*\s*=\s*)([^\r\n]+)/gi,
    `$1${REDACTED}`
  );
  redacted = redacted.replace(/(bearer\s+)[a-z0-9._~+/=-]{12,}/gi, `$1${REDACTED}`);
  return redacted;
}

function truncateUtf8(value, maxBytes) {
  const buffer = Buffer.from(String(value), 'utf8');
  if (buffer.length <= maxBytes) return String(value);
  return buffer.subarray(0, maxBytes).toString('utf8').replace(/\uFFFD$/u, '');
}

function normalizeLimit(value, maximum) {
  const limit = value ?? maximum;
  if (!Number.isInteger(limit) || limit < 1 || limit > maximum) {
    throw observationError('observation_limit_invalid', `Observation limit must be between 1 and ${maximum}.`);
  }
  return limit;
}

function normalizeMaxBytes(value) {
  const maxBytes = value ?? 32_768;
  if (!Number.isInteger(maxBytes) || maxBytes < 1 || maxBytes > 65_536) {
    throw observationError('observation_limit_invalid', 'Log maxBytes must be between 1 and 65536.');
  }
  return maxBytes;
}

function normalizePositiveInteger(value, label) {
  if (!Number.isInteger(value) || value <= 0) throw new TypeError(`${label} must be a positive integer.`);
  return value;
}

function normalizeSecret(value) {
  const secret = value ?? crypto.randomBytes(32);
  const buffer = Buffer.isBuffer(secret) ? secret : Buffer.from(String(secret), 'utf8');
  if (buffer.length < 16) throw new TypeError('cursorSecret must contain at least 16 bytes.');
  return buffer;
}

function requireToken(value, label) {
  const token = String(value ?? '').trim();
  if (!token || token.length > 512) throw observationError('observation_scope_invalid', `${label} is invalid.`);
  return token;
}

function now(clock) {
  const value = clock();
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new TypeError('Observation clock returned an invalid date.');
  return date;
}

function observationError(code, message) {
  return new LaunchdeckError(code, message);
}
