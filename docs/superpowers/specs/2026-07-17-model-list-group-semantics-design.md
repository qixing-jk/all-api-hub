# Model List Group Semantics Design

Date: 2026-07-17

## Purpose

Make Model List distinguish three different group facts that are currently
collapsed into one UI concept:

- groups where a site can serve a model;
- groups the current account or runtime key can use;
- groups whose current multiplier is known well enough to calculate price.

The immediate symptom is a New API response where a model has
`enable_groups: ["vip", "default"]`, while the current account receives only
`usable_group.default` and `group_ratio.default`. Model List currently renders
`vip (1x)` because it treats every `enable_groups` value as current-account
pricing data and supplies a `1x` fallback when the multiplier is missing.

The fix preserves the raw site capability, derives account-scoped group facts
once at the Model List boundary, and routes every filter, price, action, and
display surface to the correct derived fact.

## Current Context

`PricingResponse` already carries all three upstream inputs:

- `data[].enable_groups`;
- response-level `usable_group`;
- response-level `group_ratio`.

The Model List pipeline currently drops `usable_group` when it turns pricing
responses into rows. It then repeatedly merges `enable_groups` into group
filters and pricing candidates. `resolveGroupRatio` makes the ambiguity visible
by formatting any group absent from `group_ratio` as `1x`.

This affects more than the card summary:

- single-account and all-account group filters;
- effective-group and lowest-price selection;
- card summaries and expanded details;
- unavailable-state recovery guidance;
- single-model and batch verification;
- model-key creation and token compatibility filtering.

The all-account price candidate path already prefers response-level
`group_ratio` keys when they exist, so the reported lowest price is commonly
correct. The design nevertheless removes the remaining fallback paths that can
promote a globally supported group into an account-scoped price candidate.

## Upstream Contract

At New API commit `a63364d156cf2a64f1c3d1ee4923d73d5f3222a1`:

- `enable_groups` is built from all enabled channel abilities for a model;
- `usable_group` is calculated for the current viewer;
- `group_ratio` is filtered to groups the viewer can use;
- the model details metadata displays raw `enable_groups` as plain pills;
- the pricing-by-group table displays only
  `enable_groups intersect usable_group`, with ratios and prices.

References:

- <https://github.com/QuantumNous/new-api/blob/a63364d156cf2a64f1c3d1ee4923d73d5f3222a1/model/pricing.go>
- <https://github.com/QuantumNous/new-api/blob/a63364d156cf2a64f1c3d1ee4923d73d5f3222a1/controller/pricing.go>
- <https://github.com/QuantumNous/new-api/blob/a63364d156cf2a64f1c3d1ee4923d73d5f3222a1/web/default/src/features/pricing/lib/model-helpers.ts>
- <https://github.com/QuantumNous/new-api/blob/a63364d156cf2a64f1c3d1ee4923d73d5f3222a1/web/default/src/features/pricing/components/model-details.tsx>

The values inside `usable_group` vary across New API versions and compatible
deployments. Model List needs only its keys. The product contract therefore
treats those values as opaque rather than relying on a particular description
object or string shape.

## Goals

- Preserve raw model/site support metadata without presenting it as current
  account permission or pricing.
- Derive current usable and priceable groups once per source-scoped model row.
- Use the same derived facts across filtering, pricing, row presentation,
  verification, and key workflows.
- Stop fabricating `1x` for arbitrary groups missing from `group_ratio`.
- Keep usable-but-unpriced groups actionable while excluding them from price
  comparison.
- Preserve OneHub, DoneHub, Sub2API, AIHubMix, catalog-only, and older compatible
  response behavior.
- Keep the existing model-ratio and price formulas unchanged when a valid
  priceable group exists.

## Non-Goals

- Do not mutate or remove values from upstream `model.enable_groups`.
- Do not change upstream site configuration, channel abilities, or group
  permissions.
- Do not delete invalid API keys or add cross-site key deletion.
- Do not change model ratio, completion ratio, recharge-rate, or currency
  formulas.
