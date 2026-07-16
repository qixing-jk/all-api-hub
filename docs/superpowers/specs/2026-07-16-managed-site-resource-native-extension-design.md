# Managed Site Resource-Native Extension Design

Date: 2026-07-16

## Status and relationship to the 2026-07-03 design

This design is the approved follow-up to
`2026-07-03-managed-upstream-resource-design.md`.

The earlier design correctly identified the New API-shaped channel dependency
and the need to preserve upstream-native detail. Its migration-first interface,
however, still exposed product code to generic native detail, draft machinery,
and per-feature legacy fallback gates. That shape is useful as historical
context, but it is not the preferred path for a new Managed Site Type.

This design revises the direction as follows:

- existing Managed Site Types may remain on the Legacy Channel Path until a
  focused migration is justified;
- every new non-New-API-family Managed Site Type uses the Resource-Native Path;
- AxonHub is the first existing Managed Site Type migrated to prove the new
  path with controlled change size;
- native detail and mutation uncertainty stay behind the Adapter seam;
- product code sees only Resource Display Facts, an Editable Resource
  Projection, and named Product Canonical Models;
- routing is explicit and never silently falls back from resource-native mode
  to New API-shaped channel behavior.

Where the two documents conflict, this document governs new resource-native
work. The earlier document continues to describe why legacy compatibility
exists and why migration remains staged.

## Problem

The current managed-site product surface can represent the six supported
Managed Site Types, but its dominant contracts still assume New API-shaped
channels. A new, unrelated Upstream Backend would otherwise need to translate
native resources into `ManagedSiteChannel`, `ChannelFormData`, and associated
feature-specific shapes even when those fields do not exist upstream.

That translation has three costs:

1. native fields cannot be displayed or edited without expanding a New
   API-shaped product model;
2. hidden upstream fields and permission-sensitive secrets are easy to erase
   during update;
3. internal features learn UI draft shapes instead of consuming stable Product
   Canonical Models.

The solution must not overcorrect by generating an editor for the entire
upstream schema. The product should progressively expose common, verified
fields. Unedited top-level fields are preserved by omission from partial
updates; replacement objects are preserved only to the extent covered by the
authoritative detail selection and pinned target contract.

## Goals

- Make a new non-New-API-family Managed Site Type implement one resource-native
  Adapter instead of the Legacy Channel Path.
- Display safe native facts without exposing raw upstream payloads.
- Edit a product-selected field subset and expand it incrementally.
- Preserve unedited top-level fields and every selected field of a replacement
  native object, without rewriting permission-sensitive secrets.
- Give migration and future internal features named, typed capabilities that do
  not depend on editor descriptors or `ChannelFormData`.
- Keep the public Interface small enough that callers do not learn GraphQL,
  configuration, commit-certainty, or concurrency details.
- Validate the design against a pinned real AxonHub release before relying on
  protocol fields or update semantics.
- Migrate AxonHub without forcing the other existing Managed Site Types to move
  in the same change.

## Non-goals

- Editing every AxonHub channel field.
- Generating forms from GraphQL or arbitrary upstream schemas.
- A nested, array, conditional, or raw-JSON field DSL.
- A generic feature bag such as `features: Record<string, unknown>`.
- Generic batch CRUD, background-owned editor sessions, persisted drafts, or an
  idempotency framework.
- Pretending AxonHub provides ETag or compare-and-swap concurrency.
- Migrating model sync, model redirect, channel filters, batch export, and every
  existing Managed Site Type in one effort.
- Renaming existing user-facing channel copy to internal resource terminology.
- Expanding the closed legacy `ManagedSiteRuntimeConfig` union for every future
  resource-native site.

## Design principles

### Keep the public Interface deep

Callers should get list, safe detail, edit, create, and delete behavior from a
small Interface. Protocol parsing, native DTOs, clear flags, configuration
validation, secret preservation, and mutation reconciliation remain in the
Adapter implementation.

Deleting the resource-native Module should cause those concerns to reappear in
multiple callers. This is the deletion test that justifies the seam.

### Separate upstream facts from product policy

The Adapter owns Upstream Backend facts: supported operations, native fields,
authentication, pagination, clear behavior, secret availability, and protocol
failure interpretation.

