# Sponsor Catalog Compatibility

Use this reference when a sponsor change touches the in-app recommendation catalog or any public sponsor JSON artifact.

## Current version map

For schema coverage decisions, confirm served artifacts against current files. Check tags and old-client contracts when new fields, actions, support values, or targeting make release compatibility uncertain; reuse established evidence for unchanged contracts. Ordinary copy changes do not require rediscovering release history.

| Schema | Public artifact | First released client | Known client band | Shape summary |
| --- | --- | --- | --- | --- |
| V3 | `public/sponsor-catalog.json` | `v3.41.0` | `v3.41` through `v3.45` | Global campaign policy and URLs; localized display copy |
| V4 | `public/sponsor-catalog.v4.json` | `v3.46.0` | `v3.46` through `v3.51` | Complete locale campaigns with explicit links and actions |
| V5 | `public/sponsor-catalog.v5.json` | `v3.52.0` | `v3.52+` until superseded | V4 campaign model plus visibility constraints |

The current runtime contract is defined by:

- `src/features/AccountManagement/sponsors/constants.ts`
- `src/features/AccountManagement/sponsors/types.ts`
- `src/features/AccountManagement/sponsors/catalog.ts`
- `src/features/AccountManagement/sponsors/loader.ts`
- `src/features/AccountManagement/sponsors/bundledCatalog.ts`
- `tests/features/AccountManagement/sponsors/publicCatalog.test.ts`

The schema introductions are visible in commits `08c815eab` (V3), `f002fcf90` (V4), and `88c188ca5` (V5). Confirm release reach with commands such as:

```powershell
git tag --contains 88c188ca5 --sort=version:refname
git log --all --oneline -- public/sponsor-catalog.json public/sponsor-catalog.v4.json public/sponsor-catalog.v5.json
```

## Governing rule

Treat schema versions as transport contracts, not content epochs. Update every still-served artifact whose released clients can safely and faithfully represent the campaign.

Do not infer intent from current catalog membership. A sponsor present only in the newest file may be a maintenance omission. Establish compatibility from the schema, old client code, provider contract, and Git history.

## Coverage decision

Start with the current runtime schema, then evaluate each older served schema separately.

### Project V5 to V4

V4 and V5 share the locale-campaign structure, but V4 does not know V5 `visibility` fields and rejects unknown locale fields.

Project into V4 only when:

- the campaign does not require extension-version or browser-family visibility restrictions;
- every used link, action, site type, and authentication value is accepted by V4 clients;
- exposing the campaign to the entire V4 client band is safe.

Translate the item rather than pasting it verbatim. Remove V5-only fields. If V5 visibility is essential, omit V4 and report that exposing the campaign unconditionally would change the intended audience.

### Project V4 or V5 to V3

V3 owns these campaign fields globally: `enabled`, `rank`, `supportStatus`, activation dates, operational URLs, fallback hints, and `accountPrefill`. Only `name`, `tagline`, and `postClickNote` vary by locale.

Project into V3 only when:

- locale campaigns can collapse to one safe global policy;
- the affiliate destination can be shared globally;
- the oldest relevant V3 client recognizes the `siteType` and `authType`;
- account, bookmark, and API-credential behavior can be expressed without conflating unrelated URLs;
- any targeting restriction can be dropped without unsafe overexposure.

Verify old-client values directly rather than assuming current enums existed then:

```powershell
git grep -n 'sub2api' v3.41.0 -- src
git show v3.45.0:src/features/AccountManagement/sponsors/types.ts
```

Replace the example value and tag with the actual campaign and oldest client under evaluation.

## Field projection

| V4/V5 field | V3 destination | Constraint |
| --- | --- | --- |
| `links.primary` | `urls.primaryAffiliate` | All locales must safely share one destination |
| `actions.addAccount` | `accountPrefill` | Site type, site URL, and auth type must be valid in V3 clients |
| `rank`, status, dates | Global V3 fields | Locale values must agree or collapse conservatively |
| Localized copy | `locales` | Preserve the catalog's established locale set |
| `actions.bookmarkFallback.url` | `fallbackHints.bookmarkManager` plus `urls.website` | Use only when the same URL is a correct bookmark destination |
| `actions.apiCredentialProfileFallback` | `fallbackHints.apiCredentialProfiles`, `urls.website`, and optional `urls.apiKeyCreate` | Use only when the V3 website fallback is a correct API base URL and does not conflict with bookmark semantics |
| `visibility` | No V3/V4 equivalent | Omit the older catalog if unconditional exposure is unsafe |

Never derive an action URL from the affiliate link. V3's shared `urls.website` is an old compatibility bridge, not a general replacement for every explicit V4/V5 action URL.

## Support and action semantics

Treat `supportStatus` as display metadata. In V4/V5, action-object presence controls available buttons.

- Add `actions.addAccount` only after verifying direct account support for the exact deployment.
- Model unsupported providers with only the explicit fallback actions whose parameters are verified.
- Keep `links.primary` for attribution and provider navigation.
- Do not label a provider supported merely because its model API is OpenAI-compatible.

For V3, confirm how the released client interprets `accountPrefill` and `fallbackHints`; do not backport current action semantics by name alone.

## Ordering

Current runtime normalization sorts by:

```ts
a.rank - b.rank || a.id.localeCompare(b.id)
```

Therefore:

- Physical array order does not determine software order.
- V4/V5 rank belongs to each locale campaign.
- V3 rank is global.
- Equal ranks fall back to sponsor ID order.
- A request such as "last in JSON but before an unsupported provider in software" requires both physical placement and a rank before that provider.

Check neighboring entries in every affected locale; do not update only `zh-CN` rank.

## Valid reasons to omit an older schema

Document one or more concrete reasons:

- required V5 visibility has no safe older equivalent;
- the older client does not recognize the site type or authentication type;
- locale-specific operational behavior cannot collapse to a safe V3 global policy;
- affiliate, bookmark, and API-base URLs cannot share the V3 URL model;
- a required action or field has no safe representation;
- the endpoint has been deliberately retired and current code or release policy proves it.

"The sponsor is absent today," "the file is legacy," and "a previous commit updated only V5" are not compatibility reasons.

## Validation boundary

For catalog-data-only changes, use the existing public catalog test rather than adding sponsor-name assertions or exact-array snapshots. Add or update tests only when schema validation, normalization, visibility, ordering behavior, or runtime actions change.

Before handoff, confirm:

- every edited JSON parses and passes the existing catalog validator;
- the current runtime file and every safely representable legacy artifact contain the intended campaign;
- omitted versions have a written compatibility reason;
- runtime rank matches the requested software order independently of physical JSON and prose order;
- no real sponsor facts were copied into tests, examples, or comments.
