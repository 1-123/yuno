import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { generateDataset, summarize } from '../src/lib/data.ts';

const endTime = process.argv[2] ? Date.parse(process.argv[2]) : Date.now();
if (!Number.isFinite(endTime)) {
  throw new Error('Supply an ISO timestamp, for example 2026-10-08T12:00:00Z.');
}
const directory = new URL('../data/', import.meta.url);
const target = new URL('transactions.json', directory);
await mkdir(directory, { recursive: true });
const transactions = generateDataset(endTime);
await writeFile(target, JSON.stringify(transactions, null, 2) + '\n', 'utf8');
console.log(`Generated ${transactions.length} fictional transactions: ${fileURLToPath(target)}`);
console.log(`Full-history approval rate: ${summarize(transactions).rate.toFixed(1)}%`);
