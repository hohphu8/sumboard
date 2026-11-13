# Sumboard

A complete Vietnamese local-first planning/cost sheet, built with published GyosJS 0.5.5 and plain HTML/CSS/JavaScript. Separate Git repository, incremental local commits. Owner chooses remote later; do not create or push a remote automatically.

## Scope

- One editable plan: name, budget, rows with item, category, quantity, unit cost, included/paid flags.
- Integer VND accounting, quantity up to three decimals, explicit limits; derived row totals, included total, paid balance, category totals and filtered subtotal.
- Native input editing, Tab, Enter/Shift+Enter between rows, Escape to cancel an edit; keyboard shortcuts outside inputs; visible focus, mobile scrollable table, reduced motion.
- Add, duplicate, remove, search, filter and sort. View changes do not alter the saved row order. Stable keyed row identity.
- Undo/redo for committed document changes, capped at 80 steps; view state is independent. No-op and invalid edits do not add history.
- Local save, corrupt/blocked storage recovery, cross-tab conflict protection. JSON import/export round-trip and spreadsheet-safe CSV export. Pending imports cannot overwrite newer edits or survive disposal.
- Clear empty states, sample plan, confirmed reset/import and restore; no accounts, backend, analytics, external assets or broad spreadsheet formula language.

## Delivery

1. Domain model, history and storage with meaningful regression tests; initial commit.
2. Working reactive product and accessible editing; feature commit.
3. Browser and production checks (Chrome/Firefox/WebKit), visual review, lifecycle and measured workload probe; record evidence/limits, final commits.

Use pure domain functions, explicit signals/computed for document projections, and a scope factory for UI ownership. Native DOM adapters only handle focus, file dialogs and lifecycle. Keep app defects separate from GyosJS defects; isolate any suspected framework issue before changing private core. No speculative APIs or automatic version bump.