- Do not add a user setting or a new group-management workflow.
- Do not add Playwright coverage for logic that focused Vitest can prove.
- Do not record group names, model names, sites, or pricing values in telemetry.

## Terminology

- **Supported group**: a group in `model.enable_groups`. It is a site/channel
  capability fact and does not prove that the current account can use it.
- **Usable group**: a supported group the current account or runtime key is
  allowed to use.
- **Priceable group**: a usable group with a finite multiplier in
  `group_ratio`, so Model List can calculate a group-adjusted price.
- **Group access state**: whether group access is known, recovered from a
  compatible priced response, unknown, or not applicable to the source.
- **Group semantics applicability**: a stable source fact stating whether the
  source can conceptually scope models or actions by an account/runtime-key
  group. It is independent of whether pricing and group-filter UI are available
  for the current response.

## Considered Approaches

### Filter `enable_groups` Inside Adapters

This is the smallest transport change, but it destroys the global site
capability fact and prevents the expanded details view from matching New API's
own metadata presentation. It also makes a product display policy mutate an
upstream fact.

### Patch Each Consumer

Each component and hook could intersect groups locally. This leaves several
copies of the same access policy across filtering, pricing, verification, and
key creation. It is likely to drift again and makes empty/unknown compatibility
behavior inconsistent.

### Derive A Product-Owned Group Context

This is the selected approach. Preserve the pricing response and attach a
small, source-scoped group context while building Model List rows. Downstream
code consumes the explicit supported, usable, or priceable set required by its
job.

This is a typed row property, not a React context provider. It adds no global
state and no extra fetching.

## Product Contract

Introduce a feature-domain contract equivalent to:

```ts
type ModelGroupAccessState =
  | "known"
  | "compatible-priced-fallback"
  | "unknown"
  | "not-applicable"

interface ModelGroupContext {
  accessState: ModelGroupAccessState
  supportedGroups: string[]
  usableGroups: string[]
  priceableGroups: string[]
}

type ModelListGroupSemantics = "account-or-runtime-key" | "not-applicable"
```

The exact implementation names may be refined in the implementation plan, but
the four states, three group sets, and stable group-semantics source fact are
required. The source fact belongs beside the source descriptor's dynamic
capabilities. It must be established before response-level capability
downgrades such as `toCatalogOnlyCapabilities` and must not be inferred from
the resulting `supportsGroupFiltering` value.

Account and all-account New API/OneHub-compatible sources use
`account-or-runtime-key`. Sub2API also uses `account-or-runtime-key`, including
when its runtime-key group or pricing is unresolved. VoAPI V2 also uses
`account-or-runtime-key` even though its model-list catalog/readiness and direct
pricing are unsupported. AIHubMix, SharedChat, and profile sources use
`not-applicable`. Unsupported catalog/readiness and catalog fallback are not
group-semantics classifications: they preserve the owning source's stable value
while dynamic filtering and pricing capabilities may be disabled.

The current selection derives a second, transient view without changing the
base context:

```ts
interface ActiveModelGroupContext {
  activeUsableGroups: string[]
  activePriceableGroups: string[]
  actionGroups: string[]
}
```

When the user has selected groups, `activeUsableGroups` is the intersection of
that selection with `usableGroups`; otherwise it is all `usableGroups`.
`activePriceableGroups` is the intersection of `activeUsableGroups` with
`priceableGroups`. `actionGroups` is the single `effectiveGroup` when one was
chosen from active priceable groups, otherwise it is `activeUsableGroups`.
This preserves an explicit selection of a usable-but-unpriced group for
verification and key actions instead of silently widening the action back to
every usable group.

Group values are normalized by trimming empty strings and removing duplicates
without locale-dependent sorting. The upstream order remains the display order
where it is meaningful.

`PricingResponse.usable_group` changes from `Record<string, string>` to
`Record<string, unknown>`. Values remain opaque; only non-empty keys
participate in access resolution. This product type change is required rather
than optional because New API versions expose more than one value shape.

