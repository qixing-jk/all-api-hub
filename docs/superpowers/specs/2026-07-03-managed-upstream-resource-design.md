# Managed Upstream Resource Staged Migration Design

Date: 2026-07-03

## Purpose

Replace the product-layer assumption that every managed-site upstream entry is a
New API-shaped `ManagedSiteChannel`, but do it as a staged migration by managed
site type and feature surface.

The user-facing product concept remains **channel** during this work. The
`ManagedUpstreamResource` name is an internal architecture term for adapter-owned
native resources such as channels, providers, or outbound routes.

## Problem

Managed-site features currently depend on New API-shaped channel fields:

- numeric `id`;
- `key`;
- `base_url`;
- CSV `models`;
- `group`;
- `priority`;
- `weight`;
- `model_mapping`.

That shape works for New API-family backends but does not accurately represent
all managed sites:

- Octopus has outbound channels with `base_urls[]`, `keys[]`, `model`,
  `auto_sync`, and match/proxy fields.
- AxonHub has GraphQL channel resources with string ids, `baseURL`,
  credential objects, model arrays, settings, and ordering weight.
- Claude Code Hub exposes providers rather than New API channels, with
  provider-specific key reveal and masked-key behavior.
- DoneHub and Veloera are close to New API but still have site-specific update
  and secret behavior.

The architectural problem is real, but an all-at-once product contract
replacement is too risky. Shared edit, migration, model-sync, redirect, storage,
and copy surfaces are tightly coupled today. A single broken resource abstraction
can break every managed-site edit flow.

## Goals

- Introduce internal `ManagedUpstreamResource` types that can represent
  non-New API native resources.
- Keep existing `ManagedSiteChannel` and `managedSites.channels` contracts
  available while site types migrate.
- Migrate one managed site type at a time through a complete core resource
  behavior slice.
- Migrate purpose-specific features only after their source and target site
  types have completed the core slice.
- Preserve current visible labels, route names, analytics taxonomy, and docs
  wording during the migration.
- Keep backend-native detail, draft state, validation, secret handling, and
  payload construction inside the adapter for each migrated site.
- Require edit updates to round-trip native detail so unsupported native fields
  are preserved.
- Prevent masked or unavailable secrets from being written back as real secrets.
- Keep fallback behavior explicit for sites and feature surfaces that have not
  migrated.

## Non-Goals

- Do not rename the user-facing "channel" surface to "resource".
- Do not remove `ManagedSiteChannel`, `ChannelFormData`, `CreateChannelPayload`,
  or `UpdateChannelPayload` from product code until every managed site and every
  applicable feature surface has migrated and the removal has its own validation
  slice.
- Do not migrate model sync, model redirect, migration, token export, channel
  filters, channel config storage, and edit UI for every site in one commit or
  PR.
- Do not add support for new managed-site backends.
- Do not redesign the entire options UI.
- Do not introduce `ManagedUpstreamResource` wording into locale JSON, toasts,
  navigation, table headings, or user-facing documentation.

## Terminology

**Managed Upstream Resource**:
An internal product model for a managed-site upstream routing or credential
entry. The native backend may call it a channel, provider, outbound, or another
term.

**Core Resource Slice**:
The per-site list/create/edit/update/delete/secret behavior for the existing
Managed Site Channels surface. Completing this slice means the site can use
resource capabilities for channel-table CRUD only.

**Feature Resource Slice**:
A purpose-specific migration such as duplicate matching, channel migration,
token batch export, model sync, model redirect, channel filters, or channel
config storage.

**Fully Resource-Migrated Managed Site**:
A managed site whose core resource slice and all applicable feature resource
slices have migrated. Only fully migrated sites are eligible for final channel
compatibility removal.

**Legacy Channel Path**:
The existing `ManagedSiteChannel` path. It remains the default for any site type
or feature surface that has not completed its migration slice.

## Target Architecture

Use a dual-path managed-site architecture while the migration is in progress:

```text
Managed-site feature or use case
  -> migration-aware managed-site facade
    -> enabled core or feature slice: managedSites.resources capability
    -> unmigrated site or feature slice: existing managedSites.channels capability
```

The facade must not force every managed site through resource mode just because
the internal types or optional capabilities exist. Each site type and feature
surface must opt in through an explicit migration gate.

The implementation should keep this gate small and testable, for example:

```ts
isManagedSiteCoreResourceSliceEnabled(siteType)
isManagedSiteFeatureResourceSliceEnabled(siteType, feature)
```

The exact helper names can follow repo conventions, but the behavior is part of
the contract: default to the legacy channel path unless a slice is explicitly
enabled and tested.

## Core Resource Model

Create internal product types for migrated core slices:

```ts
type ManagedUpstreamResourceRef = {
  managedSiteType: ManagedSiteType
  scopeKey: string
  resourceId: string
}

type ManagedUpstreamResourceSummary = {
  ref: ManagedUpstreamResourceRef
  displayName: string
  nativeKind: "channel" | "provider" | "outbound" | "unknown"
  status: "enabled" | "disabled" | "auto_disabled" | "unknown"
  typeLabel?: string
  endpointLabel?: string
  modelCount?: number
  modelPreview?: string[]
  secretState: "available" | "masked" | "unavailable" | "unsupported"
  capabilities: ManagedUpstreamResourceCapabilitySet
}

type ManagedUpstreamResourceDetail<TNative = unknown> = {
  summary: ManagedUpstreamResourceSummary
  native: TNative
}
```

Rules:

- `resourceId` is always a string.
- `scopeKey` is derived from non-secret managed-site configuration, usually the
  normalized admin origin.
