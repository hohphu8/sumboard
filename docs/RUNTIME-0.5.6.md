# GyosJS 0.5.6 rollout — 2026-11-15

Sumboard now pins published `gyosjs@0.5.6` from the official npm registry. The CSP entry, immutable history sharing, validation rules and 500-row product limit remain in place.

Validated locally on Windows with Node 22.18.0, Vite 6.4.6 and Playwright 1.55.1 (installed Chrome plus Playwright Firefox/WebKit):

- `npm ci --registry=https://registry.npmjs.org` and `npm audit --audit-level=high`: passed, zero audit findings.
- `npm test`: 11 domain/storage tests passed; `npm run build` passed.
- `SUMBOARD_PRODUCTION=1 npm run test:e2e`: 43 passed, 5 existing intentional skips; no failures. Covers 500-row keyed DOM/focus, totals, editing, undo/redo, import, storage recovery/conflicts and CSP. Skipped development-only disposal probes and optional screenshots are not counted as runtime coverage.
- `BENCH_ROWS=500 BENCH_SAMPLES=5 npm run bench:workload -- npm-0-5-6`: passed with the installed npm runtime, no aliases/overrides. All five edits produced 1 value write and 1 attribute mutation. The [performance report](PERFORMANCE.md) records timings, provenance and raw samples.

Installed CSP bundles/styles match the verified official npm package bytes. This is local validation, not a public deployment or physical-device Safari test. Historical reports keep their original runtime versions and measurements.
