## Context

All API Hub already treats self-managed backends through a shared managed-site contract in `src/services/managedSites/managedSiteService.ts`. Existing providers such as New API, Done Hub, Veloera, Octopus, and AxonHub implement the same high-level channel operations while hiding backend-specific API differences behind provider modules.

Claude Code Hub exposes a generated management API at `/api/actions/{module}/{action}`. Its managed inventory object is named a provider, not a channel, but the functional surface needed for the MVP exists through provider actions:

- `providers/getProviders`
- `providers/addProvider`
- `providers/editProvider`
- `providers/removeProvider`

Claude Code Hub management auth supports `auth-token` cookie auth and `Authorization: Bearer <token>`. Using bearer auth is the better extension integration point because it avoids cross-origin cookie state and lets users configure either an admin token or a copied auth token as a stored credential.

Nearest existing patterns to reuse or extend:

- Reuse `ManagedSiteService` in `src/services/managedSites/managedSiteService.ts` rather than creating a parallel "provider management" UI path.
- Reuse managed-site config resolution helpers in `src/services/managedSites/utils/managedSite.ts`, extending them for Claude Code Hub.
- Reuse the shared channel table and dialog in `src/features/ManagedSiteChannels/` and `src/components/dialogs/ChannelDialog/`, extending string-type support already needed by AxonHub.
- Reuse `fetchTokenScopedModels`/`fetchManagedSiteAvailableModels` for import model prefill from the source account token.
- Reuse channel comparison helpers in `src/services/managedSites/utils/channelMatching.ts` where possible, with Claude Code Hub-specific treatment for masked keys.

## Goals / Non-Goals

**Goals:**

- Add `claude-code-hub` as a managed-site type with localized labels and persisted configuration.
- Let users validate Claude Code Hub admin access from settings.
- Let users list, search, create, update, and delete Claude Code Hub providers from the managed-site channel page.
- Let users import an existing All API Hub account token as a Claude Code Hub provider.
- Map Claude Code Hub provider records into the shared managed-site channel row shape without leaking raw credentials.
- Preserve provider secrets during edit when the current row only contains a masked key.

**Non-Goals:**

- Bulk channel migration to or from Claude Code Hub.
- Managed-site model sync for Claude Code Hub providers.
- Model redirect or `model_mapping` style workflows for Claude Code Hub.
- Revealing existing Claude Code Hub provider keys unless upstream exposes a supported action route for unmasked keys.
- Full coverage of every Claude Code Hub provider option in the first pass; unsupported advanced fields should be preserved or omitted safely rather than surfaced as editable controls.

## Decisions

### Decision: Model Claude Code Hub as a managed-site provider

Add a new managed-site type, for example `CLAUDE_CODE_HUB = "claude-code-hub"`, and route it through `getManagedSiteServiceForType`.

Rationale: The user-facing workflow is the same as other managed sites: configure admin credentials, manage channels/providers, and import account tokens. Reusing the managed-site contract keeps Key Management import, channel dialogs, and page navigation consistent.

Alternative considered: Build a separate Claude Code Hub provider management page. This would duplicate channel CRUD UI and create a second import workflow for the same user job.

### Decision: Add a dedicated Claude Code Hub API adapter

Create a small Claude Code Hub action client that posts JSON to `/api/actions/providers/<action>` and parses the action result shape:

- success: `{ ok: true, data?: ... }`
- failure: `{ ok: false, error?: string, errorCode?: string, errorParams?: ... }`

The client should send `Authorization: Bearer <configured token>` and `Content-Type: application/json`.

Rationale: Existing New API-compatible helpers target `/api/channel/*` and response shapes with `success`/`message`. Claude Code Hub actions use different paths, auth, payload names, and result envelopes, so a dedicated adapter avoids brittle branching in common New API code.

Alternative considered: Force Claude Code Hub through `apiService/common`. This would be misleading because Claude Code Hub is not New API-compatible for admin channel management.

### Decision: Store only the Claude Code Hub fields required for management

Persist a Claude Code Hub config with:

- `baseUrl`
- `adminToken`

Do not ask users for `userId` in the Claude Code Hub settings UI. If the generic `ManagedSiteConfig` return shape requires `userId`, the Claude Code Hub service can return a stable placeholder and ignore it internally.

Rationale: Claude Code Hub action auth does not require the New API-style user id. Avoiding a meaningless user id field keeps configuration understandable.

Alternative considered: Reuse the New API config shape exactly. This would reduce type work but would expose a confusing and unused user id.

### Decision: Map Claude Code Hub providers to managed-site channel rows

Normalize provider display records into the shared `ManagedSiteChannel` shape:

- `id` -> channel id
- `name` -> channel name
- `providerType` -> channel `type`
- `url` -> `base_url`
- `maskedKey` -> `key`
- `allowedModels` exact string rules -> comma-separated `models`
- `groupTag` -> `group`
- `isEnabled` -> enabled/disabled channel status
- `weight` and `priority` -> existing channel row fields
- raw provider data -> an internal `_claudeCodeHubData` extension when needed

