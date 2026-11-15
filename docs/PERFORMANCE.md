# Workload measurements — 2026-11-15

> Runtime rollout: the app now pins published GyosJS 0.5.6, which includes the binding optimization. The original measurements below retain their 0.5.5 baseline and candidate provenance.

## Published 0.5.6 verification

The 500-row workload was rerun against the installed official npm package with no model/runtime override, five measured iterations after warmup, after the other browser suites finished. [Raw published-package samples](evidence/performance-2026-11-15/npm-0.5.6.json) include model/runtime SHA-256; the runtime hash was verified against the official tarball, which is byte-identical to the release candidate. The recorded app commit precedes committing the dependency rollout; source hashes identify the measured files.

Every measured edit produced **1 input value write and 1 attribute mutation**. Median `flushMs`: edit **122.3**, sort **302.9**, filter **85.3**, restore **576.4**. This confirms the final package retains the write-count improvement. It is a separate local run, not a randomized timing comparison with the earlier 0.5.5 samples. Sort/filter still update index-based labels and restore still creates removed controls. The product limit remains 500 rows.

The npm rollout also passed 11 domain/storage tests, production build and 43 production browser cases (5 existing intentional skips); npm audit reported zero findings. See [rollout validation](RUNTIME-0.5.6.md).

## Original baseline and candidate experiment

Sumboard still supports **500 rows**. The 1,000/2,000-row builds below override the limit only in a benchmark transform; they are not a product capacity increase. All app dependencies remain pinned to published GyosJS 0.5.5. The core optimization is an **unreleased candidate**, used only by an explicit benchmark alias.

## Reproduce

Use Node 22, `npm ci`, and installed Chrome on Windows (Playwright Chromium elsewhere):

```sh
npm run bench:workload -- current
node scripts/measure-history-sharing.mjs
```

The runner builds the real HTML/CSS/JS into ignored `.local/perf-<label>-<rows>/`, serves production assets on a free local port, seeds deterministic localStorage and checks every operation's totals, sort order, surviving DOM identity and edit focus. No timing threshold is used. Five measured iterations follow one discarded warmup at each size. Each iteration edits row 0, reverses amount sort, filters to one of ten categories and restores all rows. Persistence and undo history remain enabled. The first measured edit starts from the warmup's restored 500/1,000/2,000-row table.

Optional environment variables:

- `BENCH_ROWS=500` and `BENCH_SAMPLES=5` select supported fixture sizes/sample count.
- `BENCH_MODEL_REF=25c7cb8853ff2c9498b07a5b72ace9a309e99b18` rebuilds the pre-sharing model from Git without changing the checkout. `BENCH_MODEL` accepts an explicit UTF-8 model file instead.
- `BENCH_GYOS=/absolute/path/to/gyos.csp.esm.js` uses a candidate core bundle without touching the dependency/lockfile. Build that core checkout first; an arbitrary current file is not necessarily the recorded candidate.

Outputs are `.local/perf-<label>.json`. Recorded evidence: [original model](evidence/performance-2026-11-15/baseline.json), [shared immutable rows](evidence/performance-2026-11-15/shared.json), [shared rows + guarded core binding writes](evidence/performance-2026-11-15/guarded.json). The first two were collected before source hashes were added to the runner; their source states are the pre-sharing Git revision above and this change's model respectively. The candidate report includes the measured model/runtime SHA-256. All three report the same base app commit because measurements preceded committing the changes.

Environment: Windows 10.0.26300, Intel Core i5-10210U, Node 22.18.0, Chrome 157.0.8103.78, Vite 6.4.6, Playwright 1.55.1, 1440×1000 viewport, reduced motion, no CPU/network throttling. Runs were sequential, not a statistically randomized experiment; laptop scheduling/thermal state can affect timings.

## What was measured

- `handlerMs`: synchronous event/command duration. Edit includes history commit and saving.
- `flushMs`: from dispatch to a following timer task, after queued reactive work; it can include browser rendering/scheduling. It is not pure GyosJS time.
- `forcedLayoutMs`: an explicit geometry read after that task. Often zero because layout has already occurred; **not** the total layout cost.
- `twoRafMs`: a two-rAF boundary, **not** a guarantee of presented pixels.
- CDP deltas: script, layout, style and task time around the operation. They overlap other timings and should not be added together as disjoint phases.
- Wrapped domain functions, input setters and MutationObserver: model/save work and DOM operations. Instrumentation adds overhead. Mutation counts include retained-row moves and legitimate creation after a filter, not allocation counts alone.

