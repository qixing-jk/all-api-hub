## 1. Types & Preferences

- [x] 1.1 Add Done Hub managed-site config type + defaults
- [x] 1.2 Extend `ManagedSiteType` to include `done-hub`
- [x] 1.3 Persist Done Hub config in `UserPreferences` (defaults + reset helpers)
- [x] 1.4 Update `utils/managedSite` to handle Done Hub config + messages keys
- [x] 1.5 Expose Done Hub config fields in `UserPreferencesContext`

## 2. Settings UI

- [x] 2.1 Add Done Hub option to managed-site selector (labels + value)
- [x] 2.2 Render Done Hub settings panel when selected
- [x] 2.3 Implement `DoneHubSettings` component (baseUrl/adminToken/userId)
- [x] 2.4 Add quick link to Done Hub profile for credentials (when baseUrl set)

## 3. Managed Site Service Wiring

- [x] 3.1 Add Done Hub managed-site service wrapper (channel CRUD + config helpers)
- [x] 3.2 Wire Done Hub into `getManagedSiteService` resolution
- [x] 3.3 Implement Done Hub admin API overrides (channels/models/groups)
- [x] 3.4 Support layered API overrides for Done Hub (DoneHub admin + OneHub account)

## 4. Model Sync & Redirect Support

- [x] 4.1 Ensure model sync background service supports `done-hub` managed-site context
- [x] 4.2 Enable model redirect for Done Hub using Done Hub config + site type

## 5. Localization

- [x] 5.1 Add i18n keys for Done Hub settings and managed-site selector (en + zh_CN)
- [x] 5.2 Add `messages:donehub.*` strings (configMissing, errors) (en + zh_CN)

## 6. Tests

- [x] 6.1 Add unit tests for `utils/managedSite` Done Hub config extraction/context
- [x] 6.2 Add smoke test for managed-site selector options including Done Hub
- [x] 6.3 Add unit tests for Done Hub API adapter channel endpoints