Rationale: The shared table and dialog already operate on managed-site channel rows. A normalization layer isolates Claude Code Hub naming differences from UI components.

Alternative considered: Expand the table to understand multiple row shapes. That would spread backend-specific checks through UI code and make future managed-site integrations harder.

### Decision: Use Claude Code Hub provider type strings in the channel dialog

When `managedSiteType = claude-code-hub`, the channel dialog should show Claude Code Hub provider type options:

- `openai-compatible`
- `codex`
- `claude`
- `gemini`

Other upstream provider types such as `claude-auth` and `gemini-cli` are preserved when reading existing providers, but they are not part of Claude Code Hub's regular frontend-supported provider type set today. This add-flow follows the upstream frontend behavior and only exposes the four provider types that Claude Code Hub normally presents in its own UI.

Upstream investigation confirms this is an intentional UI/runtime split rather than a missing enum entry. Claude Code Hub still defines `claude-auth` and `gemini-cli` in its runtime provider type union and continues to handle them in execution-specific logic, but its settings UI marks those two values as internal/non-user-facing and excludes them from the standard provider filter and create-form option lists. Matching that behavior lets All API Hub preserve existing upstream-owned provider records without inventing extra add-flow choices that Claude Code Hub itself does not present to regular users.

For account-token import, default to `openai-compatible`, but allow users to change the type before creating the provider.

Rationale: Provider type affects Claude Code Hub routing. Defaulting to `openai-compatible` covers the common import path, while exposing the type prevents silently creating the wrong provider kind for Codex, Claude, or Gemini backends.

Alternative considered: Infer provider type from the source account. The local account model does not reliably encode enough upstream protocol detail across all site types and forks.

### Decision: Preserve masked provider keys on edit

Claude Code Hub `getProviders` returns masked keys. The adapter must not send a masked key back to `providers/editProvider` as if it were a real secret. On edit:

- If the user leaves the key field unchanged and it is masked/non-usable, omit `key` from the update payload.
- If the user enters a usable replacement key, send `key`.
- If creating/importing a provider, require a usable key.

Rationale: Sending the masked display value as `key` would overwrite and break the provider credential.

Alternative considered: Disable all edits until key reveal is available. That would unnecessarily block safe updates to name, URL, models, type, enablement, priority, weight, and group.

### Decision: Treat duplicate detection as best-effort when provider keys are masked

For imports, exact duplicate detection should use comparable key material only when available. If Claude Code Hub returns only a masked key, the service can use URL and model evidence for review/warning, but it must avoid claiming a hard exact key match from masked data.

Rationale: URL/model matches are useful signals, but they are not sufficient to prove the same credential when multiple keys can target the same upstream base URL.

Alternative considered: Treat URL + models as duplicate. This can block legitimate imports that share a base URL and model set but use different credentials.

## Risks / Trade-offs

- [Risk] Claude Code Hub does not expose unmasked provider keys through the registered action router. -> Mitigation: preserve existing keys on edit and defer key reveal/migration parity until a supported route exists.
- [Risk] Users may choose the wrong Claude Code Hub provider type during import. -> Mitigation: default to `openai-compatible`, expose provider type selection, and localize concise helper text for the type field.
- [Risk] Provider options in Claude Code Hub exceed the shared channel form. -> Mitigation: only map MVP fields, preserve unsupported values from original data where safe, and avoid destructive updates for fields not represented in the form.
- [Risk] Local search over `getProviders` may be inefficient on large provider inventories. -> Mitigation: acceptable for MVP; isolate search in the adapter so a future upstream search action can replace it without UI changes.
- [Risk] Credential leakage through errors or logs. -> Mitigation: redact configured tokens and provider keys in logs, toasts, and mapped errors; reuse existing safe error handling patterns.

## Migration Plan

1. Add the new managed-site type, config defaults, preference update/reset helpers, labels, and settings UI.
2. Add Claude Code Hub provider/API adapter and service routing.
3. Extend channel dialog provider-type options and masked-key update handling for Claude Code Hub.
4. Wire account-token import through the Claude Code Hub service.
5. Add focused tests for configuration validation, action API mapping, CRUD payloads, import payloads, and masked-key edit behavior.

Rollback is straightforward: remove `claude-code-hub` from the selectable managed-site type list and service routing. Persisted Claude Code Hub config can remain ignored without affecting existing managed-site types.

## Open Questions

- Should the first release include a dedicated provider-type selector in the account-token import dialog, or is the existing channel type field sufficient once Claude Code Hub is active?
- Should duplicate URL/model evidence block import with a review dialog, or only show a warning while allowing the user to proceed?
- Is there an upstream plan to expose `getUnmaskedProviderKey` through `/api/actions`; if so, a later change can add safe key reveal and migration support.
