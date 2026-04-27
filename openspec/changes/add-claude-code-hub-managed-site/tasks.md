## 1. Recon And Scope

- [ ] 1.1 Inspect and document the existing managed-site extension points to reuse: `src/constants/siteType.ts`, `src/services/managedSites/managedSiteService.ts`, `src/services/managedSites/utils/managedSite.ts`, existing providers under `src/services/managedSites/providers/`, managed-site settings tabs, `ManagedSiteTypeSwitcher`, `ManagedSiteChannels`, and `ChannelDialog`.
- [ ] 1.2 Inspect existing test patterns for managed-site service routing, provider adapters, settings config, channel dialog behavior, and account-token import before adding new tests.
- [ ] 1.3 Confirm the current Claude Code Hub action API contract from source or docs for `providers/getProviders`, `providers/addProvider`, `providers/editProvider`, and `providers/removeProvider`, including auth header behavior and response envelope.

## 2. Managed-Site Type And Preferences

- [ ] 2.1 Add the `claude-code-hub` site type constant and include it in `ManagedSiteType` without changing existing managed-site values.
- [ ] 2.2 Add a Claude Code Hub config type and defaults containing base URL and admin/auth token only.
- [ ] 2.3 Extend user preferences defaults, persistence typing, update/reset helpers, and managed-site config resolution for Claude Code Hub.
- [ ] 2.4 Extend managed-site label, message-key, target-option, config validation, and config-missing helpers for Claude Code Hub.
- [ ] 2.5 Add or update preference migration/default handling so existing users receive an empty Claude Code Hub config safely.

## 3. Settings UI And Localization

- [ ] 3.1 Add Claude Code Hub to the managed-site type selector while preserving all existing managed-site options.
- [ ] 3.2 Add a Claude Code Hub settings section for base URL and admin/auth token, with no New API-style user id input.
- [ ] 3.3 Add credential validation UI that calls the Claude Code Hub managed-site validation service and reports localized success/failure.
- [ ] 3.4 Add localized strings for Claude Code Hub labels, settings fields, validation messages, config-missing messages, unsupported-feature messages, and secret-safe fallbacks across supported locales.

## 4. Claude Code Hub API Adapter

- [ ] 4.1 Add a Claude Code Hub action API client that posts to `/api/actions/providers/<action>` with `Authorization: Bearer <token>` and parses `{ ok, data, error }` responses.
- [ ] 4.2 Add adapter functions for listing, creating, updating, and deleting Claude Code Hub providers.
- [ ] 4.3 Add safe error normalization and logging that redacts configured tokens and provider keys.
- [ ] 4.4 Add provider record normalization from Claude Code Hub provider data to `ManagedSiteChannel` rows, preserving original provider data when needed for safe updates.
- [ ] 4.5 Add payload builders that map shared channel form data to Claude Code Hub provider create/update payloads, including provider type, URL, key, enabled state, models, priority, weight, and group tag.

## 5. Managed-Site Service Integration

- [ ] 5.1 Add `src/services/managedSites/providers/claudeCodeHub.ts` implementing `ManagedSiteService` methods for search, create, update, delete, config validation, config retrieval, model fetch, import form preparation, payload building, and best-effort matching.
- [ ] 5.2 Register the Claude Code Hub service in `getManagedSiteServiceForType` and ensure existing managed-site service routing remains unchanged.
- [ ] 5.3 Implement local provider search over `getProviders` results and isolate it so a future upstream search action can replace it without UI changes.
- [ ] 5.4 Implement duplicate detection that uses exact key matching only with comparable key material and treats masked-key URL/model matches as review candidates rather than confirmed duplicates.
- [ ] 5.5 Ensure Claude Code Hub does not expose `fetchChannelSecretKey` unless a supported upstream endpoint is available.

## 6. Channel Dialog And Import Flow

- [ ] 6.1 Extend channel dialog type handling so Claude Code Hub provider type strings are preserved and are not coerced through New API numeric channel types.
- [ ] 6.2 Add Claude Code Hub provider type options for `openai-compatible`, `codex`, `claude`, `claude-auth`, `gemini`, and `gemini-cli`.
- [ ] 6.3 Default account-token import into Claude Code Hub to `openai-compatible` while allowing the user to change the provider type before creation.
- [ ] 6.4 Reuse token-scoped model prefill for Claude Code Hub imports and keep the dialog available with manual model entry when model loading fails.
- [ ] 6.5 Require a usable real key for Claude Code Hub create/import flows and show localized guidance when the key is empty or masked.
- [ ] 6.6 Preserve masked existing provider secrets on edit by omitting `key` from update payloads unless the user enters a usable replacement key.
- [ ] 6.7 Add brief clarifying comments around masked-key preservation and provider type string handling where the implementation would otherwise look accidental.

## 7. Unsupported Feature Guardrails

- [ ] 7.1 Hide or disable Claude Code Hub as a bulk channel migration source/target for this change.
- [ ] 7.2 Hide or disable managed-site model sync and model redirect controls when Claude Code Hub is the active managed site.
- [ ] 7.3 Ensure full provider-key reveal actions are not offered for Claude Code Hub rows while no supported unmasked-key endpoint exists.
- [ ] 7.4 Provide localized explanatory copy for unsupported Claude Code Hub managed-site actions instead of silent no-ops.

## 8. Tests

- [ ] 8.1 Add unit tests for Claude Code Hub config resolution, config validation, label/message-key helpers, and service selection.
- [ ] 8.2 Add unit tests for the Claude Code Hub action API adapter covering success responses, action failures, auth failures, malformed responses, and secret redaction.
- [ ] 8.3 Add unit tests for provider-to-channel normalization, create/update payload mapping, provider type preservation, model mapping, status mapping, and group/priority/weight mapping.
- [ ] 8.4 Add tests for masked-key update behavior: unchanged masked keys are omitted, replacement keys are sent, and create/import requires a usable key.
- [ ] 8.5 Add tests for account-token import preparation, including default provider type, token-scoped model prefill, and manual model fallback when prefill fails.
- [ ] 8.6 Add component tests for settings UI and managed-site type switching with Claude Code Hub present.
- [ ] 8.7 Add tests or assertions that unsupported migration/model-sync/model-redirect/key-reveal actions are hidden or disabled for Claude Code Hub.

## 9. Verification

- [ ] 9.1 Run `pnpm run validate:staged` after staging only task-scoped changes, or document why the staged validation flow cannot be used.
- [ ] 9.2 Run the smallest related Vitest command for the touched tests, preferably a related/affected command when available, covering managed-site utilities, Claude Code Hub adapter/service tests, channel dialog behavior, and settings UI.
- [ ] 9.3 Run `pnpm compile` because the change touches shared managed-site types, preferences, services, and UI contracts.
- [ ] 9.4 Run `pnpm run validate:push` if implementation adds/removes exports, files, or cross-cutting wiring that could affect dependency/type analysis.
- [ ] 9.5 Document any validation blockers, pre-existing failures, uncovered edge cases, or deferred structural debt before handoff.
