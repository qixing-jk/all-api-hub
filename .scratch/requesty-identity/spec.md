# Requesty organization identity

Status: ready-for-human

Scope: Requesty account identity only. The user confirmed API-service and account-adapter test boundaries and explicitly excluded legacy-account migration because the integration is still in development. Keep the existing site type, dedicated adapter, credential ownership/deduplication, management host and authentication.

## Verified contract and decision (2026-10-24)

- [Get Organization](https://docs.requesty.ai/api-reference/endpoint/manage-org-get): `GET /v1/manage/org` exposes `{name, balance}`, without an organization ID. Existing deployment evidence also records this shape. The name is display data, not a stable identifier.
- [List Groups](https://docs.requesty.ai/api-reference/endpoint/manage-group/manage-group-list): `GET /v1/manage/group` lists groups in the authenticated organization. Each item exposes `organization_id`. Example: `{groups: [{id: "group-1", organization_id: "org-123", name: "Engineering"}]}`. Retain only the common nonempty organization ID; reject malformed/conflicting identity evidence.
- Use the organization name for the account username and the verified organization ID for identity. Key IDs/names remain credential/resource metadata. Do not use a group creator as the calling user or infer identity from ambient Clerk sessions.
- Empty group lists or explicitly unavailable group discovery (403/404) cannot establish organization identity: use a namespaced random local identity. Preserve it for the same credential; it cannot establish equivalence across independently added credentials. Authentication, network and malformed-response failures must remain errors.
- Do not migrate development data or change shared account identity abstractions. Keep an unchanged saved credential's identity stable; re-resolve identity when replacing credentials, including when the form still carries its previous identity.

## Validation

Approved seams: real Requesty API service and public account capabilities, with MSW only at HTTP boundaries. Cover organization identity, key rotation, fallback, save, and onboarding. Existing automatic page-action boundary tests remain in place.

Baseline: 42 Requesty API/adapter/onboarding/provisioning tests passed after refreshing onto main `5a8a09dc2`. Rebase range-diff preserved all six existing feature commits. Recovery ref: `backup/requesty-before-identity-20261024`.

Live limitation at discovery: no `REQUESTY_MANAGE_KEY` configured; isolated CDP 9390 unavailable. Group contract is documentation-verified, not authenticated-live-verified in this task.

Task-local test logs and acceptance evidence belong in ignored `artifacts/`. Existing `.scratch/requesty-adaptation/` and `.scratch/adapt-priority-2026-10/` are unrelated pre-existing material and remain untouched.

## Implementation and acceptance

API service, bootstrap, provisioning display name and persistence now follow the organization contract above. The maintained live UI runner reads key metadata directly for cleanup instead of extracting it from the account username. No schema migration, shared identity-policy change or unrelated cleanup was added.

117 targeted tests passed across Requesty, account identity/deduplication and automatic-detection entrypoints. TDD failures were observed before implementing organization discovery, unavailable-discovery fallback, organization-based bootstrap, credential replacement, provisioning display name and numeric request hints. Local acceptance table: `artifacts/acceptance.md`.

Authenticated group discovery and before/after screenshots remain for human/live acceptance when a Requesty manage key or isolated signed-in browser becomes available. API/adaptation behavior is covered with real HTTP adapters and mocked provider responses; those checks do not establish deployment acceptance. No durable instruction change was warranted.
