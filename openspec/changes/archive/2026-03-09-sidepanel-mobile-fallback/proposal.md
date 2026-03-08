## Why

Some mobile browser environments expose side panel APIs even though they cannot actually present a usable side panel UI. This creates a false-positive support signal that can leave the toolbar action or popup-side "open side panel" entry point with no visible destination.

## What Changes

- Tighten side panel support semantics so effective support is based on usable behavior on the current device/runtime, not raw API presence alone.
- Introduce shared device-type heuristics so mobile and touch-tablet false positives are classified consistently across support detection and adjacent device-aware UI flows.
- Require toolbar action behavior to avoid dead-click states when side panel opening is unavailable or becomes unreliable at runtime.
- Require direct side-panel entry points to use the same fallback behavior, while hiding popup-side side-panel affordances when support is already known to be unavailable.
- Preserve the existing non-goal that persisted user preference should not be auto-rewritten just because the current device cannot open side panel.

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- `sidepanel-support-fallback`: expand the requirement set to cover mobile/runtime false positives, effective fallback behavior after observed open failures, and direct side-panel entry points.

## Impact

- Affected specs: `openspec/specs/sidepanel-support-fallback/spec.md`
- Likely affected code: `src/utils/browser/browserApi.ts`, `src/utils/browser/device.ts`, `src/utils/browser/index.ts`, `src/utils/navigation/index.ts`, `src/entrypoints/background/actionClickBehavior.ts`, `src/entrypoints/popup/components/HeaderSection.tsx`, `src/features/BasicSettings/components/tabs/General/ActionClickBehaviorSettings.tsx`
- Supporting code touched by the implementation: `src/entrypoints/popup/App.tsx`, `src/hooks/useAddAccountHandler.ts`, `src/constants/extensionPages.ts`
- Likely affected tests: `tests/utils/browserApi.test.ts`, `tests/utils/browser.test.ts`, `tests/utils/navigation.test.ts`, `tests/entrypoints/background/actionClickBehavior.test.ts`, `tests/entrypoints/popup/HeaderSection.test.tsx`, `tests/entrypoints/options/ActionClickBehaviorSettings.test.tsx`
