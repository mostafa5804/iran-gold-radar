# Design QA — Iran Gold Radar 0.2.0

- Source visual: `/workspace/scratch/aece6cc3294f/generated_images/exec-cca0e5aa-2d75-4a22-a6a2-b4705734f515.png` (selected concept 3).
- Browser-rendered implementation: `/workspace/scratch/gold-radar-light-qa3.jpg`.
- Combined comparison: `/workspace/scratch/gold-radar-qa-final-comparison.jpg`.
- Focused header/type comparison: `/workspace/scratch/gold-radar-qa-detail.jpg`.
- Browser: cloud Chrome. CSS viewport 1363 × 936; screenshot 1348 × 926 (browser capture normalization). Source 1488 × 1058 scaled proportionally to screenshot width; no stretching. Comparison does not assume identical viewport height.
- State: light, base scenario, year horizon. Populated forecast used explicitly labeled disposable test assumptions to exercise the complete interface before deployment. Source mock is also illustrative. Test values are NOT committed or published. Real market quote/history was retained. Empty forecast state also inspected.

## Findings and fixes

1. [P2, fixed] Initial chart/ticker vertical spacing pushed both insight sections below the viewport. Reduced ticker padding, chart height and panel spacing. Comparison 1: `gold-radar-qa-1.jpg`; post-fix combined comparison above shows both lower section headings and content visible.
2. [P2, fixed] The added manual-source area could push the primary analysis action below the desktop rail viewport. Pinned the action and its cost note to the rail bottom and reserved scroll padding. Final capture shows the complete action.
3. [P1, fixed] Source creation on the HTTP local preview called secure-context-only `crypto.randomUUID`. Replaced identifiers with `crypto.getRandomValues`, also fixing local trade creation. Source add, persistence, disable and delete passed.
4. [P2, fixed] Mobile controls preceded the entire dashboard. Added an accessible collapsible assumptions/source control; at 390 × 844 the price and chart appear first and controls remain usable.

## Required fidelity surfaces

- Typography: locally hosted Vazirmatn, bold charcoal title and prices, restrained secondary labels, purple model control. Focused comparison verifies comparable title shape/weight. Real source dates and detailed provenance use smaller type than the mock's illustrative copy; intentional.
- Spacing/layout: right rail ~22% of desktop, white ticker, wide chart, two lower insights. Price outcome strip and real-data status add height relative to the mock intentionally. No horizontal viewport overflow was observed. Mobile uses a single column and collapsible rail.
- Color/tokens: cool white/gray backgrounds, thin gray dividers, purple selections/forecast, amber history, green/red return semantics. No dark dashboard panels remain.
- Assets: existing vector brand retained and recolored; no generated chart image or fabricated decorative asset. Illustrative ticker/news icons were omitted in favor of real data/source text; intentional product simplification. Mathematical SVG plots render actual series and scenario arithmetic.
- Copy: user-supplied material distinguished from independent research; clear nominal/real and fact/assumption wording. No fabricated accuracy or probability. Missing forecast/inflation states show unavailable, not zero. Manual link receipt only claims retrieval when Google metadata confirms it.

## Interactions and console

- Horizon changes, all scenario selectors, nominal/real toggles: values and chart changed; 31.25% test nominal return correctly became −6.25% real at 40% test inflation.
- Add manual text, disable, reload persistence, delete: passed. URL/schema validation and retrieval receipts covered by arithmetic/input tests.
- Model search `3.1`: real server catalog showed available 3.1 Pro and Flash Lite models, preserving the selected model. Settings close passed.
- Mobile 390 × 844 iframe viewport: control disclosure opened and changing horizon updated output. No device shell or synthetic mobile chrome.
- Browser console: no app-origin errors observed; existing Chrome extension metadata errors excluded.
- 10 Node tests and 4 Python tests passed. No secret used by the preview.

## Open questions / intentional differences

The forecast is a grounded, judgmental AI scenario model, not an empirically calibrated statistical model. Real public reports may have missing inflation or refuse numerical assumptions. The production UI deliberately allows those empty states. Manual sources are a functional extension of the selected visual and add rail content. No share/deploy permission is needed again: the existing GitHub Pages publication is user-authorized.

## Implementation checklist

- [x] Fix actionable P1/P2 findings and compare revised captures.
- [x] Test primary interactions and model arithmetic.
- [x] Restore real report and remove test-only preview wrapper before committing.
- [x] Verify fresh server-generated forecast and deployed Pages after GitHub Actions.

## Follow-up polish

Optional: additional nonessential ticker icons. This does not block use or visual acceptance.

## Real-data verification

The first production extraction rejected range-valued assumptions. Updated the extraction contract to use the explicitly disclosed arithmetic midpoint of published AI scenario ranges, and to preserve unavailable inflation as null. The subsequent Gemini 3.8 Flash report (2026-09-26T17:49:29Z) contains 14 web sources and all 12 scenario points. No test forecast was published. Both local and public Pages rendered the same 90-day outcomes; nominal/real toggles and assumption citations passed.

Actual-data comparison evidence: `/workspace/scratch/gold-radar-real-qa.jpg` and `/workspace/scratch/gold-radar-qa-real-comparison.jpg`. Same viewport as earlier; actual state is 90-day/base whereas mock is annual/base, so numeric paths are intentionally different. Long inflation rationale originally introduced tiny internal scroll areas; replaced these with native disclosure controls and source links. Moved per-horizon reasoning into a disclosure to preserve chart density. Retested both controls and confirmed selected button states through `aria-pressed`. No new actionable P0/P1/P2 findings. App-origin console errors: none.

Asset cache coherence: versioned CSS/JS URLs added for 0.2.1 after observing mixed cached assets immediately after Pages deployment. Research contract requests use no-store.

final result: passed
