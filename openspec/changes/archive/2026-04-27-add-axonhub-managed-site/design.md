## Context

All API Hub already has a managed-site channel management path for New API-family backends, DoneHub, Veloera, and Octopus. AxonHub exposes the required admin channel operations, but it does so through admin JWT authentication and GraphQL at `/admin/graphql`, not through the New API-compatible REST endpoints currently used by most managed-site providers.

Verified AxonHub upstream behavior:

- `POST /admin/auth/signin` accepts admin email/password and returns a JWT.
- `POST /admin/graphql` uses `Authorization: Bearer <token>` for channel queries and mutations.
- Channel management is available through GraphQL operations such as `queryChannels`, `createChannel`, `updateChannel`, `updateChannelStatus`, and `deleteChannel`.
- `/openapi/v1/graphql` is not sufficient for this feature because it exposes service-account operations, not channel CRUD.
- AxonHub channels use string provider types, string statuses, credentials objects, model arrays, and settings objects rather than New API numeric channel types and comma-separated fields.

Nearest existing reuse points:

- `src/constants/siteType.ts`: extend the existing site type and `ManagedSiteType` definitions with AxonHub.
- `src/services/preferences/userPreferences.ts`: extend existing per-managed-site preference storage with an optional AxonHub config object.
- `src/services/managedSites/utils/managedSite.ts`: extend managed-site config resolution, labels, messages, and config completeness helpers for AxonHub.
- `src/components/ManagedSiteTypeSwitcher.tsx` and managed-site settings tabs: extend the existing selector and settings pattern instead of adding a separate AxonHub page.
- `src/services/managedSites/managedSiteService.ts`: extend `getManagedSiteServiceForType(...)` with an AxonHub provider implementation.
- `src/services/managedSites/providers/newApi.ts`, `doneHub`, `veloera`, and `octopus`: reuse the provider-module pattern for `checkValidConfig`, `getConfig`, `prepareChannelFormData`, `buildChannelPayload`, `searchChannel`, `createChannel`, `updateChannel`, `deleteChannel`, and `findMatchingChannel`.
- `src/services/apiService/index.ts`: extend API service resolution with a dedicated AxonHub adapter for managed channel list/mutation calls.
- `src/components/dialogs/ChannelDialog/**`: extend the existing channel create/edit dialog for provider-specific AxonHub type/status normalization instead of introducing another channel dialog.
- `src/features/ManagedSiteChannels/ManagedSiteChannels.tsx`: reuse the current managed-site channel table and actions, while hiding or adapting New API-only fields/actions for AxonHub.
- `src/services/managedSites/channelMigration.ts`: leave the existing migration feature unchanged; this change explicitly does not add AxonHub channel migration.

## Goals / Non-Goals

**Goals:**

- Add AxonHub as a selectable managed-site type.
- Store AxonHub admin base URL, email, and password separately from other managed-site credentials.
- Validate AxonHub configuration through the upstream admin sign-in flow.
- Support basic AxonHub channel list, search, create, update, and delete through admin GraphQL.
- Support importing an existing account/token as an AxonHub OpenAI-compatible channel.
- Normalize AxonHub GraphQL channel data into the managed-site UI shape without exposing stored credentials in logs or UI diagnostics.
- Preserve existing behavior for New API, Veloera, DoneHub, Octopus, and existing channel migration flows.

**Non-Goals:**

- Bulk channel migration or automatic conversion from other managed-site backends into AxonHub.
- Full AxonHub advanced channel policy/settings editing.
- AxonHub service-account OpenAPI support for channel CRUD.
- Multiple saved AxonHub admin profiles.
- Background/resumable AxonHub batch jobs.
- Full model sync and model redirect parity unless a later requirement explicitly adds it.

## Decisions

### 1. Represent AxonHub as a first-class managed-site type

**Decision:** Add `AXON_HUB = "axonhub"` and include it in `ManagedSiteType`, managed-site labels, messages, config resolution, and the type switcher.

**Rationale:** AxonHub should behave like the other managed targets from the user's perspective. A first-class managed-site type keeps routing centralized through the existing managed-site service resolver.