The Managed Site Definition and feature Modules own product policy: which
resource kind is primary, which fields are displayed or editable now, which
actions appear, user-facing recovery, analytics taxonomy, and rollout mode.

### Make native mode explicit

Each Managed Site Definition declares exactly one resource mode:

```ts
type ManagedResourceMode = "legacy-channel" | "native-resource"
```

Native mode requires a matching registration. A missing registration is an
integration error. It must never route to the Legacy Channel Path because a
registration is absent, misconfigured, or temporarily unavailable.

## Architecture

```text
Managed Site Definition
  | resourceMode + primary resource kind + product policy
  v
Managed Resource Dispatcher
  | legacy-channel ----------------------> existing channel UI and contracts
  | native-resource
  v
Resource-Native Registration
  | opens and validates site configuration
  v
Managed Resource Workspace
  | list / get / create editor / edit editor / delete
  v
Site Adapter implementation
  | native queries, mutations, detail, secrets, preservation, error mapping
  v
Upstream Backend

Named internal feature
  -> named Site Adapter Capability
  -> feature-owned Product Canonical Model
```

### Managed Site Definition

The definition owns static product decisions:

- `resourceMode`;
- the primary managed resource kind and user-facing label keys;
- configuration/settings navigation target;
- rollout readiness and product-visible actions.

The definition does not own native DTOs, GraphQL operations, configuration
loading, credentials, editor state, or feature implementation objects.

### Resource-Native Registration

The registry maps a Managed Site Type and resource kind to a registration.
Registration is explicit production wiring. An exhaustive typed registry and a
focused completeness test catch a definition whose registration is missing;
`knip` remains the dead-export and dependency gate.

Each registration opens its own configuration and returns a ready Workspace.
New sites therefore do not have to join the central legacy six-site runtime
configuration union.

A strongly typed factory may correlate site-specific types:

```ts
defineNativeResourceKind<
  TConfig,
  TLocator,
  TListItem,
  TDetail,
  TCreateCommand,
  TUpdateCommand
>(definition)
```

The factory erases those generics inside a closure before registry storage.
There is no public `TNative = unknown`, registry-level cast, or conversion to
`ChannelFormData`. If a site exposes multiple native resource kinds, each kind
gets its own correlated factory instance. The definition owns validated
`TLocator` encoding and decoding to the public opaque `resourceId`.

### Public Workspace Interface

The feature-facing Interface remains intentionally small:

```ts
type ResourceOperationOptions = {
  signal?: AbortSignal
}

interface ManagedResourceWorkspace {
  readonly supportsSearch: boolean

  list(
    query?: ResourceListQuery,
    options?: ResourceOperationOptions,
  ): Promise<ResourcePage>
  get(
    ref: ManagedResourceRef,
    options?: ResourceOperationOptions,
  ): Promise<ResourceDisplayFacts>
  openCreateEditor(
    options?: ResourceOperationOptions,
  ): Promise<ResourceEditor>
  openEditEditor(
    ref: ManagedResourceRef,
    options?: ResourceOperationOptions,
  ): Promise<ResourceEditor>
  delete(
    ref: ManagedResourceRef,
    options?: ResourceOperationOptions,
  ): Promise<void>
}

interface ResourceEditor {
  readonly fields: readonly ResourceFieldDescriptor[]
  readonly initialValues: EditableResourceProjection

  validate(values: EditableResourceProjection): ResourceValidationResult
  submit(
    values: EditableResourceProjection,
    options?: ResourceOperationOptions,
  ): Promise<ResourceDisplayFacts>
}
```

`ManagedResourceRef` is serializable and contains the Managed Site Type,
resource kind, non-secret scope key, and an Adapter-produced opaque string
`resourceId`. The string is bounded, stable for the resource lifetime, and must
not contain secrets. An Adapter that eventually needs composite identity owns
canonical encoding and decoding behind the seam rather than exposing a JSON
locator to callers.

`ResourcePage.total` and cursors are optional. The Interface must not assume
page-number pagination or a known total.

