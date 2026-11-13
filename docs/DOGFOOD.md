# GyosJS dogfood — Sumboard

Runtime: published npm `gyosjs@0.5.5`, CSP entry `gyosjs/csp`. No local alias, patched node_modules, core fork or new framework API is required by the implementation.

## What this app exercises

- A scope factory creates one document controller and lifecycle per mount. Explicit signals hold immutable document snapshots; computed values derive totals, filtered rows, groups and remaining budget. The template calls these signals directly while `g-model` binds filter handles.
- `*for` with `g-key="row.id"` preserves actual row/input nodes during sorting. Stable IDs remain independent of filtered row numbers. Browser tests compare node identity before/after reorder, including the 500-row workload.
- Frozen nested document data, native text/attribute/checkbox bindings, synchronous domain reads and microtask DOM updates all run through the published runtime.
- Scope `onUnmount` aborts global listeners, invalidates pending file reads, closes dialogs and revokes download URLs/timers. A dev-only probe exercises actual `Gyos.cleanup` rather than simulating a callback.
- Native `<dialog>`, input change/keyboard behavior, Blob downloads and file reads stay in an application adapter. They do not justify an extra GyosJS API by themselves.

## Findings

1. **App error, fixed:** Enter commits an edit and moving focus triggers native `change` again. The duplicate no-op used to clear an earlier storage failure. The edit adapter now treats an unchanged value as a no-op and preserves the error. Browser regression simulates quota failure.
2. **HTML authoring constraints:** Raw `<` in text interpolation is parsed as HTML before GyosJS or Vite evaluates expressions. Write `&lt;` in HTML text, or expose a derived value. Also, a generic HTML formatter may wrap long JavaScript string literals across physical lines inside `{...}`, producing invalid expressions. Browser regressions caught blank empty-state messages after formatting. Long display sentences now live in computed values in JS, leaving short `{emptyTitle()}`-style bindings. This preserves the intended JavaScript expression contract without teaching the core to accept invalid strings.
3. **App tradeoff:** A single immutable document signal gives simple deterministic undo/redo and validated file/storage boundaries. It also invalidates projections for the entire document on each committed edit. The workload report measures this 500-row implementation; it is not a universal framework benchmark. Per-row state or windowed rendering should be considered only if larger workloads justify the extra complexity.
4. **Browser storage limit:** compare-before-write and storage events protect against observed stale writes, but localStorage has no atomic compare-and-swap. Simultaneous edits remain possible; the product explicitly recommends one editing tab and JSON backups.
5. **App/browser integration, fixed:** clicking a button does not necessarily make it `document.activeElement` on WebKit. Remembering only the active element returned focus to the wrong place after closing a dialog. Dialog actions now pass their actual event trigger; Escape/close returns focus to that trigger. The responsive/help regression runs on all three browser engines.

No confirmed GyosJS defect was isolated in the covered journeys. This does not establish that the library is defect-free. See [validation evidence and limits](VALIDATION.md).

## Suggested documentation recipe

A “validated editor with history” recipe would complement the existing simple `Gyos.scope('Name', { ... })` examples: keep data rules pure; use explicit signals when passing a controller between modules; derive totals with computed; commit a draft on change/Enter; dispose browser resources in scope lifecycle. This is an application structure, not a requirement to use low-level APIs for ordinary scopes.

If future testing reveals a suspected core issue, record the smallest standalone markup/state transition, expected and actual behavior, runtime version, then reproduce independently before proposing private-core changes. Do not add core APIs merely to shorten this app.
