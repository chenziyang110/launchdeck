import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { validateAgentOperationResult } from '../../src/kernel/agent-result.js';

const helperDir = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.resolve(helperDir, '..', '..');
export const sourceMcpEntrypoint = path.join(repoRoot, 'src', 'mcp', 'stdio-server.js');

export async function connectLaunchdeckMcp(options = {}) {
  const stdoutChunks = [];
  const stderrChunks = [];
  const transportErrors = [];
  const transport = new CapturingStdioClientTransport({
    command: options.command ?? process.execPath,
    args: options.args ?? [options.entrypoint ?? sourceMcpEntrypoint],
    cwd: options.cwd ?? repoRoot,
    env: options.env ?? {},
    stderr: 'pipe'
  }, stdoutChunks, stderrChunks);
  const priorOnError = transport.onerror;
  transport.onerror = (error) => {
    transportErrors.push(error);
    priorOnError?.(error);
  };
  const client = new Client(
    { name: options.clientName ?? 'launchdeck-real-wire-tests', version: '1.0.0' },
    { capabilities: {} }
  );
  try {
    await client.connect(transport, { timeout: options.timeout ?? 8_000 });
  } catch (error) {
    await transport.close().catch(() => {});
    const stderr = Buffer.concat(stderrChunks).toString('utf8').trim();
    const processDetails = transport.processDetails();
    if (stderr) error.message = `${error.message}\nMCP stderr: ${stderr}`;
    if (processDetails) error.message = `${error.message}\nMCP process: ${processDetails}`;
    throw error;
  }
  return {
    client,
    transport,
    serverVersion: client.getServerVersion(),
    serverCapabilities: client.getServerCapabilities(),
    listTools: (params = undefined) => client.listTools(params, { timeout: options.timeout ?? 8_000 }),
    callTool: (name, args = {}) => client.callTool(
      { name, arguments: args },
      undefined,
      { timeout: options.callTimeout ?? 15_000 }
    ),
    stdoutText: () => Buffer.concat(stdoutChunks).toString('utf8'),
    stderrText: () => Buffer.concat(stderrChunks).toString('utf8'),
    stdoutFrames: () => parseJsonLines(Buffer.concat(stdoutChunks).toString('utf8')),
    processDetails: () => transport.processDetails(),
    transportErrors,
    close: () => client.close()
  };
}

export function requireAgentResult(toolResult, expected = {}) {
  assertToolResultShape(toolResult);
  const validation = validateAgentOperationResult(toolResult.structuredContent);
  if (!validation.ok) {
    throw new Error(`Invalid AgentOperationResult: ${JSON.stringify(validation.errors)}`);
  }
  const result = validation.value;
  if (expected.operation && result.operation.name !== expected.operation) {
    throw new Error(`Expected ${expected.operation}, got ${result.operation.name}`);
  }
  if (expected.outcome && result.outcome.kind !== expected.outcome) {
    throw new Error(`Expected outcome ${expected.outcome}, got ${result.outcome.kind}`);
  }
  return result;
}

export function assertToolResultShape(toolResult) {
  if (!toolResult || typeof toolResult !== 'object') throw new Error('MCP tool result must be an object.');
  if (!Array.isArray(toolResult.content)) throw new Error('MCP tool result must contain content.');
  if (!toolResult.structuredContent || typeof toolResult.structuredContent !== 'object') {
    throw new Error('MCP tool result must contain structuredContent.');
  }
  const text = toolResult.content.filter((entry) => entry.type === 'text').map((entry) => entry.text).join('\n');
  if (text.length > 2048) throw new Error('MCP text summary must remain concise.');
}

class CapturingStdioClientTransport extends StdioClientTransport {
  constructor(server, stdoutChunks, stderrChunks) {
    super(server);
    this.stdoutChunks = stdoutChunks;
    this.stderrChunks = stderrChunks;
    this.childExit = null;
  }

  async start() {
    await super.start();
    this._process?.stdout?.on('data', (chunk) => this.stdoutChunks.push(Buffer.from(chunk)));
    this._process?.stderr?.on('data', (chunk) => this.stderrChunks.push(Buffer.from(chunk)));
    this._process?.once('exit', (code, signal) => {
      this.childExit = `exitCode=${code ?? 'null'}, signal=${signal ?? 'none'}`;
    });
    this._process?.once('error', (error) => {
      this.childExit = `spawnError=${error?.code ?? error?.name ?? 'unknown'}`;
    });
  }

  processDetails() {
    return this.childExit;
  }
}

function parseJsonLines(value) {
  const lines = value.split(/\r?\n/).filter((line) => line.length > 0);
  return lines.map((line, index) => {
    try {
      return JSON.parse(line);
    } catch (error) {
      throw new Error(`Non-protocol stdout line ${index + 1}: ${line}`, { cause: error });
    }
  });
}
