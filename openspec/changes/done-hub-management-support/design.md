## Context

All API Hub already provides a “managed site” experience used by:

- Channel management UI (`ManagedSiteChannels`)
- Managed-site model sync (background scheduler + UI)
- Model redirect (generate/apply `model_mapping` updates)

Today this flow supports `new-api`, `Veloera`, and `octopus` (with Octopus using a different auth/config model and not supporting model redirect). Done Hub (`done-hub`) is currently supported as a *regular site type* for some account-facing APIs (pricing/tokens via the OneHub override), but it is not selectable as a managed-site type, so users cannot manage channels/models in a unified way.

This change extends the managed-site abstraction to include `done-hub` and wires Done Hub credentials + service implementations into existing UI/background flows.

## Goals / Non-Goals

**Goals:**

- Add `done-hub` as a selectable managed-site type (alongside New API / Veloera / Octopus).
- Add a dedicated Done Hub managed-site configuration (base URL, admin token, user ID) stored in user preferences.
- Reuse existing managed-site UI screens for channel management, model sync, and model redirect for Done Hub.
- Provide i18n keys and tests for the new managed-site type and config handling.

**Non-Goals:**

- Rework OneHub/DoneHub account-facing APIs (token list, pricing, groups) beyond what’s needed for managed-site features.
- Implement Octopus model redirect (explicitly out of scope; existing behavior remains).
- Guarantee compatibility with every fork/version of Done Hub; the integration will target the upstream Done Hub API surface and fall back to clear errors when unsupported.

## Decisions

1. **Represent Done Hub as a first-class `ManagedSiteType`**
   - **Decision:** Extend `ManagedSiteType` to include `done-hub`.
   - **Rationale:** This keeps the routing logic consistent: managed-site UI/background services derive behavior from `managedSiteType` (not from account site types).
   - **Alternative:** Keep `ManagedSiteType` unchanged and add special-case “Done Hub mode” flags. Rejected because it creates parallel configuration paths and increases maintenance cost.

2. **Store Done Hub credentials separately from New API/Veloera**
   - **Decision:** Add `doneHub` config in user preferences (same shape as New API/Veloera: `baseUrl`, `adminToken`, `userId`).
   - **Rationale:** Users may manage different platforms at different times; separating configs avoids overwriting or mixing credentials.
   - **Alternative:** Reuse `newApi` config for Done Hub. Rejected due to confusing UX and potential data loss when switching types.

3. **Implement Done Hub admin API overrides (layered with existing OneHub overrides)**
   - **Decision:** Add a dedicated Done Hub API override module under `services/apiService/doneHub/` for admin endpoints (channels, provider model enumeration, groups, model mapping updates) and keep reusing the existing OneHub override module for Done Hub’s account-facing endpoints.
   - **Rationale:** Done Hub diverges from New API channel/admin APIs, but still shares OneHub-style endpoints for token/pricing/group info. Layered overrides let us reuse the mature OneHub implementation while keeping admin operations correct for Done Hub.
   - **Implementation Detail:** Update API override resolution to support an ordered list of override modules per `siteType` (first match wins), so `done-hub` can use `[doneHubOverrides, oneHubOverrides]`.
   - **Alternative:** Create a single bespoke Done Hub adapter for all APIs. Rejected because it would duplicate OneHub behavior and increase maintenance cost.

## Risks / Trade-offs

- **[Risk] Done Hub channel APIs differ from New API channel APIs** → **Mitigation:** Route calls through the override mechanism (`getApiService(DONE_HUB)`) and provide Done Hub-specific implementations under `services/apiService/doneHub/` for channel CRUD, model enumeration, model mapping updates, and group listing.
- **[Risk] Users cannot easily find admin token/user ID** → **Mitigation:** Provide clear localized descriptions in settings and a quick access link to the Done Hub profile page (`/panel/profile`) once a base URL is configured.
- **[Risk] Background model sync depends on managed-site context** → **Mitigation:** Ensure `utils/managedSite` returns consistent `messagesKey` + admin config for Done Hub so background errors are correctly localized (e.g. `messages:donehub.configMissing`).

## Migration Plan

- Add a `doneHub` preferences object with empty defaults. Existing stored preferences will continue to load because missing fields fall back to defaults.
- No breaking storage migrations are required. Users opting into Done Hub management will configure credentials via settings after updating.

## Implementation Notes

### Done Hub API differences (admin endpoints)

- **Channel list/search:** Done Hub uses `GET /api/channel/` with query-param filtering (e.g. `base_url`) and paginated `DataResult` responses; it does not expose New API’s `/api/channel/search`.
- **Provider model enumeration:** Done Hub uses `POST /api/channel/provider_models_list` to fetch upstream/provider models for a channel config (instead of New API’s `fetch_models/{id}`-style endpoint).
- **Model/model-mapping updates:** Done Hub `PUT /api/channel/` can behave like a full overwrite when `models` is non-empty. To avoid wiping unrelated fields we fetch the full channel payload first, then submit a complete object with updated `models` / `model_mapping`.
- **Groups:** Done Hub exposes user groups via paginated `GET /api/group/`, used to populate the channel group selector.
- **Payload normalization:** Done Hub responses may omit `channel_info`; we normalize/default it to match the `ManagedSiteChannel` shape expected by shared UI/service logic.

## Resolved Questions

- **Admin credentials page path:** Use `/panel/profile` (wired via `SITE_API_ROUTER.adminCredentialsPath` and used by the Done Hub settings quick link).
- **Channel/model-mapping differences:** Implemented under `services/apiService/doneHub/` (list/search via query params, provider model list endpoint, full-payload PUT updates, group listing).

