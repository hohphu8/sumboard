import test from "node:test";
import assert from "node:assert/strict";
import {
  sampleDocument,
  blankDocument,
  validateDocument,
  parseDocument,
  exportJSON,
  exportCSV,
  summarize,
  visibleRows,
  rowTotal,
  numericInput,
  History,
  MAX_ROWS,
} from "../src/model.js";
import { Persistence, STORAGE_KEY } from "../src/persistence.js";
const row = (patch = {}) => ({ ...sampleDocument().rows[0], ...patch });
const document = (rows) => validateDocument({ ...blankDocument(), rows });

test("VND totals round each row half up using decimal quantities; excluded rows do not enter totals", () => {
  assert.equal(rowTotal(row({ quantity: 0.001, price: 500 })), 1);
  assert.equal(rowTotal(row({ quantity: 1.005, price: 100 })), 101);
  assert.equal(
    rowTotal(row({ quantity: 9999.999, price: 999999999 })),
    9999998990000,
  );
  assert.deepEqual(
    summarize([
      row({ price: 10, quantity: 2, paid: true }),
      row({ id: "r_b", price: 5, quantity: 3, paid: false }),
      row({ id: "r_c", price: 100, included: false }),
    ]),
    {
      total: 35,
      paid: 20,
      unpaid: 15,
      included: 2,
      groups: [{ name: "Không gian", amount: 35 }],
    },
  );
  assert.equal(summarize(sampleDocument().rows).total, 7025000);
});

test("numeric editing accepts explicit decimal notation and rejects ambiguous or unsafe inputs", () => {
  assert.equal(numericInput("1,005", "quantity"), 1.005);
  for (const raw of [
    "",
    "-1",
    "NaN",
    "Infinity",
    "1e3",
    "1.000.000",
    "0.0001",
    "1x",
  ])
    assert.throws(() => numericInput(raw, "quantity"));
  assert.throws(() => numericInput("1.5", "price"));
  assert.throws(() => numericInput("1000000001", "price"));
  assert.throws(() => numericInput("10001", "quantity"));
});

test("JSON is a strict round trip, and invalid files cannot enter history", () => {
  const original = sampleDocument();
  assert.deepEqual(parseDocument(exportJSON(original)), original);
  const history = new History(original);
  const bad = [
    null,
    {},
    { ...original, version: 2 },
    { ...original, rows: [original.rows[0], original.rows[0]] },
    { ...original, rows: [row({ paid: 1 })] },
    { ...original, rows: [row({ quantity: 1.00001 })] },
    { ...original, rows: [row({ name: "" })] },
    { ...original, title: "x".repeat(101) },
    { ...original, rows: Array(MAX_ROWS + 1).fill(row()) },
  ];
  for (const candidate of bad) assert.throws(() => history.commit(candidate));
  assert.throws(() => parseDocument("{bad"));
  assert.throws(() => parseDocument(" ".repeat(2_000_001)));
  assert.throws(() =>
    parseDocument(
      exportJSON(original).replace('"format":', '"__proto__": {}, "format":'),
    ),
  );
  assert.deepEqual(history.current, original);
  assert.equal(history.past.length, 0);
});

test("history groups commits, caps memory, handles branching and immutable snapshots", () => {
  const history = new History(sampleDocument(), 3);
  assert.equal(history.commit(history.current), false);
  assert.throws(() => {
    history.current.rows[0].price = 0;
  });
  for (let i = 1; i <= 5; i++)
    history.commit({ ...history.current, title: `Plan ${i}` });
  assert.equal(history.past.length, 3);
  history.undo();
  history.undo();
  history.undo();
  assert.equal(history.current.title, "Plan 2");
  assert.equal(history.undo(), false);
  history.redo();
  assert.equal(history.current.title, "Plan 3");
  history.commit({ ...history.current, budget: 17 });
  assert.equal(history.redo(), false);
  history.reset(blankDocument());
  assert.equal(history.undo(), false);
});

test("filtering and sorting project data without mutating original order or totals", () => {
  const doc = sampleDocument(),
    ids = doc.rows.map((row) => row.id);
  assert.equal(visibleRows(doc.rows, { search: "CA PHE" }).length, 1);
  assert.equal(visibleRows(doc.rows, { status: "paid" }).length, 2);
  const sorted = visibleRows(doc.rows, { sort: "amount-desc" });
  assert.ok(rowTotal(sorted[0]) >= rowTotal(sorted[1]));
  assert.deepEqual(
    doc.rows.map((row) => row.id),
    ids,
  );
  assert.equal(
    summarize(visibleRows(doc.rows, { category: "Ăn uống" })).total,
    1875000,
  );
});

test("CSV quotes delimiters/newlines and neutralizes formula-like user text", () => {
  const csv = exportCSV(
    document([
      row({ name: '=HYPERLINK("bad")', category: "+cmd" }),
      row({ id: "r_b", name: 'hello,"world"\nnext', category: "@x" }),
    ]),
  );
  assert.ok(csv.startsWith("\ufeff"));
  assert.ok(csv.includes('"\'=HYPERLINK(""bad"")"'));
  assert.ok(csv.includes('"\'+cmd"'));
  assert.ok(csv.includes('"hello,""world""\nnext"'));
});

const memory = () => {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
};
test("storage preserves a corrupt original until explicit recovery", () => {
  const storage = memory();
  storage.setItem(STORAGE_KEY, "{bad");
  const persistence = new Persistence(storage);
  assert.equal(persistence.load().kind, "error");
  assert.equal(persistence.save(sampleDocument()).kind, "conflict");
  assert.equal(storage.getItem(STORAGE_KEY), "{bad");
  assert.equal(persistence.save(sampleDocument(), true).kind, "saved");
  assert.equal(persistence.load().kind, "saved");
});
test("a stale tab cannot silently overwrite a newer save, including external removal", () => {
  const storage = memory(),
    a = new Persistence(storage),
    b = new Persistence(storage);
  a.load();
  b.load();
  assert.equal(a.save(sampleDocument()).kind, "saved");
  assert.equal(b.save(blankDocument()).kind, "conflict");
  assert.equal(b.load().document.title, sampleDocument().title);
  assert.equal(b.save(blankDocument()).kind, "saved");
  assert.equal(a.save(sampleDocument()).kind, "conflict");
});
test("quota and blocked storage are explicit failures, never a false saved state", () => {
  const persistence = new Persistence({
    getItem() {
      throw Error("blocked");
    },
    setItem() {
      throw Error("quota");
    },
  });
  assert.equal(persistence.load().kind, "error");
  assert.equal(persistence.save(blankDocument(), true).kind, "error");
});
test("500 maximum-cost rows remain exact safe integers", () => {
  const rows = Array.from({ length: MAX_ROWS }, (_, i) =>
    row({ id: `r_${i}`, quantity: 10000, price: 1e9 }),
  );
  assert.equal(summarize(document(rows).rows).total, 5e15);
  assert.ok(Number.isSafeInteger(summarize(rows).total));
});
