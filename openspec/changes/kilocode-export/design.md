## Context

Issue #364 requests a way to export All API Hub account/token configuration into **Kilo Code** (and Roo Code) settings JSON so users with many sites can avoid manual re-entry in IDE assistants.

Current related building blocks in-repo:

- The options page `entrypoints/options/pages/ImportExport/` already provides export/download flows (internal backup JSON) via blob download.
- The options page `entrypoints/options/pages/KeyManagement/` already knows how to list API tokens via `getApiService(siteType).fetchAccountTokens(...)`.
- Creating a default token when none exist is already implemented via `ensureAccountApiToken(account, displaySiteData)` in `services/accountOperations.ts`.

Constraints and principles:

- Exported payloads contain **API keys in plaintext**; UX must treat them as secrets (no logging, clear warning).
- Token listing is a remote call and can be slow/fail; avoid fetching tokens for dozens of sites up-front.
- Token creation mutates upstream state; must be explicit user action.

Target format:

- Kilo Code (and Roo Code) exported settings include `providerProfiles.apiConfigs` keyed by profile name.
- OpenAI-compatible upstreams are configured via provider `"openai"` with fields like `openAiBaseUrl` (typically ending in `/v1`) and `openAiApiKey`.

## Goals / Non-Goals

**Goals:**

- Add an **Export to Kilo Code** entry point under Key Management token actions (support opening with the current site/token preselected).
- Provide a dialog that lets users select one or more sites and then select one or more API keys per site for export (one provider profile per API key).
- Allow selecting (or entering) a Model ID per exported API key; default to the first upstream model when available.
- Default behavior for sites with zero tokens: **skip**, while offering a “Create default token” action that creates + selects a token for export.
- Provide two output methods in the same flow:
  - Copy `providerProfiles.apiConfigs` JSON snippet to clipboard.
  - Download a full `kilo-code-settings.json` with `providerProfiles`.
- Avoid logging credentials and add clear user-facing warnings about plaintext API keys.

**Non-Goals:**

- Automatically modifying Kilo Code/Roo Code settings (no direct integration with VS Code extensions).
- Exporting full Kilo Code global settings (UI prefs, custom modes, task history, etc.).
- Deep model compatibility validation (beyond listing upstream model IDs and allowing user selection/custom input).
- Mass token creation across many sites; creation is per-site and user-triggered.

## Decisions

### 1) UI placement: Key Management token actions + modal dialog

**Decision:** Add an “Export to Kilo Code” action in Key Management token actions that opens a modal dialog, preselecting the current site/token when available.

**Rationale:** This flow is tightly coupled to API keys. Opening from the token action row avoids an “empty dialog” and makes export discoverable where users already manage keys.

**Alternatives considered:**

- Add under the Import/Export page: matches a “backup tools” mental model, but is less contextual and cannot easily preselect a site/token.
- Add a dedicated new page: more space, but heavier navigation and unnecessary for a single flow.

### 2) Data sources: reuse existing account aggregation and token APIs

**Decision:** In the dialog, load account context via the existing account aggregation hook/service and fetch tokens via `getApiService(siteType).fetchAccountTokens(...)` using account auth.

**Rationale:** Avoids duplicating token-fetch logic and keeps site-type-specific quirks encapsulated in `services/apiService/*`.

**Implementation approach (high level):**

- Use the same account lists used by other pages (display data + underlying account records) so we can:
  - List accounts with user-friendly labels (`DisplaySiteData`).
  - Create tokens when needed using real credentials stored in `SiteAccount` (`ensureAccountApiToken` requires both).
- Maintain per-account token loading state and cache results in component state to avoid repeated requests.

### 3) Token loading strategy: lazy per-account, not “fetch all”

**Decision:** Do not fetch tokens for all sites up-front. Fetch token lists only for selected sites (auto-triggered on selection), with per-site refresh/retry.

**Rationale:** Users may have 40+ sites; doing N remote requests immediately is slow, brittle (WAF/cookies), and feels “stuck”.

**Alternatives considered:**

- Fetch all tokens concurrently with a cap: simpler UX, but still expensive and likely to trigger rate limits and failures.

### 4) No-token accounts: skip by default, explicit “Create default token” action

**Decision:** If a site has no tokens, mark it “skipped” by default and show a “Create default token” button which calls `ensureAccountApiToken` and then refreshes the token list and selects the created token.

**Rationale:** Creating tokens has side effects on the upstream service; doing it automatically violates least surprise and could be undesirable for some users.

### 5) Export format: OpenAI-compatible provider profiles

**Decision:** Generate Kilo Code/Roo Code profiles under `providerProfiles.apiConfigs` with:

- `apiProvider: "openai"`
- `openAiBaseUrl`: account base URL coerced to end with `/v1`
- `openAiApiKey`: selected token key
- `openAiModelId`: selected model id for this API key (Kilo Code typically requires it)
- `id`: generated identifier (per profile)

**Rationale:** This matches Kilo Code/Roo Code “OpenAI Compatible” configuration semantics, and is compatible with the way All API Hub sites are used (OpenAI-style relay endpoints).

**Notes:**

- Base URL normalization should ensure `/v1` suffix without duplicating it (use existing URL helpers rather than ad-hoc string concatenation).
- Profile naming should be stable and collision-resistant:
  - Per API key: `${siteName} - ${tokenName}` (and disambiguate further if needed).

### 6) Output methods: copy snippet + download full settings

**Decision:** Provide two outputs in the same dialog:

1) **Copy snippet**: JSON for `providerProfiles.apiConfigs` only.
2) **Download file**: full JSON containing `providerProfiles` (at minimum `currentApiConfigName` + `apiConfigs`).

**Rationale:** The snippet is safest for users who already have Kilo Code settings and only want to paste/merge. The full file is convenient for first-time setup or “import into Kilo Code”.

**Trade-off:** Kilo Code import will set `currentApiConfigName` from the imported file. The UI should let the user choose which profile name becomes `currentApiConfigName` (or default it to a safe value like `default`) and clearly warn that importing may switch the active profile in Kilo Code.

### 7) Secrets and logging policy

**Decision:** Never log token keys or export JSON content. UI should display token names and metadata, not raw keys, unless a dedicated “reveal” interaction is explicitly added (not required for this change).

**Rationale:** The extension already treats keys as secrets; export functionality must not weaken that posture.

## Risks / Trade-offs

- **[Plaintext keys in output]** → Mitigation: strong warning copy in dialog, require explicit user action to copy/download, and never log content.
- **[Token fetching fails due to auth/WAF]** → Mitigation: per-account lazy loading, retries, surface per-account errors, allow exporting only the accounts that loaded successfully.
- **[Token creation has side effects]** → Mitigation: explicit “Create default token” button (optionally confirm), scoped to a single site.
- **[Large account sets degrade UX]** → Mitigation: add search/filter, bulk select actions, and avoid auto-fetching all tokens.
- **[Kilo Code import switches active profile]** → Mitigation: allow selecting `currentApiConfigName` in exported settings file; document this in UI helper text.

## Migration Plan

- No schema migrations or stored-data changes expected.
- Feature is additive; rollback is simply removing the UI entry point and dialog code.

## Open Questions

- Should we optionally include `openAiHeaders` (e.g., for host header overrides) for certain site types, or keep the first version minimal?
- Should we cache model lists across tokens/sites to reduce repeated `/v1/models` calls in large exports?
- Should the full settings export include `modeApiConfigs` (so modes point to the exported profile), or intentionally omit it to avoid changing user mode mappings?
