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
