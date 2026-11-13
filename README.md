# Sumboard

A Vietnamese cost-planning sheet built with **GyosJS 0.5.5**, plain HTML/CSS/JavaScript and Vite. Edit a workshop budget or start your own plan. No server, account, telemetry or remote runtime assets.

## Run

Use Node 22 or newer:

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:4220. Production: `npm run build`, then `npm run preview` (http://127.0.0.1:4221). Host the contents of `dist/` on any static host at the domain root. A different port/domain has a different local save; export JSON before moving to another address.

## Use

- Edit any item, group, quantity or unit price. Enter commits and moves down; Shift+Enter moves up; Tab moves between controls; Escape discards the current draft.
- Amounts are integer VND; quantities support three decimal places. No thousands separators in editable numeric fields. Each row rounds to the nearest VND, with halves rounded up.
- “Tính tổng” includes a row in the plan. “Đã trả” marks the entire row paid. Partial payments are not supported.
- Search (accent-insensitive), category/status filters and sorting change only the view. Cards/category totals refer to the whole plan; “Phần đang hiện” is the included subtotal of visible rows.
- Add, duplicate and remove rows. Undo/redo keeps up to 80 document changes for the current session. Reload resets history. Outside inputs: Ctrl/Cmd+Z and Ctrl/Cmd+Shift+Z (or Ctrl+Y); inside inputs native text undo is preserved.
- Ctrl/Cmd+S exports JSON. JSON is the full backup/restore format; CSV exports all rows for other spreadsheet software and escapes formula-like text. CSV import is not supported.
- Invalid imports preserve the open plan. Valid imports, resets and storage recovery require confirmation. An import that finishes after a newer edit is ignored.

## Data and limits

One plan, at most 500 rows; title 100 characters, item 160, category 48. Quantity 0–10,000 with three decimals; unit price 0–1,000,000,000 VND; budget 0–1,000,000,000,000,000 VND. JSON input at most 2 MB. No arbitrary formulas, multiple sheets or cloud sync.

Committed edits save to this browser's localStorage. A corrupt or unreadable save is preserved until an explicit overwrite. Quota/permission failures remain visible; export JSON to keep work. A detected newer save from another tab pauses automatic saving and offers explicit recovery. localStorage is not transactional, so simultaneous writes can still race: edit in one tab. Clearing site data removes local saves. The app has no service worker and does not promise offline reloads.

## Verify and architecture

```sh
npm test
npm run build
npm run test:e2e
```

Production browser suite: set `SUMBOARD_PRODUCTION=1`, then run `npm run test:e2e`. Install Playwright browsers on a new machine with `npx playwright install`; Windows Chromium tests use installed Google Chrome. Generated evidence lives in ignored `.local/` and `test-results/`.

- `src/model.js`: immutable, validated document; exact row accounting; history; file formats.
- `src/sheet.js`: explicit signals/computed values project a document into a filtered view, totals and history counts.
- `src/persistence.js`: storage reads, failures and compare-before-write conflict detection.
- `src/main.js`: scope factory, committed editing, focus, dialogs, downloads, file-read generation and lifecycle cleanup.
- `index.html`: reactive template, native table and controls; `src/style.css`: responsive styling.

See [plan](docs/PLAN.md), [validation](docs/VALIDATION.md) and [GyosJS findings](docs/DOGFOOD.md). This repository has no remote configured; its owner chooses the remote and hosting.