## Resolution Rules

Resolution occurs independently for every pricing response and source
identity. It must not union a runtime key's group context with another key or
account before calculating that row's effective group.

### Known Account Or Runtime-Key Access

When group filtering applies and `usable_group` has keys:

```text
supportedGroups = normalized enable_groups
usableGroups = supportedGroups intersect keys(usable_group)
priceableGroups = usableGroups intersect finite keys(group_ratio)
accessState = known
```

A valid zero multiplier remains a real configured value. It must not become
`1` through truthiness fallback. This rule applies through OneHub
normalization, group-option aggregation, label formatting, and final price
calculation, not only inside the new resolver.

### Compatible Priced Fallback

Some older compatible responses may provide `group_ratio` but an empty
`usable_group`. When group filtering applies and finite ratio entries exist:

```text
usableGroups = supportedGroups intersect finite keys(group_ratio)
priceableGroups = usableGroups
accessState = compatible-priced-fallback
```

This fallback uses only groups with actual response-level pricing evidence. It
never promotes every `enable_groups` value or invents an arbitrary `1x`.

### Access-State Decision Order

The resolver applies these rules in order, using the stable source group
semantics plus response metadata:

1. If `source.groupSemantics` is `not-applicable`, resolve
   `not-applicable`.
2. If `usable_group` has non-empty keys, resolve `known` using the intersection
   rules above.
3. If `usable_group` is empty but `group_ratio` has finite entries, resolve
   `compatible-priced-fallback` using only those priced keys.
4. If both maps are empty and either `model_list_source.supportsPricing ===
   false` or the row carries unavailable pricing metadata for a catalog-only,
   unknown-key-group, or unavailable-price source, resolve `unknown`.
5. Otherwise, a successfully adapted direct account-pricing response with
   group filtering enabled resolves `known` with empty usable and priceable
   sets. Direct New API and OneHub responses fall into this final rule when the
   current account has no usable group.

For `known` empty access, keep the model row visible, expose no interactive
group or comparable price, and render current-account no-usable-group guidance.
For `unknown`, keep the row visible with its existing unavailable-price reason
and expose no interactive group. For `not-applicable`, omit all group filters,
badges, summaries, and actions. A neutral multiplier may still be used
internally by existing non-group price calculations; it is not exposed as a
synthetic `default (1x)` group.

## Data Flow

1. An adapter returns the product `PricingResponse` without altering
   `enable_groups`.
2. The Model List response-to-row boundary resolves a `ModelGroupContext` from
   stable source group semantics, dynamic source capabilities, source pricing
   metadata, `usable_group`, `group_ratio`, and the model's `enable_groups`.
3. `RawModelItem` and `CalculatedModelItem` carry that context with the
   source-scoped group ratios.
4. Single-account and all-account group options aggregate usable groups. Ratio
   display metadata remains optional for usable-but-unpriced groups.
5. The current selection derives active usable, active priceable, and action
   groups. Effective-group and comparable-price selection use only active
   priceable groups.
6. Model rows receive the resolved context rather than reconstructing group
   policy from the raw model.
7. Verification and key actions use `actionGroups`. They never fall back to all
   supported groups for a group-aware account source.
8. Supported-only groups are rendered only in the expanded read-only metadata
   section.

## Product Surface Behavior

### Filters

- Single-account and all-account group filters list usable groups.
- A usable group with no multiplier remains selectable for model-availability
  filtering but shows no invented ratio.
- Price sorting and lowest-price badges ignore rows that lack a priceable group
  for the active selection.
- Selecting a usable-but-unpriced group keeps matching model rows visible,
  renders price unavailable for that selection, and preserves that exact group
  for verification and key actions.
- After a successfully loaded pricing refresh, the single-account selection is
  intersected with the new usable-group set. If the intersection is empty, it
  becomes `[]`, meaning all currently usable groups.