**Alternative considered:** Treat AxonHub as a New API-compatible variant. Rejected because AxonHub's auth, API transport, status model, channel type model, credentials shape, and model fields are materially different.

### 2. Store AxonHub credentials in a dedicated config object

**Decision:** Add an `AxonHubConfig` shaped around `{ baseUrl, email, password }`, with empty defaults and validation through `POST /admin/auth/signin`.

**Rationale:** AxonHub admin auth is username/password style, similar in storage concerns to Octopus rather than the New API `adminToken`/`userId` shape. Keeping a separate config prevents accidental reuse of incompatible credentials.

**Alternative considered:** Overload `adminToken` as password and `userId` as email. Rejected because it makes UI copy, validation, and future maintenance misleading.

### 3. Add a dedicated AxonHub GraphQL client and API adapter

**Decision:** Implement AxonHub admin communication behind a dedicated service module, likely under `src/services/apiService/axonHub/`, with:

- `signIn(baseUrl, email, password)`
- JWT caching for the current extension session
- `graphqlRequest(...)`
- channel list/search/create/update/delete helpers
- normalization helpers for GraphQL responses and errors

**Rationale:** Centralizing auth and GraphQL transport avoids duplicating token handling across the managed-site provider, channel table, and future model-related helpers. It also gives one place to redact credentials and normalize upstream errors.

**Alternative considered:** Put raw GraphQL requests directly in the managed-site provider. Rejected because auth retry, error parsing, and response normalization are shared concerns.

### 4. Reuse `ManagedSiteService` with an AxonHub provider

**Decision:** Add `src/services/managedSites/providers/axonHub.ts` implementing the existing `ManagedSiteService` contract.

The provider will:

- report config validity by signing in or reusing a valid cached JWT
- return AxonHub config through the managed-site config helpers
- prepare import form data from the selected account/token
- build AxonHub GraphQL mutation inputs from `ChannelFormData`
- search/list channels through the AxonHub API adapter
- create/update/delete channels through GraphQL mutations
- find an existing matching channel for import using normalized base URL, models, and key data when available

**Rationale:** The existing managed-site UI already depends on this contract. Reusing it limits UI churn and keeps provider-specific backend logic out of React components.

**Alternative considered:** Add AxonHub-only UI actions that bypass `ManagedSiteService`. Rejected because it would create a parallel managed-site workflow.

### 5. Normalize AxonHub channels at the API boundary

**Decision:** Convert AxonHub GraphQL channels into the existing `ManagedSiteChannel` display shape at the adapter/provider boundary, while preserving raw AxonHub data in an internal metadata field such as `_axonHubData`.

Expected mapping:

- `id` -> numeric managed-site id when possible, with raw GraphQL ID preserved
- `name` -> `name`
- `type` -> AxonHub provider type metadata plus display-compatible type handling
- `status: "enabled"` -> enabled status
- `status: "disabled"` or `"archived"` -> disabled status for basic UI display
- `baseURL` -> `base_url`
- `credentials.apiKeys[0]` or `credentials.apiKey` -> `key` when the API returns it
- `supportedModels` and `manualModels` -> `models`
- `settings.modelMappings` -> `model_mapping` when represented by existing redirect helpers
- unsupported New API-only fields such as group and priority -> safe defaults or hidden UI fields

**Rationale:** Existing shared UI and table code expects a New API-shaped channel. Boundary normalization keeps that compatibility while still allowing AxonHub-specific mutations to use raw GraphQL data.

**Alternative considered:** Rewrite the shared managed-site channel type around a backend-neutral union before adding AxonHub. Rejected for this change because it would make the first AxonHub slice larger and risk unrelated provider regressions.

### 6. Support AxonHub-specific channel type options in the shared dialog

**Decision:** Add AxonHub channel type constants and extend the channel dialog to use provider-specific type option parsing instead of forcing every selected type through `Number(value)`.

**Rationale:** AxonHub channel types are string enum values such as `openai`, `anthropic`, `gemini`, and `openrouter`. Basic channel management should not corrupt existing AxonHub channel type data by coercing it into New API numeric channel types.