A search term in `ResourceListQuery` always means resource-wide search, never
filtering only the currently loaded page. An Adapter must perform upstream-wide
search, load every required page before filtering, or explicitly declare search
unsupported through `supportsSearch` so the product does not render the control.

### Resource views and editor fields

`ResourceDisplayFacts` are the single safe read-only projection for both list
and detail surfaces. A list response may select fewer display facts than `get`,
but both use the same product model and never contain raw native detail or
credentials.

The first renderer supports only common primitive field kinds:

- text;
- textarea;
- number;
- boolean;
- select;
- multi-select;
- secret.

Nested native values may be exposed as a flat product field, for example
`settings.extraModelPrefix` as a text field. There is no raw JSON editor and no
generic nested-field DSL in the first implementation. Omitting JSON is an
approved first-slice simplification, not a statement that future site-specific
editors can never validate a structured field.

React owns mutable form values. The editor supplies immutable descriptors,
initial safe values, validation, and submit behavior. Native detail remains in
the editor closure.

Secret fields use explicit intent rather than masked-string inference:

```ts
type SecretEditIntent =
  | { kind: "unchanged" }
  | { kind: "replace"; value: string }
  | { kind: "clear" }
```

An Adapter exposes `clear` only when the verified Upstream Backend supports it.
Masked, unavailable, or permission-hidden credentials can never become a
replacement value.

### Named internal capabilities

Migration, model sync, matching, and future internal features do not consume
the Workspace editor Interface. They use separately registered, named Site
Adapter Capabilities and feature-owned Product Canonical Models.

For example, migration owns canonical source, preview, command, and per-item
result models. The AxonHub Adapter maps between those models and native channel
operations. The compatibility facade may translate current
`ManagedSiteChannel` inputs at the migration entry point while the old UI is
being cut over, but native capabilities never accept `ChannelFormData`.

Capabilities are added only when a feature is migrated. There is no anonymous
capability bag and no inference from editor fields.

## Errors, mutation certainty, and concurrency

### Public failures stay actionable

Opening a registration succeeds with a ready Workspace or throws a
`ManagedResourceError` carrying the typed safe failure below. Every Workspace
operation uses the same rejection contract. Loading/checking is UI state, not a
shared configuration-state union.

Reads and public mutations use one typed failure shape:

```ts
type ResourceFailure = {
  code:
    | "configuration_required"
    | "invalid_configuration"
    | "authentication_failed"
    | "permission_denied"
    | "validation_failed"
    | "not_found"
    | "mutation_state_uncertain"
    | "unavailable"
    | "upstream_rejected"
    | "aborted"
    | "unexpected"
  fieldIssues?: readonly ResourceFieldIssue[]
}
```

The failure contains no endpoint, raw backend message, cause, stack, secret,
resource name, or other user-entered value. The Workspace is solely responsible
for translating Adapter errors and mutation certainty into this failure. The UI
controller combines the controlled code, operation context, and the
definition-owned settings target to choose localized copy and actions such as
retry, refresh, reload editor, or open settings.

### Mutation certainty is implementation detail

An Adapter may internally classify a mutation as applied, not applied, possibly
applied, or partially applied. This is necessary for cases such as a lost
response or AxonHub create followed by a status mutation. It is not part of the
ordinary CRUD Interface.

The Workspace maps certainty to a safe public success or failure:

- confirmed success returns the new Resource Display Facts;
- confirmed rejection may permit retry while retaining editor values;
- possible or partial application becomes `mutation_state_uncertain`; the UI
  controller requires refresh/reload confirmation and never automatically
  replays it;
- delete of an already missing resource is treated as achieving the desired
  state.

Batch migration is different: per-item success, failure, and skipped outcomes
are a Product Canonical Model because users need them. That product-level
partial result does not expose protocol steps.

### Editor submission

The editor implementation is single-flight. Concurrent calls return the same
in-flight Promise or are rejected before dispatch. The UI also disables submit
while saving, but correctness does not depend on the button state.

Successful submissions close the native editor session and return Resource
Display Facts that the controller may upsert; it refreshes instead if the
returned facts are insufficient. Possibly applied, partially applied, and
not-found submissions close the session and require a fresh read. A local
validation failure or a confirmed pre-dispatch failure may keep the editor
usable. The state machine is internal; callers do not learn its states.

