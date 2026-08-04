import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

const seedFile = new URL('../db/seed.json', import.meta.url);
let mutationQueue = Promise.resolve();

export function resolveDataFile(dataFile = process.env.DATA_FILE) {
  return path.resolve(dataFile ?? path.join(process.cwd(), 'data', 'tickets.json'));
}

function isTicket(value) {
  return value && typeof value === 'object'
    && typeof value.id === 'string'
    && typeof value.title === 'string'
    && typeof value.description === 'string'
    && typeof value.requesterEmail === 'string'
    && ['low', 'normal', 'high'].includes(value.priority)
    && ['open', 'in-progress', 'closed'].includes(value.status)
    && typeof value.createdAt === 'string';
}

function validateState(state) {
  if (!state || state.version !== 1 || !Array.isArray(state.tickets) || !state.tickets.every(isTicket)) {
    throw new Error('The helpdesk data file is not a valid version 1 ticket store.');
  }
  return state;
}

export async function loadSeedState() {
  const state = JSON.parse(await readFile(seedFile, 'utf8'));
  return validateState(JSON.parse(JSON.stringify(state)));
}

export async function readStore(dataFile = process.env.DATA_FILE) {
  const file = resolveDataFile(dataFile);
  return validateState(JSON.parse(await readFile(file, 'utf8')));
}

export async function writeStore(dataFile, state) {
  const file = resolveDataFile(dataFile);
  validateState(state);
  await mkdir(path.dirname(file), { recursive: true });

  const temporaryFile = `${file}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporaryFile, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
    await rename(temporaryFile, file);
  } finally {
    await unlink(temporaryFile).catch(() => {});
  }
  return state;
}

export async function ensureStore(dataFile = process.env.DATA_FILE) {
  const file = resolveDataFile(dataFile);
  try {
    return await readStore(file);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
    return writeStore(file, await loadSeedState());
  }
}

function enqueueMutation(operation) {
  const next = mutationQueue.then(operation, operation);
  mutationQueue = next.catch(() => {});
  return next;
}

export function resetStore(dataFile = process.env.DATA_FILE) {
  return enqueueMutation(async () => writeStore(dataFile, await loadSeedState()));
}

export function addTicket(dataFile, input) {
  return enqueueMutation(async () => {
    const state = await ensureStore(dataFile);
    const nextNumber = state.tickets.reduce((highest, ticket) => {
      const match = /^ticket-(\d+)$/.exec(ticket.id);
      return match ? Math.max(highest, Number(match[1])) : highest;
    }, 0) + 1;
    const ticket = {
      id: `ticket-${String(nextNumber).padStart(3, '0')}`,
      title: input.title,
      description: input.description,
      requesterEmail: input.requesterEmail,
      priority: input.priority,
      status: 'open',
      createdAt: new Date().toISOString(),
    };
    await writeStore(dataFile, { version: 1, tickets: [...state.tickets, ticket] });
    return ticket;
  });
}