**Alternative considered:** Force all AxonHub create/edit flows to OpenAI only. Rejected for manual basic channel management because existing AxonHub deployments may already contain non-OpenAI channels. Import-as-channel can still default to `openai`.

### 7. Keep import-as-channel narrow and OpenAI-compatible

**Decision:** When importing an existing account/token into AxonHub, create an AxonHub channel with `type: "openai"` and fields derived from the selected account/token:

- channel name from the existing managed-site naming helper pattern
- `baseURL` from the source account base URL
- `credentials.apiKeys` from the selected token key
- `supportedModels` from the selected token's live upstream model list or manual fallback
- `defaultTestModel` from the first final model
- status applied with `updateChannelStatus(...)` after create when the user selected enabled status

**Rationale:** The current import source is an OpenAI-compatible account/token. Mapping it to AxonHub's OpenAI provider type is predictable and avoids designing a broad cross-provider conversion layer.

**Alternative considered:** Infer AxonHub channel type from every possible source site type. Rejected because it becomes migration/conversion logic, which is explicitly out of scope.

### 8. Gate unsupported New API-only actions for AxonHub

**Decision:** Do not expose model sync, model redirect, group, priority, or other New API-only controls for AxonHub unless they are explicitly implemented and tested in this change. Basic channel CRUD and import remain available.

**Rationale:** AxonHub has analogous concepts for some fields, but not identical semantics. Hiding or disabling unsupported controls is safer than silently writing lossy or invalid data.

**Alternative considered:** Map all existing New API controls onto nearest AxonHub fields. Rejected because group/priority/model mapping semantics are not equivalent enough for a first release.

## Risks / Trade-offs

- **[Risk] AxonHub GraphQL schema or enum values may change across deployments** -> **Mitigation:** target the current upstream API, centralize enum/type mapping, and show clear unsupported-type errors when an unknown value cannot be edited safely.
- **[Risk] Stored AxonHub password increases credential sensitivity** -> **Mitigation:** follow existing credential storage patterns, never log credentials, redact GraphQL/auth failures, and keep UI diagnostics generic.
- **[Risk] Admin JWT expires during a page session** -> **Mitigation:** retry one sign-in on authentication failure before surfacing an error.
- **[Risk] GraphQL IDs may not always be numeric** -> **Mitigation:** preserve raw IDs in AxonHub metadata and keep id conversion isolated; if a deployment returns non-numeric IDs, fail only the affected mutation with a clear message rather than corrupting channel state.
- **[Risk] AxonHub credentials may be hidden or partially redacted in channel responses** -> **Mitigation:** compare channel matches by key only when key data is available; otherwise fall back to base URL and model matching with conservative duplicate guidance.
- **[Risk] AxonHub create defaults channels to disabled** -> **Mitigation:** perform a follow-up `updateChannelStatus` mutation when the requested final status is enabled.
- **[Risk] Hiding model sync/redirect for AxonHub may surprise users who expect full managed-site parity** -> **Mitigation:** scope UI copy and specs to basic channel management and import-as-channel, leaving parity work for later.
- **[Risk] Browser extension CORS behavior can vary by deployment** -> **Mitigation:** use normal extension fetch paths and surface deployment/network failures as configuration or connectivity errors during validation.

## Migration Plan

- Add optional AxonHub preference defaults so existing stored preferences continue loading without a storage migration.
- Add AxonHub settings and managed-site type selection as opt-in UI; existing users remain on their current managed-site type.
- Keep existing migration features unchanged and do not add AxonHub as a migration target in this change unless basic create compatibility is explicitly validated later.
- Rollback is code-only for local state: removing the AxonHub UI/provider leaves existing preferences valid, though users may retain an unused AxonHub config object.
- Channels created in AxonHub are real remote resources and are not rolled back automatically.

## Open Questions

- Should AxonHub be hidden from existing managed-site channel migration target lists until a separate AxonHub migration spec is written?
- Which AxonHub channel types should be exposed in the first UI pass: the full upstream enum or a smaller tested subset with unknown-type read-only handling?
- Should the AxonHub password be stored directly like other managed credentials, or should a later enhancement add a session-only login mode?
