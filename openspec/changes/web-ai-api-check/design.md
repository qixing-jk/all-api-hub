## Context

All API Hub already has two relevant building blocks:

- A content-script overlay system (Shadow DOM + React root) used by Redemption Assist for top-right toasts and in-page prompts.
- A centered, probe-driven verification UI (VerifyApiDialog) that reuses `services/aiApiVerification/*`, but is currently only available inside extension pages (options).

Users frequently encounter API relay credentials (base URL + API key) while browsing provider dashboards, docs, or chat messages. Switching to extension pages to validate endpoints/models is slow, and automatic background scanning is undesirable from a privacy/UX standpoint.

This change introduces an in-page API check flow with:

- Manual trigger via a context-menu entry (always available, always opens UI).
- Optional auto-detect (default off), gated by a user-configured URL whitelist, and requiring an explicit top-right confirmation before opening the centered modal.

Constraints and considerations:

- Chromium MV3 background is a service worker; Firefox ships MV2. The implementation must work in both and avoid DOM-only APIs in background paths.
- API keys are secrets. The UI and logging must avoid leaking them (mask in UI, redact in errors/logs).
- Content scripts should avoid cross-origin fetch due to CORS; background/extension pages have host permissions (`<all_urls>`).
- The in-page UI must render with extension styling; portaling outside the Shadow DOM can break Tailwind styling.

## Goals / Non-Goals

**Goals:**

- Provide a manual right-click flow that opens a centered in-page modal even when extraction is incomplete, allowing users to paste/edit and re-run extraction.
- Support editing of `baseUrl` (including path), `apiKey`, `apiType` (OpenAI-compatible / OpenAI / Anthropic / Google), and `modelId`.
- Reuse the existing `services/aiApiVerification` probes to run checks for all supported `apiType`s.
- For OpenAI/OpenAI-compatible, provide a “fetch model list” helper (`/v1/models`) to ease picking `modelId`.
- Implement auto-detect (default off) that:
  - Only runs on user-configured whitelist URL patterns.
  - Shows a top-right confirmation toast before opening the modal.
  - Only triggers when both a URL and an API key can be extracted from a user action (e.g., copy).

**Non-Goals:**

- No DOM-wide scraping or automatic scanning of entire pages.
- No automatic importing/saving of extracted credentials into account storage (future enhancement).
- No guarantee of model listing for Anthropic/Google (initially rely on user-provided `modelId` for those types).
- No new WAF-bypass techniques beyond existing temp-window fallback behavior already embedded in shared request helpers.

## Decisions

### 1) UI architecture: reuse existing content Shadow DOM root; add a dedicated modal host

**Decision:** Extend the existing content-script React root (currently rendering the headless toaster) to also render an always-mounted “API Check Modal Host” that can display a centered overlay within the Shadow DOM.

**Rationale:**

- Keeps styling consistent (Tailwind CSS is loaded in the Shadow DOM root via `~/styles/style.css`).
- Allows top-right confirmation toasts (auto-detect) and the centered modal (manual + confirmed auto-detect) to coexist.
- Avoids relying on Headless UI portals that may escape the Shadow DOM and lose styling.

**Alternatives considered:**

- Reuse `components/ui/Dialog/Modal` directly in content scripts: risk of portal escaping Shadow DOM and breaking styles.
- Use toast-based “fake modal” in the toaster container: hard to truly center and to handle backdrop/focus cleanly.
- Open extension pages (popup/options) instead of in-page UI: conflicts with requirement to stay on the original webpage.

### 2) Run network operations in background; content script only orchestrates UI

**Decision:** Execute “fetch models” and “run probe” operations in the background script (via runtime messaging). Content scripts collect inputs and display results.

**Rationale:**

- Avoids CORS limitations for content-script fetch.
- Centralizes sensitive network execution and error redaction.
- Enables reuse of existing services (`services/apiService/openaiCompatible` and `services/aiApiVerification`) without duplicating request logic.

**Alternatives considered:**

- Run verification in content script: likely CORS failures and larger content bundle surface.
- Run verification in options/popup: violates “stay on original webpage”.

### 3) Runtime message contract: introduce an ApiCheck namespace

**Decision:** Add `RuntimeActionPrefixes.ApiCheck = "apiCheck:"` and a small set of actions:

- `apiCheck:contextMenuTrigger` (background → content): open the modal with `selectionText` + `pageUrl`.
- `apiCheck:shouldPrompt` (content → background): auto-detect gating decision for the current `pageUrl`.
- `apiCheck:fetchModels` (content → background): return `/v1/models` results for OpenAI/OpenAI-compatible.
- `apiCheck:runProbe` (content → background): run one `aiApiVerification` probe and return the result (sanitized).