- After all-account pricing contexts have settled, each account's excluded
  group set is intersected with that account's new usable-group set and empty
  entries are removed. Loading, partial failure, and source switching do not
  clear either selection state before current pricing has settled.

### Card Summary

- The compact group summary counts and labels only current usable groups.
- A ratio suffix is shown only when that usable group is priceable.
- `vip` from the reported response is therefore not rendered as `vip (1x)` for
  an account whose usable groups contain only `default`.

### Expanded Details

- **Current usable groups** are interactive and may show a real ratio.
- A usable-but-unpriced group is shown with an unavailable-price explanation
  and cannot participate in price comparison.
- **Site-supported groups** displays only the supported-but-unusable difference
  as plain, read-only tags with no multiplier and no click behavior.
- The supported-only section is omitted when that difference is empty. This
  avoids duplicating groups already visible in the primary current-usable
  section while preserving every additional raw support fact.

### Availability And Recovery

- Unavailable guidance recommends only usable groups.
- Model support and account access remain separate facts: a model may support a
  group that the account cannot use.
- Missing price information is not described as model unavailability or as a
  `1x` group.

### Verification And Key Actions

- Single-model verification, batch verification, and Model Key Dialog receive
  only `actionGroups`.
- A usable-but-unpriced group remains eligible for verification and key
  creation because access and pricing are separate capabilities.
- A supported-but-unusable group remains read-only metadata and is never sent
  as an action candidate.

### Ratio Copy

- Ordinary One API/New API-compatible token rows label `model_ratio` as
  **Model ratio**.
- Estimated direct-price rows that intentionally display an effective group
  multiplier label it as **Group ratio**.
- Group labels append `(Nx)` only when the multiplier is known.
- New or changed copy is synchronized across all supported application locales.

## Failure And Compatibility Behavior

- A missing `usable_group` in the strict New API adapter remains a protocol
  error; UI code does not silently invent access.
- OneHub and DoneHub use the account group map already normalized into
  `usable_group` and `group_ratio`.
- Sub2API with a resolved runtime-key group produces one known usable and
  priceable group scoped to that key.
- Sub2API catalog or unresolved-key pricing retains its existing unknown-price
  state and does not expose synthetic groups, even though its response-level
  capabilities have been downgraded to disable group filtering.
- VoAPI V2 remains group-aware even while its model-list catalog/readiness and
  direct pricing are unsupported; those unsupported capabilities do not erase
  its account-or-runtime-key group semantics.
- AIHubMix and profile sources are explicitly group-semantics
  `not-applicable` and continue without group UI. A catalog fallback preserves
  its owning source's applicability so an unavailable New API or Sub2API
  response is `unknown`, not silently reclassified as `not-applicable`.
- Empty `enable_groups` for catalog-only models does not remove the model row.
- Existing cache entries remain readable because the derived group context is
  recomputed from each cached `PricingResponse`; it is not persisted as a new
  wire field.
- Finite zero group ratios remain zero through OneHub normalization, option
  aggregation, labels, and price calculation. Truthiness fallback is not used
  for a configured multiplier.

## Testing

Use TDD at the response-to-row and behavior surfaces.

### Pure Group Resolution

Cover:

- supported `[default, vip]`, usable `[default]`, ratios `{default: 1}`;
- usable-but-unpriced groups;
- selecting one usable-but-unpriced group preserves that exact action group;
- compatible fallback from real ratio keys;
- authoritative empty access;
- unknown runtime-key/catalog access;
- not-applicable sources;
- a Sub2API catalog-only capability downgrade remains group-semantics
  applicable and resolves empty access as `unknown`;
- a VoAPI V2 source remains `account-or-runtime-key` independently of its
  unsupported model-list readiness and direct-pricing capabilities;
- an AIHubMix source remains `not-applicable` independently of its dynamic
  pricing capabilities;
- duplicate and blank keys;
- valid zero ratios;
- per-source isolation for two runtime keys or accounts.

### Model List Hook

Cover single-account and all-account behavior:

