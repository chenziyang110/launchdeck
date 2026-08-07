import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { addTicket, ensureStore, resolveDataFile } from './store.mjs';

const publicFile = fileURLToPath(new URL('../public/index.html', import.meta.url));
const serviceName = 'docker-compose-helpdesk';

function sendJson(response, status, payload) {
  response.writeHead(status, {
    'cache-control': 'no-store',
    'content-type': 'application/json; charset=utf-8',
  });
  response.end(JSON.stringify(payload));
}

function sendHtml(response, html) {
  response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  response.end(html);
}

function parsePort(value) {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid PORT: ${value}`);
  }
  return port;
}

async function readRequestBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += Buffer.byteLength(chunk);
    if (size > 1024 * 1024) {
      throw Object.assign(new Error('Request body is too large.'), { statusCode: 413 });
    }
    chunks.push(chunk);
  }
  if (chunks.length === 0) {
    throw Object.assign(new Error('Request body is required.'), { statusCode: 400 });
  }
  try {
    return JSON.parse(chunks.join(''));
  } catch {
    throw Object.assign(new Error('Request body must be valid JSON.'), { statusCode: 400 });
  }
}

function validateTicketInput(input) {
  const title = typeof input?.title === 'string' ? input.title.trim() : '';
  const description = typeof input?.description === 'string' ? input.description.trim() : '';
  const requesterEmail = typeof input?.requesterEmail === 'string' ? input.requesterEmail.trim() : '';
  const priority = typeof input?.priority === 'string' ? input.priority : 'normal';
  if (!title || title.length > 120 || !description || description.length > 2000) {
    throw Object.assign(new Error('Title and description are required and have a maximum length.'), { statusCode: 400 });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(requesterEmail)) {
    throw Object.assign(new Error('requesterEmail must be a valid email address.'), { statusCode: 400 });
  }
  if (!['low', 'normal', 'high'].includes(priority)) {
    throw Object.assign(new Error('priority must be low, normal, or high.'), { statusCode: 400 });
  }
  return { title, description, requesterEmail, priority };
}

async function routeRequest(request, response, options) {
  const dataFile = resolveDataFile(options.dataFile);
  const requestUrl = new URL(request.url ?? '/', 'http://localhost');

  if (request.method === 'GET' && requestUrl.pathname === '/') {
    return sendHtml(response, await readFile(options.publicFile ?? publicFile, 'utf8'));
  }

  if (request.method === 'GET' && requestUrl.pathname === '/health') {
    const state = await ensureStore(dataFile);
    return sendJson(response, 200, {
      service: serviceName,
      status: 'ok',
      storage: 'ready',
      seededTickets: state.tickets.length,
    });
  }

  if (requestUrl.pathname === '/api/tickets' && request.method === 'GET') {
    const state = await ensureStore(dataFile);
    return sendJson(response, 200, { count: state.tickets.length, tickets: state.tickets });
  }

  if (requestUrl.pathname === '/api/tickets' && request.method === 'POST') {
    const ticket = await addTicket(dataFile, validateTicketInput(await readRequestBody(request)));
    return sendJson(response, 201, ticket);
  }

  const ticketMatch = /^\/api\/tickets\/([^/]+)$/.exec(requestUrl.pathname);
  if (ticketMatch && request.method === 'GET') {
    const state = await ensureStore(dataFile);
    const ticket = state.tickets.find((item) => item.id === decodeURIComponent(ticketMatch[1]));
    return ticket
      ? sendJson(response, 200, ticket)
      : sendJson(response, 404, { error: 'Ticket not found.' });
  }

  return sendJson(response, 404, { error: 'Route not found.' });
}

export function createHelpdeskServer(options = {}) {
  return createServer((request, response) => {
    routeRequest(request, response, options).catch((error) => {
      const status = Number.isInteger(error.statusCode) ? error.statusCode : 500;
      sendJson(response, status, {
        error: status === 500 ? 'Internal server error.' : error.message,
      });
    });
  });
}

export async function startServer(options = {}) {
  const dataFile = resolveDataFile(options.dataFile);
  await ensureStore(dataFile);
  const server = createHelpdeskServer({ ...options, dataFile });
  const port = parsePort(options.port ?? process.env.PORT ?? 3000);
  const host = options.host ?? process.env.HOST ?? '0.0.0.0';
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.off('error', reject);
      resolve();
    });
  });
  return server;
}

async function main() {
  const server = await startServer();
  const address = server.address();
  console.log(`helpdesk listening on http://${address.address}:${address.port}`);
  const shutdown = () => server.close(() => process.exit(0));
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
