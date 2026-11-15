import { History, sampleDocument } from '../src/model.js';
import assert from 'node:assert/strict';

const sample = sampleDocument();
const initial = { ...sample, rows: Array.from({ length: 500 }, (_, i) => ({ ...sample.rows[0], id: `r_history-${i}` })) };
const history = new History(initial);
for (let i = 0; i < 80; i++) history.commit({ ...history.current,
  rows: history.current.rows.map((row, index) => index ? row : { ...row, price: row.price + 1 }) });
const snapshots = [...history.past, history.current];
const result = { snapshots: snapshots.length, rowReferences: snapshots.reduce((n, doc) => n + doc.rows.length, 0),
  uniqueRows: new Set(snapshots.flatMap(doc => doc.rows)).size };
assert.deepEqual(result, { snapshots: 81, rowReferences: 40500, uniqueRows: 580 });
console.log(JSON.stringify(result, null, 2));
