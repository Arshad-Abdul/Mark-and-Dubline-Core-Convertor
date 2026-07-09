import fs from 'fs';
import { parseMarcMnemonic } from './src/lib/marcMnemonic.js';

const text = fs.readFileSync(process.argv[2], 'utf-8');
const records = parseMarcMnemonic(text);
console.log('Parsed records:', records.length);

const fieldCounts = records.map((r) => r.fields.length);
console.log('Records with 0 fields:', fieldCounts.filter((c) => c === 0).length);
console.log('Min/max fields:', Math.min(...fieldCounts), Math.max(...fieldCounts));

// find duplicate leaders (could indicate merged records)
const leaderCounts = new Map();
for (const r of records) {
  leaderCounts.set(r.leader, (leaderCounts.get(r.leader) || 0) + 1);
}
const dupLeaders = [...leaderCounts.entries()].filter(([, c]) => c > 1);
console.log('Distinct leaders appearing more than once:', dupLeaders.length);
