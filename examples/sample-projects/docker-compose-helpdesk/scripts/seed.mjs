import path from 'node:path';
import { ensureStore, resetStore, resolveDataFile } from '../src/store.mjs';

const dataFile = resolveDataFile(process.env.DATA_FILE ?? path.join(process.cwd(), 'data', 'tickets.json'));
const state = process.argv.includes('--reset')
  ? await resetStore(dataFile)
  : await ensureStore(dataFile);

console.log(JSON.stringify({ dataFile, tickets: state.tickets.length, reset: process.argv.includes('--reset') }));