- summaries are display/search rows only; they must not require New API fields
  such as `key`, `base_url`, CSV `models`, `group`, `priority`, `weight`, or
  `model_mapping`.
- adapter-specific native detail stays in `detail.native`.

## Core Capability Shape

Add optional core resource capabilities next to the existing channel
capabilities:

```ts
type ManagedUpstreamResourceCapabilityGroup<TConfig, TDetail, TDraft> = {
  items: {
    list(config: TConfig, options?: ListOptions): Promise<ResourceListData>
    search(config: TConfig, keyword: string): Promise<ResourceListData | null>
    getDetail(config: TConfig, ref: ManagedUpstreamResourceRef): Promise<ManagedUpstreamResourceDetail<TDetail>>
    create(config: TConfig, draft: TDraft): Promise<ApiResponse<ManagedUpstreamResourceSummary | null>>
    update(config: TConfig, detail: ManagedUpstreamResourceDetail<TDetail>, draft: TDraft): Promise<ApiResponse<ManagedUpstreamResourceSummary | null>>
    delete(config: TConfig, ref: ManagedUpstreamResourceRef): Promise<ApiResponse<unknown>>
  }
  drafts: {
    prepareImportDraft(input: ManagedUpstreamResourceImportInput): Promise<TDraft>
    prepareEditDraft(detail: ManagedUpstreamResourceDetail<TDetail>): TDraft
    describeFields(context: ManagedUpstreamResourceFieldContext): ManagedUpstreamResourceFieldDescriptor[]
    validateDraft(draft: TDraft): ManagedUpstreamResourceDraftValidationResult
  }
  secrets?: ManagedUpstreamResourceSecretCapability<TConfig>
}
```

Rules:

- `managedSites.channels` remains valid until all site types and feature surfaces
  migrate.
- `managedSites.resources` is optional and site-specific.
- product code must choose the resource path only for site types whose migration
  gate is enabled.
- matching, model sync, model mapping, migration, and channel config storage
  resource capabilities are not part of the initial core contract. Add them only
  inside the focused feature slice that needs them.

## Edit Flow

For a core resource-migrated site:

1. list rows render from `ManagedUpstreamResourceSummary`;
2. opening edit fetches `getDetail(config, ref)` before the form can submit;
3. adapter `prepareEditDraft(detail)` builds editable draft state;
4. adapter `describeFields(...)` describes fields for the existing channel
   dialog surface;
5. submit is disabled while detail/descriptors are loading or failed;
6. adapter `validateDraft(draft)` validates the edited draft;
7. update calls `update(config, detail, draft)` with the original native detail;
8. successful responses upsert the returned summary or refresh the list.

For an unmigrated site, keep the current `ChannelDialog` and `updateChannel`
behavior unchanged.

## Secret Rules

Secret handling is a hard boundary:

- list summaries may expose only `secretState`, never raw secret text;
- edit drafts must not treat masked keys as real keys;
- masked or unavailable secrets are preserved by omission or an adapter-owned
  unchanged marker, not by writing the masked display value back;
- a user-entered replacement secret can be written only when the field value is
  a usable real key;
- adapters with reveal support expose it through `secrets.revealSecret`;
- sites without reveal support must still be editable without forcing a key
  rewrite unless their backend truly requires a new key.

## Migration Order

Migrate managed sites in this order:

1. `new-api`: baseline slice and shared test shape.
2. `Veloera`: New API-family variant with site-specific update/secret coverage.
3. `done-hub`: New API-family variant with full-object update coverage.
4. `octopus`: validates non-New API outbound fields and model sync differences.
5. `claude-code-hub`: validates provider-native detail and secret reveal.
6. `axonhub`: validates string ids, GraphQL detail, and credential object
   preservation.

Each core migration is a separate reviewable slice. A site is core-migrated only
after its list, create, edit, update, delete, and secret tests pass. A site is
fully migrated only after every applicable feature resource slice also passes.

## Testing Requirements

Every core resource-migrated site type needs focused tests for:

- list/search summary mapping;
- detail fetch before edit;
- edit draft construction from native detail;
- update payload preserving native fields not represented by the UI;
- masked secrets not written back;
- create and delete where supported;
- unsupported capabilities returning explicit, non-user-leaking failures;
- existing visible copy still using channel wording.

Every feature resource slice needs focused tests for:

- migrated site uses resource refs and adapter-owned capability behavior;
- unmigrated site still uses the legacy channel fallback;
- persisted storage or runtime-message shapes remain backward compatible;
- user-visible copy and telemetry taxonomy stay on existing channel wording.

For UI behavior, prefer Vitest/Testing Library for dialog and table behavior.
Add or update Playwright only when the risk depends on real extension browser
integration.

## Validation

For docs-only changes, use `pnpm run validate:staged`.

For future implementation slices:

- start with the site-specific adapter and UI tests;
- run `vitest related --run` for touched TypeScript/TSX files when useful;
- run `pnpm run i18n:extract:ci` if locale or `t(...)` usage changes;
- run `pnpm compile` when shared contracts, facades, UI props, or runtime
  messages change;
- run `pnpm run validate:staged` before commit;
- run `pnpm run validate:push` before publishing a feature branch or PR that
  changes shared runtime contracts.

## Completion Criteria

The staged migration is complete only when:

- every managed site has either fully migrated resource capabilities or an
  explicit documented reason to remain on the channel path;
- every migrated feature surface has a tested legacy fallback for unmigrated
  sites;
- shared product features no longer need New API-shaped channel fields for fully
  migrated sites;
- edit flows preserve native detail and masked secrets for every core-migrated
  site;
- no user-visible copy has leaked internal resource terminology;
- a final cleanup slice removes obsolete channel compatibility only after the
  migrated behavior is fully covered.