- filters expose usable groups only;
- supported-but-unusable groups cannot become effective groups;
- unpriced usable groups do not win lowest-price comparison;
- selected groups clamp after pricing refresh;
- all-account excluded groups repair only after settled pricing refreshes;
- all-account account filters keep source identities isolated;
- existing exact price comparisons remain unchanged for priceable groups.

### Components

Cover:

- card summaries omit fabricated `vip (1x)`;
- known ratios render normally;
- usable-but-unpriced groups render without a fake multiplier;
- expanded details separate usable groups from supported metadata;
- supported metadata is read-only;
- model-ratio and group-ratio copy follow the value source.

### Verification And Key Workflows

Cover:

- single-model verification receives usable groups rather than supported
  groups;
- batch verification does not fall back to supported-but-unusable groups;
- Model Key Dialog excludes supported-but-unusable groups while retaining
  usable-but-unpriced groups.

### Regression Gates

Run focused adapter, OneHub transform, Sub2API estimate, Model List hook,
component, batch-verification, and Model Key Dialog tests. Then run related
Vitest, locale extraction validation when copy changes, compile, `knip`,
`validate:staged`, and `validate:push` because shared TypeScript contracts and
Model List behavior change.

No Playwright test is planned. The risk is deterministic data derivation and
React rendering rather than browser-extension runtime behavior.

## Release Readiness

- **Telemetry:** none. This is a correctness and semantic-labeling fix; it adds
  no new user action or privacy-safe product question requiring measurement.
- **Settings search and deep links:** not applicable; no setting changes.
- **Documentation:** no end-user documentation page is required. App locale
  copy changes are part of the implementation.
- **Maintainability:** centralize group derivation in one pure feature-domain
  module. Do not add site-type branches or a React provider.

## Expected Files

The implementation plan must verify exact placement, but the expected surface
is:

- a new pure group-context module under `src/features/ModelList/`;
- `src/features/ModelList/modelManagementSources.ts` for the stable source
  group-semantics fact kept separate from dynamic display capabilities;
- `src/services/modelList/pricingModel.ts` for the required opaque usable-group
  value contract;
- `src/services/apiService/oneHub/transform.ts` for zero-ratio preservation;
- `src/features/ModelList/hooks/useFilteredModels.ts`;
- `src/features/ModelList/ModelList.tsx` and selection repair logic;
- `src/features/ModelList/components/ControlPanel.tsx`;
- `src/features/ModelList/components/AllAccountsGroupFilterMenu.tsx`;
- `src/features/ModelList/components/ModelDisplay.tsx`;
- `src/features/ModelList/components/ModelItem/**`;
- `src/features/ModelList/groupLabels.ts`;
- `src/features/ModelList/batchVerification.ts`;
- Model Key Dialog group-selection wiring;
- `src/services/models/utils/modelPricing.ts` only where strict group-aware
  calculation requires an unavailable result;
- `src/locales/*/modelList.json` and any affected key-dialog locale namespace;
- focused tests corresponding to those modules.

## Completion Criteria

- supported-only groups remain available as read-only metadata;
- every group-aware account row carries one source-scoped group context;
- current usable filters and actions never include supported-only groups;
- price comparisons and ratio labels never use a group without a real
  multiplier;
- missing ratios are not rendered or calculated as fabricated `1x` values;
- usable-but-unpriced groups remain available for non-pricing actions;
- an explicit usable-but-unpriced selection remains the exact action scope;
- not-applicable and unknown sources keep their existing rows without synthetic
  group UI;
- catalog-only capability downgrades do not erase whether the owning source has
  group semantics;
- single-account selections and all-account exclusions repair only after
  settled refreshed access changes;
- configured zero multipliers remain zero end to end;
- ordinary rows clearly label model ratio, while estimated group-rate rows
  clearly label group ratio;
- New API, OneHub/DoneHub, Sub2API, VoAPI V2, AIHubMix, catalog, and profile
  paths retain their intended behavior;
- focused, related, locale, compile, knip, staged, and push validation gates
  pass.