Background routing is handled similarly to existing services (e.g., Redemption Assist) via `entrypoints/background/runtimeMessages.ts`.

**Rationale:**

- Keeps on-the-wire contracts stable and centrally defined.
- Allows the content script to remain thin and not depend on preference storage reads for gating.

### 4) Manual trigger always opens modal; extraction is best-effort

**Decision:** On manual trigger, always open the centered modal. Pre-fill inputs by best-effort extraction from the selected/pasted text; if extraction is partial, leave fields editable and show a “re-extract” action.

**Rationale:**

- Matches the requirement: “仍然弹出，让用户二次再修改”.
- Prevents silent failures and reduces user friction.

### 5) Auto-detect: whitelist-gated + explicit top-right confirmation

**Decision:** Auto-detect remains opt-in (default off). When enabled:

- It only runs on pages whose URL matches user-configured whitelist patterns.
- It only triggers when both `baseUrl` and `apiKey` can be extracted from a user action (initially: copy event).
- It shows a top-right confirmation toast. Only after the user confirms does it open the centered modal.
- Implement a per-page cooldown (e.g., “don’t prompt again for N seconds”) to avoid repeated toasts during active editing/copying.

**Rationale:**

- Minimizes false positives and respects user intent/privacy.
- Mirrors the “外部确认” interaction pattern requested.

### 6) Preferences shape: new `webAiApiCheck` config in userPreferences

**Decision:** Add a new preferences node (default enabled, auto-detect disabled) under `services/userPreferences.ts`, for example:

- `webAiApiCheck.enabled: true`
- `webAiApiCheck.autoDetect.enabled: false`
- `webAiApiCheck.autoDetect.urlWhitelist.patterns: string[]` (user-managed)

The options page should expose:

- Auto-detect toggle
- Whitelist editor (one RegExp pattern per line), reusing the whitelist editor UX pattern from Redemption Assist

Whitelist evaluation should reuse `utils/redemptionAssistWhitelist.ts#isUrlAllowedByRegexList` to avoid duplicated regex parsing behavior.

### 7) Model list support: OpenAI/OpenAI-compatible only (initially)

**Decision:** The modal will show a “Fetch models” action only for OpenAI/OpenAI-compatible types and will call the existing `/v1/models` helper. For Anthropic/Google, the UI will require the user to input `modelId` (with a clear hint).

**Rationale:**

- Existing model-list code already targets OpenAI-compatible endpoints.
- Avoids speculative/incorrect list-model behavior for other API families.

### 8) Secret handling: mask in UI; redact on background boundary

**Decision:**

- UI masks API keys by default (e.g., show first/last 4 chars).
- Background responses return sanitized error summaries using `services/aiApiVerification/utils.ts#toSanitizedErrorSummary` with the apiKey included in the redaction list.
- No persistent storage of extracted credentials by default.
- Logs must not include raw keys; if logging is necessary, log only masked previews and stable metadata (apiType, baseUrl origin).

## Risks / Trade-offs

- **[Risk] Background execution of AI SDK probes in MV3 service worker may have environment edge cases** → Mitigation: keep probe runner pure (no DOM APIs), use dynamic imports for probe modules if needed, add a small integration test that runs a mocked probe call path under the test environment.
- **[Risk] Bundle size increases due to AI SDK inclusion in background** → Mitigation: lazy-load probe runners/services when the ApiCheck message handler is invoked (dynamic import boundaries).
- **[Risk] False positives or user annoyance from auto-detect** → Mitigation: auto-detect is default off, whitelist-gated, requires explicit confirmation, and uses cooldown.
- **[Risk] UI rendering issues due to Shadow DOM quirks** → Mitigation: keep modal rendering inside the Shadow DOM root and avoid portal-to-body dependencies; test on a few representative sites.
- **[Risk] Sensitive data leakage** → Mitigation: strict masking/redaction, avoid storing raw keys, and avoid emitting raw key strings across logs/toasts.

## Migration Plan

- Add new preferences with safe defaults:
  - Feature enabled, manual trigger available.
  - Auto-detect disabled and whitelist empty.
- No storage migration needed; new preference keys are additive.
- Rollback: removing the feature is safe because it does not change stored account schemas.

## Open Questions

- Should the modal offer an explicit “Save as account” action in a later iteration (with user confirmation and secure handling)?
- What should the default probe set be for a one-click “quick test” (e.g., `text-generation` only vs. full suite)?
- Should we add additional manual triggers beyond context menu (e.g., keyboard shortcut command) in a later iteration?
