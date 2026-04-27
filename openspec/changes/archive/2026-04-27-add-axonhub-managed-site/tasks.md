## 1. Recon and Scope Confirmation

- [x] 1.1 Inspect the existing managed-site modules before implementation: `src/constants/siteType.ts`, `src/services/preferences/userPreferences.ts`, `src/services/managedSites/utils/managedSite.ts`, `src/services/managedSites/managedSiteService.ts`, provider modules under `src/services/managedSites/providers/`, `src/services/apiService/index.ts`, `src/components/ManagedSiteTypeSwitcher.tsx`, managed-site settings tabs, `src/components/dialogs/ChannelDialog/**`, `src/features/ManagedSiteChannels/ManagedSiteChannels.tsx`, and `src/services/managedSites/channelMigration.ts`.
- [x] 1.2 Reconfirm the AxonHub upstream admin surface used by this change: `POST /admin/auth/signin`, authenticated `POST /admin/graphql`, and GraphQL channel operations for query, create, update, status update, and delete.
- [x] 1.3 Identify the smallest existing test files to extend for managed-site type switching, settings persistence, provider resolution, channel dialog type handling, managed-site channel UI, and provider/API service behavior.

## 2. Types, Preferences, and Managed-Site Metadata

- [x] 2.1 Add an `AXON_HUB = "axonhub"` site type constant and include it in `ManagedSiteType` without changing existing site type values.
- [x] 2.2 Add `AxonHubConfig` and default config types for `baseUrl`, `email`, and `password`.
- [x] 2.3 Extend `UserPreferences` defaults and persistence handling with optional AxonHub config while preserving backward compatibility for existing stored preferences.
- [x] 2.4 Extend managed-site label/message key helpers and config completeness helpers for AxonHub.
- [x] 2.5 Add AxonHub channel type/status constants and normalization helpers, keeping AxonHub string provider types separate from New API numeric `ChannelType` values.

## 3. AxonHub Admin GraphQL Service

- [x] 3.1 Create a dedicated AxonHub API service module under `src/services/apiService/axonHub/` for admin sign-in, session-token caching, GraphQL requests, response normalization, and safe error messages.
- [x] 3.2 Implement AxonHub admin sign-in against `/admin/auth/signin` using configured base URL, email, and password.
- [x] 3.3 Implement authenticated GraphQL request handling for `/admin/graphql`, including one re-authentication retry when a cached admin token is expired or unauthorized.
- [x] 3.4 Implement AxonHub channel list/search helpers using `queryChannels` or compatible client-side filtering when upstream filtering is insufficient.
- [x] 3.5 Implement AxonHub channel create, update, status update, and delete helpers using admin GraphQL mutations.
- [x] 3.6 Add brief implementation comments only around non-obvious auth retry, GraphQL ID preservation, and create-then-status-update behavior.

## 4. AxonHub Channel Normalization and Provider

- [x] 4.1 Add an AxonHub channel type that preserves raw AxonHub GraphQL data in provider metadata while exposing a display-compatible managed-site channel shape.
- [x] 4.2 Implement AxonHub channel normalization for IDs, names, provider types, statuses, base URLs, credentials, supported models, manual models, and unsupported New API-only fields.
- [x] 4.3 Implement `src/services/managedSites/providers/axonHub.ts` using the existing `ManagedSiteService` contract.
- [x] 4.4 Implement AxonHub config validation and config retrieval through the provider.
- [x] 4.5 Implement AxonHub `searchChannel`, `createChannel`, `updateChannel`, `deleteChannel`, and `findMatchingChannel`.
- [x] 4.6 Implement AxonHub import form preparation so account/token import defaults to AxonHub `openai`, source account base URL, selected token key, available models, and editable manual model fallback.
- [x] 4.7 Implement AxonHub channel payload building so create/update mutations include credentials, supported models, default test model, and follow-up enabled status handling when required.
- [x] 4.8 Wire `getManagedSiteServiceForType(...)` and `getApiService(...)` to resolve the AxonHub provider and API adapter.

## 5. Settings and Managed-Site UI

- [x] 5.1 Add AxonHub to the managed-site type switcher without removing New API, Veloera, DoneHub, or Octopus options.
- [x] 5.2 Add an AxonHub settings panel for base URL, admin email, admin password, save, and validation behavior following the nearest existing managed-site settings patterns.
- [x] 5.3 Add localized strings for AxonHub labels, settings fields, validation results, configuration-missing errors, and unsupported-action explanations.
- [x] 5.4 Extend the managed-site channel dialog so AxonHub provider types are parsed and submitted as strings instead of being coerced through `Number(value)`.
- [x] 5.5 Ensure unknown AxonHub channel types are preserved or made non-editable rather than silently replaced with a New API channel type.
- [x] 5.6 Hide or disable AxonHub-incompatible New API-only fields and actions, including groups, priority, model sync, and model redirect, with local explanatory copy when a disabled control is visible.
- [x] 5.7 Ensure existing channel migration entry points do not offer AxonHub as a migration target and do not attempt backend-to-AxonHub automatic conversion in this change.

## 6. Automated Tests

- [x] 6.1 Add unit tests for AxonHub config defaults, managed-site type resolution, config completeness, and provider resolution.
- [x] 6.2 Add unit tests for AxonHub auth and GraphQL helpers covering successful sign-in, invalid credentials, safe error redaction, expired-token retry, and GraphQL errors.
- [x] 6.3 Add unit tests for AxonHub channel normalization covering enabled/disabled/archived statuses, string provider types, missing credentials, model arrays, and non-numeric GraphQL IDs.
- [x] 6.4 Add provider tests for AxonHub list/search/create/update/delete and create-then-status-update behavior.
- [x] 6.5 Add import-as-channel tests covering OpenAI-compatible defaults, selected token key credentials, model-list prefill, manual model fallback, and non-empty final model requirement.
- [x] 6.6 Add component tests for AxonHub settings, managed-site type switcher behavior, channel dialog string type handling, hidden New API-only fields, and migration target exclusion.

## 7. Validation

- [x] 7.1 Run the smallest related automated tests for touched behavior, preferring `pnpm -s vitest --run <related test files>` or the repo-native affected/related equivalent.
- [x] 7.2 Run `pnpm run i18n:extract:ci` after adding or changing translation keys and inspect any locale diff for unintended key removal.
- [x] 7.3 Run `pnpm lint`.
- [x] 7.4 Run `pnpm run validate:staged` as the repo pre-commit-equivalent validation flow after staging only task-scoped files.
- [x] 7.5 Run broader validation such as `pnpm compile` or `pnpm run validate:push` if shared types, API service routing, exports, or dependency analysis are affected beyond the narrow managed-site surface.
- [x] 7.6 Document any validation blocker, unsupported AxonHub deployment behavior, or unautomated edge case before handoff.
