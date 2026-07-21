const MAX_DIAGNOSTIC_BYTES = 2_048;
const SAFE_CODE = /^[a-z][a-z0-9_]*(?:\.[a-z0-9_]+)*$/;

export function createDiagnosticWriter(options = {}) {
  const stream = options.stream ?? process.stderr;
  const maxBytes = normalizeLimit(options.maxBytes);
  return Object.freeze({
    report(code, error) {
      const record = {
        source: 'launchdeck-mcp',
        code: SAFE_CODE.test(String(code)) ? String(code) : 'mcp_diagnostic',
        errorCode: boundedCode(error?.code),
        errorName: boundedName(error?.name)
      };
      const line = `${JSON.stringify(record)}\n`;
      stream.write(Buffer.byteLength(line) <= maxBytes
        ? line
        : `${JSON.stringify({ source: 'launchdeck-mcp', code: 'diagnostic_truncated' })}\n`);
    }
  });
}

function boundedCode(value) {
  const code = String(value ?? 'internal_error').slice(0, 128);
  return SAFE_CODE.test(code) ? code : 'internal_error';
}

function boundedName(value) {
  const name = String(value ?? 'Error').replace(/[^A-Za-z0-9_.-]/g, '').slice(0, 80);
  return name || 'Error';
}

function normalizeLimit(value) {
  return Number.isInteger(value) && value >= 256 && value <= 16_384
    ? value
    : MAX_DIAGNOSTIC_BYTES;
}
