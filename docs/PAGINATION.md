# Paginated editable rows — 2026-11-15

Sumboard renders **50 rows per page by default**, with a 100-row option. The document still supports at most 500 rows. This is application state built with existing GyosJS 0.5.6 signals/computed values; it needs no core change.

## Behavior and implementation

`document → filter/sort all rows → slice page → keyed DOM`

- Cards, category totals, saving, JSON and CSV use the complete document. “Tổng dòng khớp” includes every matching row, including other pages.
- Search, category/status filters and sorting return to page one. Changing page size keeps the previous first row within the new page.
- Enter/Shift+Enter commit and follow the adjacent row in the full filtered order, revealing its page. Adding/duplicating reveals the new row; deleting the final row on a page clamps and focuses a surviving row.
- Clicking a page control commits a valid draft through the existing change handler. Invalid input follows the existing validation/reset behavior.
- Pagination is view state, excluded from undo history and saved data. Undo/redo preserves the current page where possible and clamps when necessary. Imports reset filters/page; reload starts at page one with 50 rows.
- Off-page controls are unmounted. Stable keys preserve identity only for rows that remain rendered. This is pagination, not virtual scrolling or a promise to retain DOM-local drafts on hidden rows.
- The navigation stays outside the table's scroll area, reports the current page, disables unavailable directions and keeps keyboard focus on the status when a clicked button becomes disabled.

See [controller](../src/sheet.js), [focus and editing](../src/main.js) and [browser regressions](../tests/browser/pagination.spec.js). Small lists can remain fully rendered. Continuous-scroll products may need virtualization, with separate focus, editing and accessibility design.

## Controlled local comparison

Same 500-row document and published GyosJS 0.5.6; five measured iterations after a discarded warmup for each mode. Each iteration resets the original sort outside measurement, then edits row 0, sorts descending, filters to Group 0 (50 rows) and restores the filter. History and persistence remain enabled. Only the initial page size differs; `all` is a benchmark-only transform, not a product option.

Median `flushMs` (dispatch to a following timer task, including queued reactive work and potentially rendering/scheduling):

| Operation | Render all 500 | Page size 50 | Page size 100 |
| --- | ---: | ---: | ---: |
| Edit one row | 158.6 ms | 35.7 ms | 80.5 ms |
| Sort all rows | 367.5 ms | 144.0 ms | 248.9 ms |
| Filter to 50 matches | 127.2 ms | 67.2 ms | 77.1 ms |
| Restore filter | 719.9 ms | 63.7 ms | 174.8 ms |

Editing still produces one input value write in every mode. The improvement comes from bounding mounted controls and their reactive/layout work. Sorting a paginated view can replace rows; it does not necessarily reduce individual DOM mutation counts versus moving an already mounted full table. Filtering, sorting, validation, totals and storage still process the complete data set.

Environment: Windows 10.0.26300, Intel i5-10210U, Node 22.18.0, Chrome 157.0.8103.78, 1440×1000 viewport, no CPU/network throttling. Runs were sequential (`all`, `50`, `100`), not randomized. Instrumentation adds overhead; laptop scheduling/thermal state can affect results. These are local operation timings, not universal speedups, FPS, pure framework time or page-navigation latency. `twoRafMs` is not paint completion; CDP timings overlap and must not be summed.

Raw samples: [all](evidence/pagination-2026-11-15/all.json), [50](evidence/pagination-2026-11-15/50.json), [100](evidence/pagination-2026-11-15/100.json). Reports record the pre-commit app revision and source/runtime SHA-256; `sheetSha256` identifies the source before the recorded page-size transform. This sequence resets sort each iteration and differs from the historical [performance report](PERFORMANCE.md); compare the three new runs with each other, not directly with historical timing numbers.

Reproduce with Node 22 and installed dependencies, in PowerShell:

```powershell
$env:BENCH_ROWS = '500'
$env:BENCH_SAMPLES = '5'
foreach ($mode in @('all', '50', '100')) {
  $env:BENCH_PAGE_SIZE = $mode
  npm run bench:workload -- "pagination-$mode"
  if ($LASTEXITCODE -ne 0) { throw "Benchmark failed: $mode" }
}
```

Reports are written to `.local/perf-pagination-<mode>.json`. The benchmark verifies row counts, totals, sort order, retained row identity and editing focus without timing pass thresholds. The product limit remains 500; larger benchmark fixtures remain stress-only.

## Validation

- 11 domain/storage tests passed; production build passed.
- 52 production browser tests passed across Chromium, Firefox and WebKit; 5 existing intentional skips.
- New cases cover whole-document totals/export, global filtering/sorting, history/storage independence, cross-page keyboard focus, draft commit, page-size changes, add/duplicate/delete, import/undo and empty results.
- Desktop and 390px mobile screenshots inspected; no page-level horizontal overflow. The native table retains its own horizontal scrolling on narrow screens.
- The EN/VI editor-history guide's pagination helper was executed against GyosJS 0.5.6, including resize, empty results and permanent page clamping.