Abort before dispatch is a confirmed non-application. Abort after dispatch with
no acknowledgement is possibly applied and requires refresh confirmation.

### AxonHub concurrency

The verified AxonHub release exposes `updatedAt` but its channel update mutation
does not accept an expected version, ETag, or other precondition. A read-before-
write comparison would still race with the subsequent write and must not be
described as concurrency protection.

The first AxonHub slice therefore:

- sends only changed top-level fields and verified clear flags;
- preserves hidden settings fields when updating `settings.extraModelPrefix`;
- never sends unchanged credentials;
- accepts the absence of client-enforced conflict detection; concurrent results
  follow the Upstream Backend's mutation ordering and merge semantics;
- does not expose revision or generic compare policy through the Interface.

If a future Upstream Backend offers conditional mutation, add a controlled
`conflict` failure code when that real Adapter needs it; no current public code
or revision contract is reserved for the hypothetical case.

## AxonHub reference implementation

AxonHub is the first existing Managed Site Type migrated because it already has
a dedicated GraphQL integration and is unrelated to the New API family. It
tests string ids, cursor pagination, credential objects, native settings, and
partial update semantics without requiring a new production Site Type in this
effort.

### Verified upstream baseline

The baseline was retrieved on 2026-07-16:

- repository: `looplj/axonhub`;
- latest release: `v1.0.0-beta5`, published 2026-07-11;
- release commit: `d061ac7df6aef0c5ec6cdfa9dc5002546a1c5a57`;
- default branch: `unstable`;
- forward-check commit:
  `213b8c888ae6f7d297ff59126798914d34152b98`.

Implementation source priority is:

1. exact target-deployment evidence, fork, and build/version when supplied,
   including sanitized introspection or traces;
2. the exact release tag matching that target, or the explicitly selected
   latest release when no target version is supplied;
3. the default branch only as a non-binding forward drift check that never
   silently overrides the first two sources;
4. the current local Adapter as historical behavior, not upstream truth.

Pinned primary sources:

