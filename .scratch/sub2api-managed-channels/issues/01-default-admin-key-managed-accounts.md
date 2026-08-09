# Implement default Admin Key managed accounts

Status: resolved

## Acceptance criteria

- Sub2API remains an account site and also becomes a managed-site option.
- Managed-site config requires only Base URL and Admin API Key.
- All admin protocol requests use `x-api-key` and the verified accounts routes.
- Only `type=apikey` accounts appear as managed channels.
- Search, CRUD, import duplicate matching, and API key second view behave as
  described in `../spec.md`.
- A step-up rejection is disclosed without introducing login/TOTP settings.
- Existing managed-site telemetry/search/i18n surfaces include Sub2API.
- Focused affected tests pass and the final diff contains no unrelated changes.

## Progress

- 2026-08-09: verified current upstream accounts, credential redaction, raw
  export, search, and step-up defaults; rejected archived channel endpoint.
- 2026-08-09: implemented URL + Admin API Key configuration, API-key account
  list/search/CRUD, import draft integration, duplicate key hydration, selected
  key reveal, explicit step-up rejection, focused UI, settings search, locale,
  analytics, and protocol coverage.
- 2026-08-09: replaced the temporary legacy-channel presentation with a native
  managed-resource registration covering the complete default-security field
  set; import and native CRUD now share the same provider mutation seam.
- 2026-08-10: corrected the native notes projection after re-verifying that
  current upstream create and update requests both accept `notes`; only
  `platform` remains read-only on edit.
- 2026-08-10: removed the redundant available-credential sentence from the
  Sub2API key editor while retaining keep-existing guidance and explicit view.
- 2026-08-10: migrated external imports to the full native create field set and
  corrected duplicate matching to inventory accounts before URL+key comparison;
  Sub2API imports no longer depend on the legacy New API editor. They now bind
  the shared managed-channel import seed to the native resource create editor.
- 2026-08-10: exposed Sub2API's optional model whitelist in the native editor.
  Imports leave it empty by default, which preserves Sub2API's all-model
  behavior; only an explicit selection writes `credentials.model_mapping`.
