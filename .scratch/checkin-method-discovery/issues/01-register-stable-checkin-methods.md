# Register Stable Check-in Method Identities

Status: resolved

Blocked by: none

## Objective

Give every existing auto-check-in provider a stable persisted method identity and deepen the existing provider registry without changing any account, scheduler, request, or retry behavior.

## Scope

- Replace the single `siteType -> provider` map with registrations that carry a stable method ID, candidate Account Site Types, legacy migration metadata, constrained new-account compatibility metadata for pre-existing providers, and the existing provider implementation.
- Register all existing providers and keep `resolveAutoCheckinProvider()` behaviorally equivalent through a compatibility resolver.
- Allow the registry to enumerate multiple candidates for one Account Site Type without using registration order to resolve ambiguity.
- Validate duplicate IDs, empty candidate lists, and incomplete legacy coverage at registry construction or in a contract test.
- Introduce a storage-safe persisted method-ID type that can retain an unknown namespaced ID while allowing execution only for currently registered IDs.
- Do not add discovery, change account persistence, or send any new network request.

## Stable ID Contract

Use this final mapping:

| Existing provider | Stable method ID | Legacy Account Site Type |
| --- | --- | --- |
| `newApiProvider` | `new-api:daily-checkin` | `SITE_TYPES.NEW_API` |
| `veloeraProvider` | `veloera:daily-checkin` | `SITE_TYPES.VELOERA` |
| `wongGongyiProvider` | `wong-gongyi:daily-checkin` | `SITE_TYPES.WONG_GONGYI` |
| `anyrouterProvider` | `anyrouter:daily-checkin` | `SITE_TYPES.ANYROUTER` |
| `voApiV2Provider` | `voapi-v2:daily-checkin` | `SITE_TYPES.VO_API_V2` |

Treat these IDs as backup and synchronization format contracts after release. Do not derive them from class names, filenames, endpoints, or registration order. A future protocol split receives a new ID rather than renaming an existing one.

## Acceptance Criteria

- Every provider that can be resolved before this change resolves to the same implementation afterward.
- Every currently runnable account remains runnable with the same request behavior.
- One Account Site Type can expose multiple ordered candidates for later discovery.
- Duplicate method IDs and a missing legacy provider registration fail deterministically.
- Unknown persisted IDs can round-trip through the ID decoder but cannot resolve to executable code.
- No account schema, UI, telemetry, or scheduler result changes are introduced.
- Compatibility metadata is available only to providers that existed before this design; it cannot be used to admit a new method without protocol Detection.

## Tests

- Add a registry contract test covering unique IDs, candidate filtering, deterministic enumeration, and all legacy providers.
- Extend existing provider-resolution tests to prove pre/post lookup parity.
- Use placeholder accounts and reserved example origins.

## Validation

- Run Vitest related to the registry and all changed provider registrations.
- Run `pnpm compile` because the provider contract and exports are shared TypeScript surfaces.

## Rollback

This slice is fully reversible because it writes no new persisted data.

## Out of Scope

- Discovery and selection.
- Provider protocol rewrites.
- Typed mutation certainty or retry changes.
- User-defined HTTP methods.

## Comments
