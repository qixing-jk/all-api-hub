## Context

The Options UI includes an Account Model List page (`entrypoints/options/pages/ModelList`) where users browse model pricing and can run API verification probes per model (via `VerifyApiDialog`). Today, the UI can indicate model availability by user group (`enable_groups`), but it does not help users determine whether they have an enabled API key/token that is actually permitted to use a specific model (e.g., token model allow-lists). This causes avoidable trial-and-error when verifying/using models.

The project already has mature token UX in Key Management:
- Token inventory loading + empty-state create actions: `features/AccountManagement/components/CopyKeyDialog` + `useCopyKeyDialog`
- Token create/edit form: `entrypoints/options/pages/KeyManagement/components/AddTokenDialog` (supports model limits via a multi-select)

This change adds a model→key compatibility layer and a guided “select or create a key for this model” flow directly from the Model List page, reusing existing token creation/edit primitives.

## Goals / Non-Goals

**Goals:**
- Provide a per-model action in the Model List UI that:
  - checks whether a given account has any **enabled** token that can use the selected model
  - guides the user to **select** a compatible token when one exists
  - guides the user to **create** a compatible token when none exists (explicit user intent)
- Reuse existing token creation capabilities (`AddTokenDialog`, default-token provisioning) to avoid duplicate forms and inconsistent behavior.
- Keep API keys/tokens treated as secrets (no raw key in logs/toasts; sanitize error summaries).
- Support both “single account” and “all accounts” Model List modes (model items can be associated with different accounts).

**Non-Goals:**
- No new backend APIs; use existing token inventory + token create/update endpoints per site type.
- No automatic token creation during model list rendering; creation happens only after explicit user action.
- No attempt to perfectly model all upstream permission systems (e.g., server-side user group policies) beyond what we can infer from token fields; uncertain cases are handled via UX messaging and “verify” actions.

## Decisions

1) **Add a model-level “Key…” action on model items**

- Add an IconButton in the Model item actions area (currently “copy model name”, “verify API”, “verify CLI support” live in `ModelItemHeader`).
- Clicking it opens a dedicated modal (working name: `ModelKeyDialog`) with the context: `{ account, modelId, modelEnableGroups }`.
- This dialog is the entry point for:
  - compatibility check (“do we have a usable token?”)
  - token selection
  - token creation shortcuts

Rationale: Users need this action where they are making model decisions (Model List), and the Model List already has per-item actions and per-item account context (especially in “all accounts” mode).

2) **On-demand token inventory loading, scoped to the selected account**

- `ModelKeyDialog` loads tokens only when opened, for the specific account associated with the clicked model item.
- Use the same request wiring as existing flows (`getApiService(account.siteType).fetchAccountTokens(...)`), and follow the existing “eligibility gating” rules for whether token creation is supported (disabled accounts, Sub2API, authType=none, missing credentials).
- Prefer extracting shared logic from `useCopyKeyDialog` where possible (or reuse it directly with small extensions) so that load/create/refresh behaviors remain consistent.

Rationale: Token fetch is potentially expensive and should not run for every model item. Per-account on-demand fetch minimizes network traffic and avoids slowing down Model List rendering.

3) **Define a local, conservative token→model compatibility predicate**

Introduce a small pure function (e.g., `isTokenCompatibleWithModel(token, model)` in `utils/` or `services/`) used by `ModelKeyDialog` (and optionally later by badges/indicators):

- Token must be enabled: `token.status === 1`
- Token group must be able to use the model:
  - Normalize empty/undefined token groups to `default`
  - Require `model.enable_groups` to include the token group
- If the token exposes a model allow-list:
  - When `model_limits_enabled === true`, parse `model_limits` as a comma-separated list and treat it as an allow-list
  - For site variants that return `models` instead of `model_limits`, parse `models` similarly
- Compatibility rules:
  - If no allow-list is enabled/present → token is considered compatible with all models (subject to group gating)
  - If allow-list is enabled/present → token is compatible only when the parsed list contains `modelId`

Rationale: This matches how model availability is expressed in pricing (`enable_groups`) and how tokens are created in the existing UI (`model_limits` is persisted as a comma-separated string), while remaining robust to partial data differences across site variants.