See the [CDP Performance protocol](https://chromedevtools.github.io/devtools-protocol/tot/Performance/) for the browser metrics interface. No network-load, physical-device FPS, heap-byte or long-duration leak claim is made.

## Findings

### Preserve immutable history rows: retention, not a UI speedup

Previously every validated commit cloned every row. `History.commit()` now **validates the entire input first**, then reuses an old frozen row only when its ID and all allowed fields equal the validated row. Changed rows remain new; external inputs cannot mutate history. Reordering, undo/redo, no-op commits, unknown fields and duplicate IDs have regression coverage.

For 500 rows and 80 one-row edits (81 snapshots):

| Retained history structure | Before | After |
| --- | ---: | ---: |
| Row references across snapshots | 40,500 | 40,500 |
| Distinct row objects | 40,500 | 580 |

This is a deterministic object-identity count, not a heap-byte measurement. Validation still allocates temporary rows and history still retains arrays. UI writes did **not** decrease from this app change alone: GyosJS 0.5.5 invalidates keyed row contexts when the list reference changes. The 500-row edit median was 160.7 ms before and 159.3 ms after; larger runs varied in both directions. Do not advertise the sharing change as a measured UI speedup.

### Core candidate: avoid writing unchanged DOM values

The isolated core regression showed a refreshed keyed context assigned an unchanged `input.value` and ordinary attributes again. The candidate compares the **live** property/attribute before writing; it does not cache the last expression result. External DOM edits still reconcile on the next update, and name/URL safety checks still execute. Boolean properties receive the same guard. Keyed effects, expression evaluation, class/style handling and list reconciliation remain otherwise unchanged.

| Single edit | Published 0.5.5 (either model) | Candidate core |
| --- | ---: | ---: |
| 500 rows: input value writes / attribute mutations | 2,001 / 6,500 | 1 / 1 |
| 1,000 rows: input value writes / attribute mutations | 4,001 / 13,000 | 1 / 1 |
| 2,000 rows: input value writes / attribute mutations | 8,001 / 26,000 | 1 / 1 |

The remaining value write is the app's own edit normalization. Sort still changes index-based accessibility labels; restoring a filter genuinely creates removed rows. Those writes must remain.

Median `flushMs` for the shared model, five samples per operation:

| Rows | Operation | Published 0.5.5 | Candidate core |
| --- | --- | ---: | ---: |
| 500 | Edit | 159.3 | 121.5 |
| 500 | Sort | 448.0 | 313.2 |
| 500 | Filter to 10% | 160.9 | 100.6 |
| 500 | Restore all | 809.2 | 585.7 |
| 1,000 (stress) | Edit / sort / filter / restore | 281.4 / 600.7 / 217.6 / 1,214.0 | 183.1 / 603.7 / 209.0 / 1,140.7 |
| 2,000 (stress) | Edit / sort / filter / restore | 431.3 / 1,526.4 / 573.3 / 2,863.1 | 338.7 / 1,130.5 / 388.7 / 2,264.4 |

For the 500-row edit, median CDP script time changed from 124.6 to 82.9 ms; layout was 5.4 to 4.4 ms. For sort, script was 140.4 to 98.6 ms and layout 163.5 to 96.4 ms. Domain projection was much smaller: typically about 0–2 ms for filtering/sorting/summarizing; edit commit/save were single-digit milliseconds in these samples. These measurements locate the main cost around binding/DOM work and table layout, not primarily the arithmetic. They do not precisely attribute every millisecond to a library function or establish a universal percentage speedup.

## Decisions

Validation after the model change: 11 domain/storage tests and 43 production browser cases passed, with 5 existing intentional skips. The production cases include 500-row keyed identity/focus, totals, undo/redo, import validation, storage conflicts and CSP. Candidate core checks are recorded in the [framework report](https://github.com/gyosjs/gyosjs/blob/main/docs/performance-follow-up.md).

- Keep immutable row sharing for smaller retained history; keep validation, history capacity and the 500-row product limit.
- Keep the measured core write guard as a separately tested, unreleased change. This app continues using npm 0.5.5 until a normal release/rollout.
- Do not introduce per-row signals, a virtualized table or another core entry based on this run. Restoring hundreds of editable rows is still expensive. A future larger-sheet product should first test pagination/virtualization with keyboard focus, editing and accessibility requirements.
- Preserve raw samples and rerun the same workload before making performance claims for a new release.
