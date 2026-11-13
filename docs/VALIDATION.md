# Validation — 2026-11-13

Tested locally on Windows with Node 22.18.0, Vite 6.4.6, Playwright 1.55.1 and the published `gyosjs@0.5.5` CSP entry. Chromium uses installed Google Chrome; Firefox and WebKit use Playwright engines. WebKit here is not a physical Safari/iPhone test.

## Results

| Check | Result |
| --- | --- |
| Domain/storage tests (`npm test`) | 10 passed |
| Production build (`npm run build`) | Passed |
| Development browser suite | 46 passed, 2 intentional skips; 0 failed/flaky |
| Production browser suite | 43 passed, 5 intentional skips; 0 failed/flaky |
| Desktop/mobile visual inspection | Reviewed screenshots at 1440 and 390 px widths |

Each browser suite schedules 16 cases on each of three engines. Screenshot capture runs only on Chrome (two skips). The production suite additionally skips the dev-only explicit scope-disposal probe on all three engines. Disposal/resource assertions in the blocked-storage test also run only in development; production still tests blocked storage, editing and export.

The final browser runs began at 11:14 UTC on 2026-11-13 and completed in approximately 3.2 and 3.3 minutes. They ran concurrently on separate ports. Both processes exited 0; JSON reports contain no runner errors, failures or flaky tests. Evidence is regenerated in ignored `.local/development-results.json`, `.local/production-results.json`, `.local/final-*.log`, and `test-results/`.

Build output: HTML 21.60 kB (gzip 5.56), CSS 16.68 kB (gzip 4.55), JS 249.74 kB (gzip 78.66). These are Vite artifact sizes, not a claim about GyosJS core size alone.

## What the checks establish

| Area | Evidence |
| --- | --- |
| Accounting | Fractional quantities, half-up VND rounding, maximum safe aggregate, included/paid totals and over-budget UI |
| Editing | Enter/Shift+Enter movement, native Tab commit, Escape cancellation, invalid/no-op edits, add/duplicate/remove and focus |
| History | Immutable snapshots, undo/redo, bounded history, branch changes, reset/import undo |
| Reactive views | Accent-insensitive search, category/status filters, sort, filtered subtotal distinct from whole-plan totals, empty states |
| Identity/workload | 500 rendered rows; actual row and input nodes retained across sort; edited totals and filter restoration |
| Persistence | Reload retains committed data; corrupt/quota-blocked/access-denied storage remains recoverable; observed stale-tab writes require a choice |
| Files | Actual JSON/CSV downloads, JSON round-trip, strict validation and duplicate-ID rejection, confirmation/cancel, newer-edit race protection |
| Input safety | Imported HTML-like strings stay text; special category names do not alter prototypes; CSV formula-like text is escaped |
| Lifecycle | Actual Gyos cleanup cancels pending import effects, removes global shortcuts and revokes outstanding download URLs in dev |
| Browser behavior | Three engines; emulated touch; 390/320 px layout bounds; reduced motion; dialog Escape and trigger focus |
| Runtime isolation | Representative CSP journey reports no violations, page errors or external resource requests |

Visual review checked desktop hierarchy, readable Vietnamese copy, summary totals, table controls, allocation bars and mobile stacking. On mobile the table intentionally scrolls horizontally, with a visible hint; the page itself does not overflow horizontally at the tested widths. This is not a formal accessibility conformance audit.

## 500-row workload observations

Production, single run per engine, rounded milliseconds:

| Engine | Navigate + render + assertions | Sort + assertion | Edit + total assertion |
| --- | ---: | ---: | ---: |
| Chrome | 2312 | 1054 | 1175 |
| Firefox | 4132 | 1601 | 1750 |
| WebKit | 2182 | 2168 | 2015 |

These timings include Playwright actions/waits, browser startup/navigation effects and concurrent test load. They do **not** measure pure reactive execution, frame rate or input latency. Raw measurements live in `.local/workload-{dev,prod}-{browser}.json`. Correctness at the 500-row limit is demonstrated; smooth interaction on all devices is not. If large plans become normal use, profile a quiet production session before choosing per-row state or rendering only visible rows.

## Reproduce

With Node 22+ and browser dependencies installed:

```sh
npm ci
npx playwright install
npm test
npm run build
npm run test:e2e
```

Production suite in PowerShell:

```powershell
$env:SUMBOARD_PRODUCTION = '1'
npm run test:e2e
Remove-Item Env:SUMBOARD_PRODUCTION
```

On Windows install Google Chrome as well, because the Chromium project selects its channel. Keep ports 4220/4221 free; the runner starts and stops its own dev/preview server. The screenshot case writes `.local/desktop.png` and `.local/mobile.png` for visual inspection.

## Limits and follow-up

- localStorage has no transaction/CAS primitive. Observed conflicts are guarded; truly simultaneous tab writes can still race. Use one editing tab and JSON backups.
- One plan, up to 500 rows and 80 undo steps. No arbitrary formulas, multi-sheet editing, partial payments, cloud sync or offline-reload guarantee.
- Automated touch/browser checks do not replace physical device or assistive-technology testing. Clipboard bulk paste, mobile spreadsheet gestures and collaborative editing are outside this version.
- Cleanup checks cover owned listeners, pending imports and Blob URLs; no long-duration heap/leak benchmark was performed.
- No confirmed GyosJS core defect emerged from these cases. App fixes and a possible documentation recipe are recorded in [DOGFOOD.md](DOGFOOD.md). No core API or release bump is needed for this delivery.
- Repository and production build are ready locally; remote selection and hosting remain with the owner.