4) **Selection-first UX, then create when needed**

`ModelKeyDialog` renders based on `compatibleTokens`:

- **If one or more compatible tokens exist**
  - show a selectable list (radio/select) of compatible tokens
  - require the user to pick one (default-select the first enabled token)
  - provide actions:
    - “Copy key” (optional but aligns with user intent to “use” the model elsewhere)
    - “Verify with this key” (optional enhancement: launch verification with the chosen token)
    - “Create another key” (opens `AddTokenDialog` with model preset)

- **If no compatible tokens exist**
  - show an empty-state explaining “no usable keys for this model”
  - provide explicit create actions:
    - Quick create: use default token provisioning (`generateDefaultTokenRequest()` + `createApiToken`)
    - Custom create: open `AddTokenDialog` with the selected model prefilled into model limits (see Decision 5)
  - after successful create, refresh token inventory and re-run compatibility:
    - if exactly one compatible token exists → auto-select it (and optionally auto-copy, mirroring `CopyKeyDialog`’s behavior)
    - if multiple exist → keep list visible and prompt selection
    - if still none → show a durable error message (“created but no compatible key found”) and keep create actions available

Rationale: This matches established UX in `CopyKeyDialog` (actionable empty-state, explicit intent, refresh-after-create rules) while tailoring the “compatibility” definition to a specific model.

5) **Extend `AddTokenDialog` to support prefilled model limits for “create key for model”**

To avoid duplicating the token form, add an optional prop to `AddTokenDialog`/`useTokenForm` to prefill:
- `name` (suggested default like `model <modelId>` or `<modelId> (model)`; still editable)
- `modelLimitsEnabled = true`
- `modelLimits = [modelId]`
- `group` (best-effort): prefer `default` when it can use the model; otherwise pick the first group in `enable_groups`

The prefill should apply only in create mode (not when editing an existing token).

Rationale: This enables a one-click “create key for this model” flow from Model List using the existing validated token creation UI, while still letting users adjust advanced fields (quota, expiry, group, IP allow-list, multi-model allow-list).

6) **Localization and secret handling**

- All new UI strings live under the relevant i18n namespaces (likely `modelList`, potentially `ui` for shared dialog phrases).
- No raw token values in toasts; copy actions should show generic success messages.
- Errors produced by token inventory/creation must be sanitized using existing helpers/patterns (`getErrorMessage`, `toSanitizedErrorSummary` where applicable).

## Risks / Trade-offs

- **[Compatibility predicate is incomplete]** → Some upstream deployments may enforce additional constraints (group policies, server-side model routing) not expressible via token fields.  
  Mitigation: keep the predicate conservative (token enable + token group + allow-list), surface verification as a follow-up action, and phrase empty-state messaging as “no compatible key detected” rather than an absolute guarantee.

- **[Token field variance across site types]** → Some variants may use `models` instead of `model_limits`, or omit `model_limits_enabled`.  
  Mitigation: support both fields; default to “unrestricted” when allow-list data is missing; add tests for parsing edge cases (empty strings, whitespace, duplicates).

- **[UX complexity / modal proliferation]** → Adding a new modal could clutter the Model List experience.  
  Mitigation: reuse existing dialogs (`AddTokenDialog`) and keep the new modal focused on compatibility + selection, not full token management.

- **[All-accounts mode performance]** → If we later add per-item indicators, naive implementations could fetch tokens for many accounts.  
  Mitigation: keep compatibility checks on-demand (dialog-open) initially; if indicators are needed, cache token inventories per account and require explicit “check keys” action.

## Migration Plan

- No data migration expected. This is an additive UI feature reusing existing persisted token and account structures.
- Rollback is removing the Model List action and dialog; no schema changes required.

## Open Questions

- In the “create” flow, should we enforce that the created token must include the selected model in its allow-list (e.g., prevent disabling model limits), or is a prefill + user confirmation adequate?
- Should the dialog auto-copy the key after a successful create when only one compatible key exists (mirroring CopyKeyDialog), or should it always require an explicit copy action?
