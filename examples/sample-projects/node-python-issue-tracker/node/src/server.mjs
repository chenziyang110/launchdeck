import { createServer as createHttpServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createIssueStore } from './store.mjs';

const MAX_BODY_BYTES = 1024 * 1024;
const PAGE = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Issue tracker</title>
<style>:root{color-scheme:light dark;font:16px/1.5 system-ui,sans-serif}body{max-width:860px;margin:0 auto;padding:2rem}header{display:flex;justify-content:space-between;gap:1rem;align-items:baseline}ul{list-style:none;padding:0;display:grid;gap:.75rem}li{border:1px solid #8886;border-radius:.5rem;padding:1rem}.meta{color:#888;font-size:.9rem}code{font-family:ui-monospace,monospace}</style></head>
<body><header><h1>Issue tracker</h1><span class="meta">Node.js page + JSON API</span></header>
<p>Use <code>GET /api/issues</code> for the local issue collection or create an issue with <code>POST /api/issues</code>.</p><ul id="issues"><li>Loading issues…</li></ul>
<script>const list=document.querySelector('#issues');fetch('/api/issues').then((response)=>response.json()).then(({issues})=>{list.replaceChildren(...issues.map((issue)=>{const item=document.createElement('li');item.innerHTML='<strong></strong><div class="meta"></div><p></p>';item.querySelector('strong').textContent=issue.title;item.querySelector('.meta').textContent=issue.id+' · '+issue.status;item.querySelector('p').textContent=issue.description;return item;}));}).catch(()=>{list.textContent='Unable to load issues.';});</script></body></html>`;

function writeJson(response, statusCode, payload) {
  response.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  response.end(`${JSON.stringify(payload)}\n`);
}

function writeHtml(response) {
  response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  response.end(PAGE);
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let body = '';
    let size = 0;
    request.setEncoding('utf8');
    request.on('data', (chunk) => {
      size += Buffer.byteLength(chunk);
      if (size > MAX_BODY_BYTES) {
        reject(Object.assign(new Error('Request body is too large.'), { statusCode: 413, code: 'body_too_large' }));
        request.destroy();
        return;
      }
      body += chunk;
    });
    request.on('end', () => {
      try { resolve(body ? JSON.parse(body) : {}); }
      catch { reject(Object.assign(new Error('Request body must be valid JSON.'), { statusCode: 400, code: 'invalid_json' })); }
    });
    request.on('error', reject);
  });
}

function issueIdFromPath(pathname) {
  const match = /^\/api\/issues\/([^/]+)$/.exec(pathname);
  return match ? decodeURIComponent(match[1]) : null;
}

export function createServer(options = {}) {
  const store = createIssueStore(options);
  return createHttpServer(async (request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    const issueId = issueIdFromPath(url.pathname);
    try {
      if (request.method === 'GET' && url.pathname === '/') return writeHtml(response);
      if (request.method === 'GET' && url.pathname === '/health') {
        const issues = await store.list();
        return writeJson(response, 200, { status: 'ok', service: 'node-python-issue-tracker-node', database: 'json', seededIssues: store.seedCount, storedIssues: issues.length });
      }
      if (request.method === 'GET' && url.pathname === '/api/issues') {
        const issues = await store.list();
        return writeJson(response, 200, { issues, count: issues.length });
      }
      if (request.method === 'GET' && issueId) {
        const issue = await store.get(issueId);
        return issue ? writeJson(response, 200, issue) : writeJson(response, 404, { error: 'issue_not_found', message: `Issue ${issueId} was not found.` });
      }
      if (request.method === 'POST' && url.pathname === '/api/issues') return writeJson(response, 201, await store.create(await readJsonBody(request)));
      if (request.method === 'PATCH' && issueId) return writeJson(response, 200, await store.update(issueId, await readJsonBody(request)));
      return writeJson(response, 404, { error: 'not_found', message: 'Route was not found.' });
    } catch (error) {
      const statusCode = Number.isInteger(error.statusCode) ? error.statusCode : 500;
      return writeJson(response, statusCode, { error: error.code ?? 'internal_error', message: statusCode >= 500 ? 'The issue service could not complete the request.' : error.message });
    }
  });
}

export async function main() {
  const port = Number(process.env.PORT ?? 4821);
  const host = process.env.HOST ?? '127.0.0.1';
  const server = createServer();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, host, resolve); });
  console.log(`Node issue tracker listening on http://${host}:${port}`);
  return server;
}

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === currentFile) await main();

