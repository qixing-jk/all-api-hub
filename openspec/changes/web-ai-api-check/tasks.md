## 1. Repo Recon & Reuse Plan

- [x] 1.1 Review existing content overlay root used by Redemption Assist (`entrypoints/content/redemptionAssist/uiRoot.ts`, `entrypoints/content/redemptionAssist/components/ContentReactRoot.tsx`, `entrypoints/content/redemptionAssist/components/RedemptionToaster.tsx`)
- [x] 1.2 Review existing verification UX + probe runner to reuse (`components/VerifyApiDialog/index.tsx`, `services/aiApiVerification/*`)
- [x] 1.3 Review existing OpenAI-compatible model list implementation + URL helpers (`services/apiService/openaiCompatible/*`, `utils/url.ts`)
- [x] 1.4 Review existing whitelist helper and whitelist-editor UI pattern (`utils/redemptionAssistWhitelist.ts` and related options UI)

## 2. Runtime Actions, Types, and Message Contracts

- [x] 2.1 Add ApiCheck runtime action prefix + actions (e.g. `apiCheck:contextMenuTrigger`, `apiCheck:shouldPrompt`, `apiCheck:fetchModels`, `apiCheck:runProbe`) to the canonical registry (`constants/runtimeActions.ts`)
- [x] 2.2 Define typed payloads/responses for ApiCheck runtime messages (request/response DTOs), including sanitized error/result shapes
- [x] 2.3 Add/extend a unit test that asserts runtime action IDs remain unique (per `openspec/specs/runtime-message-actions/spec.md`)

## 3. Preferences: Auto-Detect Toggle + Whitelist Patterns

- [x] 3.1 Add new preference node with safe defaults in `services/userPreferences.ts` (auto-detect disabled by default; whitelist empty)
- [x] 3.2 Reuse `isUrlAllowedByRegexList` for whitelist evaluation and ensure invalid patterns are treated as non-matching
- [x] 3.3 Add storage read/write helpers (or extend existing preference helpers) needed by background and options UI

## 4. Background: Context Menu Entry (Manual Trigger)

- [x] 4.1 Update `entrypoints/background/contextMenus.ts` to add a new “AI API Check” menu item without removing other menus (do not `removeAll()` in a way that breaks Redemption Assist)
- [x] 4.2 Implement menu click handler that sends a message to the active tab content script with `{ selectionText, pageUrl }`
- [x] 4.3 Add manifest i18n strings for the new context menu title (`public/_locales/*/messages.json`)

## 5. Background: ApiCheck Runtime Handlers (Network Work)

- [x] 5.1 Implement `apiCheck:shouldPrompt` handler: checks auto-detect enabled + whitelist match for the given `pageUrl`
- [x] 5.2 Implement `apiCheck:fetchModels` handler for OpenAI/OpenAI-compatible: normalize base URL and request `GET <base>/v1/models` (avoid `/v1/v1/models`)
- [x] 5.3 Implement `apiCheck:runProbe` handler: run one `services/aiApiVerification` probe for the selected `apiType`/inputs and return per-probe results
- [x] 5.4 Ensure all background errors/results are sanitized (no raw API keys) and any debug logging uses only masked previews (or none)

## 6. Content: Extraction + Normalization Utilities (Pure)

- [x] 6.1 Implement a pure extractor that parses `baseUrl` and `apiKey` from free-form text (selection/paste) and returns best-effort candidates
- [x] 6.2 Implement base URL normalization that preserves subpaths and avoids duplicating `/v1` for OpenAI-compatible requests
- [x] 6.3 Add unit tests for extractor + normalization (common formats, false positives, missing pieces, `/v1` duplication cases)

## 7. Content: UI Host (Shadow DOM) + Modal UX

- [x] 7.1 Extend the existing content React root to render an always-mounted ApiCheck modal host inside the Shadow DOM (keep Redemption Assist toaster working)
- [x] 7.2 Build the centered “AI API Check” modal UI (Shadow DOM-safe) with editable fields: `baseUrl`, `apiKey` (masked by default), `apiType`, `modelId`
- [x] 7.3 Add “Re-extract” action to rerun extraction on the current text and update candidate fields without blocking manual edits
- [x] 7.4 Add “Fetch models” action shown only for OpenAI/OpenAI-compatible types and present returned model IDs for selection
- [x] 7.5 Add “Test” action that calls background `apiCheck:runProbe` and displays per-probe results (VerifyApiDialog-like layout, sanitized errors)

## 8. Content: Manual Trigger Wiring

- [x] 8.1 Add content message handler for `apiCheck:contextMenuTrigger` to open the centered modal
- [x] 8.2 Ensure manual trigger always opens the modal even when extraction yields no credentials (user can paste/edit and retry)

## 9. Content: Auto-Detect (Opt-in) + Top-Right Confirmation + Cooldown

- [x] 9.1 Add auto-detect entrypoint (initially based on copy events): extract from user action text and only proceed when both `baseUrl` and `apiKey` are present
- [x] 9.2 Gate auto-detect via `apiCheck:shouldPrompt` (auto-detect must be disabled by default and whitelist-gated)
- [x] 9.3 Show a top-right confirmation toast for auto-detect; open centered modal only after user confirms
- [x] 9.4 Implement per-page cooldown after dismiss/complete to avoid repeated prompting

## 10. Options UI: Configure Auto-Detect + Whitelist

- [x] 10.1 Add an Options section for Web AI API Check: auto-detect toggle + whitelist editor (one RegExp per line)
- [x] 10.2 Surface invalid patterns safely (no crashes; clearly marked invalid; treated as non-matching)
- [x] 10.3 Add UI i18n keys for all copy (`locales/*/*.json`)

## 11. Secret Handling, Documentation, and QA

- [x] 11.1 Ensure API keys are never persisted by default and never logged raw (UI masking + background sanitization)
- [x] 11.2 Add concise help copy in Options UI describing manual vs auto-detect behavior and privacy expectations
- [x] 11.3 Run quality gates: `pnpm lint`, `pnpm format:check`, `pnpm compile`, and targeted `pnpm test` runs

## 12. Tests & Coverage Plan

- [x] 12.1 Add unit tests for background handlers (`shouldPrompt`, `fetchModels`, `runProbe`) using the existing Vitest + MSW setup
- [x] 12.2 Add component tests for the modal critical paths (manual open with empty inputs; re-extract; fetch models success/failure; test shows sanitized errors)
- [x] 12.3 If global coverage remains far below 90%, document the gap and propose an incremental plan (raise thresholds over time + expand tests around adjacent modules touched by this change)

### Coverage gap & incremental plan

This repo's current Vitest global coverage thresholds are **5%** (see `vitest.config.ts`), so reaching ≥ 90% overall coverage is not realistic within this single feature change.

Proposed incremental plan:

1. **Keep raising global thresholds gradually** (e.g., +2–5% per milestone) once the suite is stable; avoid big jumps that would block unrelated work.
2. **Expand tests around adjacent modules touched by this change**:
   - `entrypoints/background/contextMenus.ts` (menu wiring and message payloads)
   - `entrypoints/background/runtimeMessages.ts` (prefix routing for ApiCheck)
   - `services/userPreferences.ts` + `contexts/UserPreferencesContext.tsx` (new preference node + update helpers)
3. **Add scenario-level tests** for auto-detect gating/cooldown and modal open/close behavior (beyond the current component-level assertions).
4. **Track gaps by include list** in `vitest.config.ts` and prioritize high-risk folders first (services/utils), then UI components.