- [release](https://github.com/looplj/axonhub/releases/tag/v1.0.0-beta5);
- [channel schema](https://github.com/looplj/axonhub/blob/d061ac7df6aef0c5ec6cdfa9dc5002546a1c5a57/internal/ent/schema/channel.go#L102-L155);
- [CreateChannelInput](https://github.com/looplj/axonhub/blob/d061ac7df6aef0c5ec6cdfa9dc5002546a1c5a57/internal/server/gql/ent.graphql#L1558);
- [UpdateChannelInput](https://github.com/looplj/axonhub/blob/d061ac7df6aef0c5ec6cdfa9dc5002546a1c5a57/internal/server/gql/ent.graphql#L5993);
- [channel mutations](https://github.com/looplj/axonhub/blob/d061ac7df6aef0c5ec6cdfa9dc5002546a1c5a57/internal/server/gql/axonhub.graphql#L815);
- [permission-sensitive credential field](https://github.com/looplj/axonhub/blob/d061ac7df6aef0c5ec6cdfa9dc5002546a1c5a57/internal/server/gql/axonhub.graphql#L667-L670);
- [credential permission resolver](https://github.com/looplj/axonhub/blob/d061ac7df6aef0c5ec6cdfa9dc5002546a1c5a57/internal/server/gql/axonhub.resolvers.go#L50-L55);
- [channel create/update validation](https://github.com/looplj/axonhub/blob/d061ac7df6aef0c5ec6cdfa9dc5002546a1c5a57/frontend/src/features/channels/data/schema.ts);
- [upstream settings merge helper](https://github.com/looplj/axonhub/blob/d061ac7df6aef0c5ec6cdfa9dc5002546a1c5a57/frontend/src/features/channels/utils/merge.ts).

Live network access is not a required PR validation gate. Tests use minimal
handwritten fixtures derived from the pinned contract. A manual or scheduled
forward check may report drift against `unstable`, but default-branch drift does
not silently change release behavior.

### First editable field set

The first slice preserves current AxonHub parity and adds a limited set of
commonly useful native fields.

This allowlist is the approved first AxonHub cutover scope. It is intentionally
larger than parity-only CRUD so the new path proves progressive native editing,
but implementation must not add further fields opportunistically.

| Field | Create | Update/clear behavior | First slice rule |
| --- | --- | --- | --- |
| `name` | required | optional update | display and edit |
| `type` | required | optional update | display and edit only within verified regular-key-compatible types |
| `baseURL` | optional | `clearBaseURL` | display and edit |
| `status` | omitted; defaults to disabled | editor update uses `UpdateChannelInput.status`; enabled create uses a follow-up status mutation | display and edit; reconcile create follow-up failure |
| regular API key | required only for first-slice regular-key create types | optional credentials replacement | secret intent; unchanged or unavailable omitted; no initial clear action |
| `supportedModels` | required | optional replacement | display and edit; validate product invariants |
| `manualModels` | optional | `clearManualModels` | display and edit |
| `defaultTestModel` | required | optional update | display and edit |
| `autoSyncSupportedModels` | optional | optional update | display and edit |
| `autoSyncModelPattern` | optional | `clearAutoSyncModelPattern` | display and edit |
| `tags` | optional | `clearTags` | display and edit |
| `orderingWeight` | optional | optional update | display and edit |
| `remark` | optional | `clearRemark` | display and edit |
| `settings.extraModelPrefix` | inside optional settings | settings object update; empty string clears the prefix | expose as text; merge every pinned-contract settings field selected by the authoritative detail query; never use `clearSettings` |

The release creates channels as `disabled` because status is excluded from
`CreateChannelInput`. Creating an enabled channel may therefore require a
second mutation. Partial or uncertain completion is handled internally and the
UI is told to refresh before retrying.

The first slice edits regular API-key credentials only. Create type options are
limited to channel types whose pinned-release validation accepts regular API
keys. Existing OAuth, AWS, or GCP credential channels remain viewable and may
edit safe non-credential fields, but changing their type or credentials is
deferred.

The implementation field matrix must enumerate the exact regular-key type
allowlist from the pinned release. The beta5 frontend validation identifies
`codex`, `claudecode`, `antigravity`, and `github_copilot` as OAuth credential
types, `anthropic_gcp` as GCP credentials, and `anthropic_aws` as a non-regular-
key credential type. These types are excluded. Any type not explicitly
enumerated with pinned validation evidence is excluded by default rather than
falling back to the regular-key form.

### Deferred AxonHub fields

The Adapter selects these fields when they are needed to preserve a replacement
object, but the first UI does not edit them:

- model mappings and automatic trimmed prefixes;
- endpoints;
- policies;
- rate limits and proxy configuration;
- header/body overrides and pass-through settings;
- AWS, GCP, and OAuth credentials;
- disabled-key management;
- provider-quota settings;
- archived-status lifecycle beyond the product actions explicitly designed for
  it.

`archived` must not be collapsed into `disabled`. The pinned release returns
`null` credentials when the caller lacks channel-write permission, which must
not be interpreted as empty credentials. Defensive masked-string detection may
remain as compatibility hardening for forks or deployments, but masking is not
asserted as the beta5 protocol contract.

Unedited top-level fields are omitted from partial update commands. When an
edited field belongs to a replacement object such as `settings`, the Adapter
merges every field defined by the pinned target contract and returned by the
authoritative detail query. Preservation of unknown or unselected fork-specific
fields is not claimed until target-deployment evidence extends that contract.

Before implementation, the AxonHub Adapter work records a field matrix with:
field, read selection, create input, update input, clear behavior, editable-now
decision, and preservation rule. If the user's deployment differs from the
pinned release, that deployment wins and the difference is documented near the
protocol implementation.

## Migration and compatibility

The Legacy Channel Path remains available for existing non-migrated Managed
Site Types. It may receive compatibility fixes and migration glue, but new
features default to the Resource-Native Path.

AxonHub cutover must include its currently exposed channel-migration workflow.
Otherwise the new page would still depend on `ManagedSiteChannel` and
`ChannelFormData`, undermining the seam. The migration feature receives a named
canonical capability before the AxonHub UI switches modes.

Other existing Managed Site Types do not need to migrate for AxonHub to use the
new path. A static Managed Site Definition mode is the rollback switch: reverting
AxonHub to `legacy-channel` restores the old path. Runtime errors never trigger
that switch automatically.

The following old shapes are legacy-only and must not be used by a new native
registration:

- `ManagedUpstreamResourceDetail<TNative = unknown>`;
- generic `items`/`drafts` capability groups from the 2026-07-03 proposal;
- a facade that casts native data to `ChannelFormData`;
- feature gates inferred from registration presence;
- the closed core-site migration gate as the long-term source of truth.

## Testing strategy

### Public Interface contract tests

A reusable contract suite runs against AxonHub and a minimal test-only Adapter.
The synthetic Adapter is not a production Site Type. It proves that the public
Interface does not accidentally depend on AxonHub or New API assumptions by
using:

- a nonnumeric opaque string resource id;
- cursor pagination without a total;
- a masked secret state;
- one hidden nested native field preserved across an allowed edit.

PR 2 extends capability contract coverage with one test-only named capability;
PR 1 does not introduce feature capability machinery only for a synthetic test.

The contract suite tests the public Interface rather than registry casts or
implementation call order.

### AxonHub Adapter tests

Focused tests cover:

- operation names, variables, required selections, cursor handling, and string
  ids without whole-document GraphQL snapshots;
- mapping the first field set to Resource Display Facts and editable values;
- nullable and permission-hidden credentials, with defensive masked-string
  compatibility hardening tested separately from the beta5 contract;
- editing one field emits only that top-level update plus required merged
  native objects;
- unchanged secret omission and replacement-secret emission;
- verified clear flags for base URL, manual models, pattern, tags, and remark;
- `settings.extraModelPrefix` updates preserve every pinned-beta5 settings
  field selected by the authoritative detail query;
- supported/manual model semantics and default-test-model validation;
- `archived` remains distinct from disabled;
- create plus status follow-up partial/uncertain application maps to
  `mutation_state_uncertain` and is not automatically retried;
- deferred credentials, endpoints, policies, and settings are not cleared.

Fixtures use reserved example domains, fake ids, and fake model names. Real
protocol field and enum names remain because they are the contract. Production
response dumps and real credentials are prohibited.

### Dispatcher and UI tests

Vitest and Testing Library cover:

- explicit native/legacy dispatch and native-registration-missing failure;
- loading, configuration-required, authentication, permission, empty, list
  error, retry, detail, create, edit, delete, and refresh-recovery states;
- the configuration-required CTA uses the definition-owned settings deep link
  and can retry after configuration changes;
- primitive field renderers and field validation;
- masked secret behavior;
- double-submit prevention and late-result protection;
- no automatic replay after possible or partial mutation application;
- resource-wide search either spans multiple upstream pages or is not rendered
  when the Adapter declares it unsupported;
- existing route, search, localized copy, and analytics behavior.

There is no UI test matrix for internal commit-certainty states. Controller
tests assert only the corresponding product recovery action.

### Migration tests

Migration retains product-level per-item outcomes:

- preview ready/blocked states;
- successful, failed, and skipped rows with aggregate counts;
- unavailable or compatibility-masked source secrets are blocked;
- successful rows are not rolled back when another row fails;
- AxonHub uses its named capability and never reads editor descriptors.

Before PR 3, the existing migration dialog must run through the named
capability for AxonHub as both source and target. Equivalence tests preserve row
identity and selection, type mapping, warnings, masked/unavailable-secret
blocking, per-row failure, aggregate counts, successful-row retention, and the
post-execution refresh behavior.

### E2E decision

The substrate and canonical migration PRs do not add Playwright coverage because
their risks are better exercised through contract and feature tests. The final
AxonHub UI cutover adds or extends one stable Chromium options-page scenario
covering route selection, a representative edit, intercepted GraphQL, and list
refresh. It does not require a real AxonHub deployment in CI.

## Delivery slices

### PR 1: resource-native substrate and AxonHub registration

Expected scope: approximately 6-9 production files and 2-4 test files.

- add refs, display/editor contracts, safe failures, registration factory,
  registry, and explicit dispatcher requirements;
- add direct AxonHub native queries/mutations and field preservation;
- keep current AxonHub legacy resources wired for existing callers;
- add pinned upstream comments near protocol-dependent implementation;
- add contract and Adapter tests;
- do not change the production UI, migration dialog, locales, or analytics.

Suggested commits:

1. `refactor(managed-sites): add resource-native workspace contracts`
2. `refactor(axonhub): register native resource adapter`

### PR 2: canonical migration capability and AxonHub bridge

Expected scope: approximately 5-8 production files and 3-5 test files.

- define feature-owned migration source, preview, command, and result models;
- add named AxonHub migration capability;
- translate current legacy migration inputs only at the feature entry point;
- route the existing dialog through the capability for AxonHub as source and
  target, preserving row identity/selection, type mapping, warnings, copy,
  analytics, unavailable-key blocking, per-row results, and refresh behavior;
- remove AxonHub from the old generic migration gate after the named capability
  becomes the production route.

Suggested commits:

1. `refactor(managed-sites): define canonical migration capabilities`
2. `refactor(axonhub): route migration through native capabilities`

If this slice exceeds eight production files or requires a migration-dialog
rewrite, split capability core and compatibility UI facade into separate PRs.

### PR 3: native UI and AxonHub cutover

Expected scope: approximately 9-14 TypeScript/TSX files, relevant locale files,
and 4-7 test files plus one targeted E2E scenario.

- add the shared native resource list/view/editor UI and controller;
- cover non-happy paths and safe recovery;
- preserve route, settings navigation, search, localized copy, and analytics;
- switch the AxonHub Managed Site Definition to `native-resource` in the last
  commit;
- retain the static definition mode as the rollback switch;
- do not leave a long-term runtime feature flag or silent fallback.

Suggested commits:

1. `feat(managed-sites): add native resource editor and list`
2. `test(axonhub): cover native resource UI parity`
3. `feat(axonhub): switch managed resources to native workspace`

The per-PR file estimates are gross touched-file counts and are not additive:
the registry, AxonHub Adapter, migration entry point, and contract tests are
expected to recur across slices. The expected unique total is approximately
18-25 production TypeScript/TSX files before locale changes, 8-13 test files,
and roughly 1,500-2,600 production lines. Existing AxonHub GraphQL,
authentication, and provider logic should be reused; the current large legacy
page and dialog should not absorb the new implementation.

## Validation

Each implementation slice starts with focused affected tests. Shared contracts,
exports, and registry wiring require `pnpm compile` and `pnpm knip` through
`pnpm run validate:push` before remote handoff. Task-scoped files are staged
before `pnpm run validate:staged`. Locale changes also require
`pnpm run i18n:extract:ci`.

The final cutover additionally runs the targeted Chromium E2E scenario. A live
AxonHub deployment remains a manual integration check because credentials,
permissions, deployment version, and network availability are not stable CI
inputs.

## Observability and discoverability decisions

The AxonHub cutover reuses every action currently visible for AxonHub: create,
view, update, delete, delete selected, refresh, and migration open/toggle/execute.
Unsupported model-sync and filter actions remain absent. Controlled
result/error categories may be mapped from the new controller, but analytics
must not record URLs, resource ids, locators, names, tags, models, field values,
secrets, raw upstream messages, or other user-entered text. No passive
impression event or new settings snapshot is required.

The design does not add, rename, or move a setting. Existing AxonHub
configuration navigation and search/deep-link targets must remain valid during
cutover; no new settings-search entry is required unless implementation changes
that surface.

## Completion criteria

The design is successfully implemented when:

- a test-only unrelated Adapter and AxonHub both satisfy the same small public
  resource Interface without `ManagedSiteChannel` or `ChannelFormData`;
- AxonHub native fields in the first slice display and edit correctly;
- unedited top-level fields, selected replacement-object fields, and
  unchanged/masked credentials survive updates;
- possible or partial mutation application is never automatically retried;
- AxonHub migration uses a named Product Canonical Model capability;
- native mode cannot silently fall back to legacy mode;
- existing non-migrated Managed Site Types continue to use the Legacy Channel
  Path unchanged;
- focused tests, hook-equivalent validation, compile/knip validation, locale
  extraction where applicable, and the targeted cutover E2E pass.
