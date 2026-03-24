## Context

The repo already has a shared temp-context entrypoint for browser-backed fallback work:

- `src/utils/browser/tempWindowFetch.ts`: reuse as the caller-side abstraction for cookie-auth and shield-bypass flows; do not add a second public temp-context API.
- `src/entrypoints/background/tempWindowPool.ts`: extend and partially extract the temp-context creation policy here because this module already owns temp-context pooling, window/tab lifecycle, and cleanup.
- `src/utils/browser/browserApi.ts`: extend the existing browser-capability wrapper pattern with a narrow helper for classifying recoverable window-creation failures instead of scattering browser-specific string checks.
- `src/services/apiService/common/utils.ts`: reuse the existing cookie-auth + temp-window fallback pipeline so managed-site callers inherit the new rollback behavior automatically.
- `src/services/managedSites/providers/newApiSession.ts`: reuse the current cookie-auth request path and error handling; do not build a New API-only temp browser transport.
- `src/features/ManagedSiteVerification/loadNewApiChannelKeyWithVerification.ts`, `src/features/ManagedSiteVerification/useNewApiManagedVerification.tsx`, `src/features/ManagedSiteChannels/ManagedSiteChannels.tsx`, and `src/features/KeyManagement/KeyManagement.tsx`: reuse existing verification/retry surfaces and only adjust how unsupported temp-context failures are surfaced.

Today the caller-side temp-context abstraction is already unified, but the background creation path is not fully fallback-aware. In `tempWindowPool`, a missing `browser.windows` API already falls back to tab mode, but a browser that exposes `browser.windows` and then rejects `browser.windows.create(...)` can still fail the request outright. That leaks raw browser behavior into higher-level flows such as shield bypass and hidden New API channel-key loading, even though a normal tab-backed temp context would still be valid for non-incognito work.

This change is cross-cutting because the same background behavior is consumed by temp-window fallback, cookie-auth managed-site requests, and interactive verification retries.

## Goals / Non-Goals

**Goals:**

- Make temp-context acquisition recover from popup-window denial by retrying with a tab-backed temp context when the flow does not require window-only isolation.
- Keep the existing caller-side temp-context entrypoints unchanged so current consumers inherit the fallback behavior without adopting a new transport.
- Surface unsupported window-only cases through structured, localized failures instead of raw browser error text.
- Preserve the current temp-context pooling, reuse, and cleanup ownership inside `tempWindowPool`.
- Ensure New API hidden channel-key reads and verification-assisted retries benefit from the fallback automatically through the shared cookie-auth/temp-context stack.

**Non-Goals:**

- Introduce a new top-level temp-context service or duplicate the existing `tempWindowFetch` abstraction.
- Change temp-window readiness detection, CAP/Turnstile handling, or the existing reuse timeout policy.
- Degrade incognito/private temp-context requests to a normal tab when isolation is required.
- Persist temp-context fallback state, browser-session state, or rollback history to storage.
- Redesign the Managed Verification dialog or Key Management recovery UX beyond the minimum error/guidance updates needed for unsupported cases.

## Decisions

### Decision: Keep the public temp-context entrypoints stable and fix the fallback in the background creation path

The implementation should continue routing callers through `tempWindowFetch` / `tempWindowTurnstileFetch` and improve the rollback logic inside `tempWindowPool`.

Why this approach:

- The repo already has one caller-side abstraction for temp browser work; adding another would duplicate the entrypoint surface without solving the real failure seam.
- `tempWindowPool` already owns context creation, pooling, and cleanup, so the fallback policy belongs beside that ownership logic.
- Consumers such as New API managed verification can inherit the behavior without feature-specific rewiring.

Alternatives considered:

- Add a new generic `tempContextService`: rejected because it would overlap with `tempWindowFetch` and force avoidable call-site churn.
- Patch each consumer separately: rejected because the same browser limitation would continue leaking through every new temp-context caller.

### Decision: Treat popup-window denial as recoverable only for flows that can legally run in a normal tab

When popup or composite window creation fails for a recoverable reason, the system should retry once with a plain tab-backed temp context. Incognito/private temp-context requests must remain windows-only and fail explicitly when windows are unavailable.

Why this approach:

- A normal tab preserves the browser-backed session needed for shield bypass and standard cookie-auth verification flows.
- Falling back from an incognito/private temp context to a normal tab would silently change account/session isolation semantics and could break multi-account flows.
- A single retry keeps the behavior predictable and avoids open-ended fallback loops.

Alternatives considered:

- Always retry with a tab, even for incognito requests: rejected because it changes the security and storage-isolation contract.
- Never retry after `browser.windows.create(...)` fails: rejected because it preserves the current avoidable user-visible failure.

### Decision: Normalize recoverable window-creation failures behind browser API helpers

The implementation should add a narrow helper near `browserApi` that classifies recoverable window-creation failures, including:

- `browser.windows` not being available
- popup/window creation returning no usable window id
- browser errors equivalent to “windows not allowed” or popup creation being blocked

`tempWindowPool` should use that helper to decide whether to retry with a tab or return a structured unsupported error.

Why this approach:

- Browser-specific error strings and API behavior should not be duplicated across background flows.
- Centralizing classification makes the fallback easier to test and safer to reuse for composite-window creation and popup-window creation.

Alternatives considered:

- Match raw error strings directly in `tempWindowPool`: rejected because it spreads browser quirks into a large lifecycle module and is harder to maintain.

### Decision: Keep New API verification flows on the shared cookie-auth/temp-context stack

`newApiSession.ts` should continue using the shared cookie-auth request path so hidden channel-key reads and secure-verification retries pick up the fallback automatically. Feature-layer updates should be limited to mapping any remaining unsupported window-only failures to localized guidance instead of raw window errors.

Why this approach:

- The problem is transport-level, not New API-specific business logic.
- Reusing the shared pipeline preserves existing session, retry, and redaction behavior.
- It keeps New API verification documentation accurate without creating a second implementation path for browser-backed requests.

Alternatives considered:

- Build a New API-specific tab/window recovery flow in `newApiSession.ts`: rejected because it would duplicate shared temp-context behavior and drift from other consumers.

### Decision: Return structured fallback outcomes for unsupported cases

When rollback is impossible, the background path should report a stable reason code or equivalent structured error that higher-level callers can translate, log, and test against without depending on raw browser text.

Why this approach:

- Structured failures let UI surfaces show localized guidance such as “browser window creation is unavailable for this flow” instead of vendor-specific messages.
- Tests can assert stable error categories even if browser wording changes.

Alternatives considered:

- Preserve raw browser errors end-to-end: rejected because it is brittle, not localized, and leaks implementation details into user-facing flows.

## Risks / Trade-offs

- [Tab fallback may be more visible than a minimized popup] -> Keep existing suppress/minimize behavior where possible and only use tab fallback when popup creation is unavailable.
- [Browser error wording varies across platforms] -> Centralize classification and back it with targeted tests for representative failure shapes instead of relying on one exact string.
- [A plain tab cannot replace incognito/private isolation] -> Fail explicitly for window-only requests and do not silently change the isolation contract.
- [Fallback metadata could accidentally expose sensitive URLs or session details] -> Reuse existing sanitized logging helpers and limit new metadata to reason codes and mode switches.
- [Consumers may still show generic failure copy if they do not recognize the structured error] -> Update the current New API verification and real-key-loading surfaces that already handle recoverable retry failures.

## Migration Plan

1. Extend `browserApi` with a helper that classifies recoverable window-creation failures.
2. Extract a small mode-selection / rollback helper inside `tempWindowPool` so popup-window and composite-window creation share the same fallback policy.
3. Update temp-context acquisition paths to retry once with a plain tab when rollback is allowed and to emit structured unsupported failures when it is not.
4. Ensure shared cookie-auth callers continue using `tempWindowFetch` so managed-site New API requests inherit the new behavior automatically.
5. Update the affected verification/key-loading surfaces to map unsupported fallback failures to localized guidance where a raw browser error could still surface.
6. Add targeted tests for popup-denied rollback, windows-only unsupported failures, and managed-site hidden-key retry behavior that depends on the shared temp-context path.

Rollback is code-only: remove the recovery helper and revert the temp-context creation policy to its current direct-fail behavior.

## Open Questions

None for the spec-ready design. If real-world reports show additional browser-specific popup-denial signatures, a follow-up patch can widen the classifier without changing the caller contract.
