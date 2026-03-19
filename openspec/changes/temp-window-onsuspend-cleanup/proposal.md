## Why

Temporary shield-bypass tabs or popup windows can remain open when the Chromium MV3 background service worker exits before the delayed temp-context cleanup path finishes. This creates visible orphan pages for flows such as auto check-in and is worth addressing now with the lowest-cost improvement that fits the existing architecture.

## What Changes

- Add a best-effort `runtime.onSuspend` cleanup hook in the background layer for temp-window fallback contexts.
- Expose a background-temp-window cleanup entrypoint that closes any currently tracked temp contexts when suspend cleanup runs.
- Keep the existing delayed close and reuse behavior unchanged during normal request completion.
- Add logging around suspend-triggered cleanup so future issue reports can confirm whether the fallback executed.
- Explicitly exclude external custom check-in pages from this change because those tabs/windows are user-facing and are not owned by the temp-window pool.

## Capabilities

### New Capabilities
None.

### Modified Capabilities
- `temp-window-fallback`: temp contexts gain a best-effort suspend-time cleanup path so tracked temporary tabs/windows are less likely to remain open after the background worker unloads.

## Impact

- Affected code: `src/entrypoints/background/index.ts`, `src/entrypoints/background/tempWindowPool.ts`, `src/utils/browser/browserApi.ts`
- Affected behavior: MV3 background suspend handling for temp-window fallback contexts
- Validation impact: background-entrypoint and temp-window-pool tests need targeted coverage for suspend-triggered cleanup behavior
