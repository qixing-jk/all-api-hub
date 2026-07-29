# Managed Site Resource-Native Extension Design

Date: 2026-07-16

Revision: 2026-07-19 - preserve the existing Managed Site Channels UI while
cutting AxonHub over to resource-native data and mutations.

Revision: 2026-07-28 - consolidate the AxonHub channel field contract into
this design as its single specification source.

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
- legacy and resource-native sites use one Managed Site Channels presentation
  system; native mode changes the controller and field data, not the page,
  table, editor, or migration visual language;
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
- Preserve the current Managed Site Channels page structure, toolbar order,
  table behavior, row actions, editor shell, migration dialog, responsive
  behavior, test ids, copy, and analytics while adding only verified AxonHub
  fields and native recovery states.

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
- Building a second resource-native page, table, row-action menu, editor shell,
  detail shell, or migration dialog that merely resembles the existing UI.
- Replacing established layout or interaction patterns as part of the AxonHub
  data cutover.

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

The mode selects the data/controller binding inside the shared Managed Site
Channels presentation. It does not select a separate page implementation.

## Architecture

```text
Managed Site Definition
  | resourceMode + primary resource kind + product policy
  v
Managed Resource Dispatcher
  | legacy-channel -> Legacy Channel Controller
  | native-resource -> Resource-Native Registration -> Native Controller
  v
Managed Site Channels Presentation
  | one page header / toolbar / table / row actions / pagination
  | one editor shell / detail layout / migration dialog view
  v
Legacy contracts or Managed Resource Workspace
  | native: list / get / create editor / edit editor / delete
  v
Site Adapter implementation
  | native queries, mutations, detail, secrets, preservation, error mapping
  v
Upstream Backend

Named internal feature
  -> named Site Adapter Capability
  -> feature-owned Product Canonical Model
  -> shared feature presentation model
```

### Shared presentation boundary

`ManagedSiteChannels` remains the product surface. Its current rendering is
split into reusable presentation components rather than bypassed:

- `ManagedSiteChannelsView` owns the existing page header, notices, toolbar,
  table placement, pagination, empty/error/loading states, and dialog slots;
- `ManagedSiteChannelsTable`, the toolbar, and row actions preserve the current
  column system, selection behavior, ordering, menus, and stable test ids;
- `ChannelEditorShell` preserves the current Modal header, footer, spacing,
  sections, focus behavior, and destructive/close guards;
- `ManagedSiteMigrationDialogView` preserves the current Modal, confirmation,
  collapsible preview rows, seven-field source/target comparison, warning
  tooltip, blocked detail, result rows, and summary layout.

Legacy and native controllers map their own domain data to small UI-only view
models. Native UI view models contain only a controller-local opaque `rowKey`,
safe display facts, and capability booleans; they never contain a
`ManagedResourceRef`. The controller resolves `rowKey` to a ref only at a
Workspace or named-capability boundary. Native code must not construct
`ManagedSiteChannel` or `ChannelFormData`. The dispatcher chooses a
controller/registration and always renders the same presentation components.

The existing large page and dialogs may be modified to extract these
presentation components. The extraction must preserve legacy behavior and is
part of the cutover, not an unrelated refactor. Native-only orchestration stays
in feature-local controllers so the shared view does not call a Workspace or a
legacy service directly.

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
  readonly capabilities: {
    canSearch: boolean
    canCreate: boolean
    canUpdate: boolean
    canDelete: boolean
  }

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

`ManagedResourceRef` is an internal boundary value containing the Managed Site
Type, resource kind, non-secret scope key, and an Adapter-produced opaque string
`resourceId`. The string is bounded, stable for the resource lifetime, and
validated before decoding. A scope key may be a normalized non-secret origin,
as AxonHub currently uses, but it is validated against the opened Workspace at
every public operation. Ref values are internal even when they contain
deployment identity: route, DOM, test-id, logging, and analytics serializers
reject refs entirely. Tests use sentinel URL/token-like ref values and prove
they never appear in those surfaces. An Adapter that eventually needs composite identity owns
canonical encoding and decoding behind the seam rather than exposing a JSON
locator to callers.

`ResourcePage.total` and cursors are optional. The Interface must not assume
page-number pagination or a known total.

A search term in `ResourceListQuery` always means resource-wide search, never
filtering only the currently loaded page. An Adapter must perform upstream-wide
search, load every required page before filtering, or explicitly declare search
unsupported through `capabilities.canSearch` so the product does not render the
control. If a route already contains `search` while search is unsupported, the
controller clears it from local/query state and preserves the rest of the route;
it does not issue a list request with an unsupported term and does not silently
render an unfiltered result as if the search succeeded.

For the first AxonHub cutover, the controller passes the normalized route search
term to `Workspace.list` and drains every returned cursor page. It does not
fetch an unsearched page and filter it locally. The collected result set then
uses the existing client-side status facets, column filters, selection, and
TanStack pagination. A missing total is replaced by the collected count; a
repeated cursor, configured collection upper bound, or aborted collection is a
controlled failure and never silently renders a partial set.

Row identity is controller-local and opaque. The table receives a generated
row key and a safe display identifier separately; it never receives or renders
`scopeKey`, `resourceId`, or a serialized `ManagedResourceRef`. The ref map is
resolved only at Workspace/capability boundaries. The safe display identifier
preserves the old ID-column contract when the upstream provides one, otherwise
the policy may hide that column without exposing a native locator. Sorting uses
an explicit safe display sort key and never assumes native ids are numeric.

The shared presentation contract is complete enough to preserve the existing
page behavior, not just its markup. It includes toolbar capability flags and
callbacks, controlled row selection, column visibility and sorting state,
status facets, the existing `RowActions` and `ChannelFilterDialog` callbacks,
model-sync/filter/migration capabilities, route `search` and legacy `channelId`
parameters, View/detail state, and the full migration loading, error, target-selection,
preview, warning, blocked, confirmation, execution, partial-result, refresh,
and close state. Analytics callbacks are presentation props; shared views emit
no events and native controllers reuse the existing action taxonomy.

The controller is the single owner of selection and route synchronization:
route search is normalized once, legacy numeric `channelId` retains its current
list-filter/focus behavior, and search or scope changes reset page-local
selection and pagination only after the new complete result set is accepted.
Native rows do not put
`resourceId` or controller row keys in the URL; an existing native `channelId`
query is cleared and native View opens from row action state. A future native
safe-link identifier requires a separate reviewed contract. Existing model-sync
and channel-filter controls remain present or absent according to explicit
capability flags, so a native site cannot accidentally render an action it
cannot perform.

`RowActions` is controller-neutral: it receives `rowKey`, safe display data,
capability flags, and callbacks keyed by `rowKey`, never a legacy `ChannelRow`
or numeric id. Legacy and native controllers bind to that contract separately.
Migration presentation likewise separates an internal `selectionId` from an
optional safe `displayIdentifier`; only the legacy adapter renders its current
`#numeric` label, and native ids/refs are never rendered.

### Resource views and editor fields

`ResourceDisplayFacts` are the single safe read-only projection for both list
and detail surfaces. A list response may select fewer display facts than `get`,
but both use the same product model and never contain raw native detail or
credentials.

Display facts are rendered through the existing Managed Site Channels column
and detail patterns. The default table keeps the current common columns and
ordering. AxonHub-only facts may appear as explicitly configured optional
columns or inside the existing detail/editor sections; they do not introduce a
different table layout. Long values use the existing truncation, tooltip, and
responsive behavior.

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

The shared editor has two body contracts: a common-field body extracted from
the existing ChannelDialog and a native extension slot. Native code may
reorder only its approved extra fields within the existing section primitives;
it must reuse the common name/type/base URL/status/models/secret renderers,
labels, test ids, focus behavior, and validation. Read-only View uses the same
ChannelEditorShell and a safe detail body with masked secret facts; it may not
open an edit form in disabled mode or create a second dialog.

Descriptors supply field facts to the feature; they do not generate a new
dialog or own presentation. `ResourceFieldDescriptor` contains field id,
value type, validation constraints, options, and secret capability; it contains
no layout hint such as textarea rows. A feature-owned
`ManagedResourceFieldPresentation` policy, keyed by site type, resource kind,
editor mode, and field id, selects the label, help copy, section, order, and
existing primitive renderer. The first section vocabulary is
`basic`, `connection`, `models`, `sync`, `routing`, `metadata`, and `advanced`.
AxonHub uses that vocabulary to group fields by task rather than placing every
native-only field in `advanced`: identity and status are basic, URL and secret
intent are connection fields, supported/manual/default models are model
fields, automatic model synchronization has its own section, weight is
routing, tags and remark are metadata, and only low-frequency settings such as
`settings.extraModelPrefix` are advanced.

The Upstream Backend and Adapter never supply component names, layout, arbitrary
schema, or executable visibility rules. Adapter descriptors never contain
section/order/label/renderer metadata. The policy is the only source of field
presentation metadata and is validated against descriptor field ids: unknown,
duplicated, or missing required policy entries fail tests; hidden fields remain
in the submitted projection unchanged. The first slice uses only existing
primitive renderers. A future richer renderer needs a separate reviewed
contract rather than a React component or raw JSON schema in Adapter data.
Unsupported fields are omitted with a controlled rationale.

Model and tag fields reuse the existing free-form `CompactMultiSelect`
interaction. Empty descriptor options mean no closed enum restriction for
those fields; they must not render as an unusable empty select.

Frontend-owned presentation may derive options for one field from the current
safe form projection when the dependency is a product rule rather than an
Upstream Backend schema fact. AxonHub's `defaultTestModel` is the first such
case: it reuses the existing select primitive and derives a de-duplicated
candidate list from `supportedModels` plus `manualModels`. The Adapter still
owns the invariant that the submitted default test model belongs to that
union; it does not receive layout metadata or an executable options resolver.

Field presentation may also own localized help and placeholder keys and a
bounded visibility predicate over the safe form projection. Help remains
associated through `aria-describedby`. Hiding a dependent field does not clear
its value unless the product rule explicitly requires clearing it. These
presentation rules improve the existing native editor without creating a
second form system or allowing Adapter-provided UI instructions.

Secret fields use explicit intent rather than masked-string inference:

```ts
type SecretEditIntent =
  | { kind: "unchanged" }
  | { kind: "replace"; value: string }
  | { kind: "clear" }
```

An Adapter exposes `clear` only when the verified Upstream Backend supports it.
Read state and replacement capability are separate: masked, unavailable, or
permission-hidden credentials are never reused as a replacement value, but a
user-entered replacement is allowed only when the descriptor says
`canReplace` and the editor mode requires or permits it. OAuth/AWS/GCP types
remain view/safe-edit only in this slice.

### Named internal capabilities

Migration, model sync, matching, and future internal features do not consume
the Workspace editor Interface. They use separately registered, named Site
Adapter Capabilities and feature-owned Product Canonical Models.

For example, migration owns canonical source, preview, command, and per-item
result models. The AxonHub Adapter maps between those models and native channel
operations. The legacy facade may translate `ManagedSiteChannel` inputs only
inside the legacy wrapper used by the existing dialog. Native migration code
has a hard import and call boundary: it may call only
`prepareManagedSiteMigrationPreview` and `executeManagedSiteMigration`, which
resolve the named capability registry. Native modules must never import
`channelMigrationLegacyFacade`,
`prepareManagedSiteChannelMigrationPreview`,
`executeManagedSiteChannelMigration`, `ManagedSiteChannel`, or
`ChannelFormData`, and static boundary tests enforce this by whole-word
matching.

Capabilities are added only when a feature is migrated. There is no anonymous
capability bag and no inference from editor fields.

Workspace capabilities cover only Workspace operations: search, create,
update, and delete. Model sync, model filtering, and migration availability are
derived from their named capability registries plus feature policy. Guards live
at those named entry points, not as boolean promises on the Workspace.

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

Batch migration is different: per-item success, failure, skipped, and
uncertain outcomes are a Product Canonical Model because users need them. That
product-level partial result does not expose protocol steps. Bulk delete uses
the same explicit `success | failed | uncertain` per-row outcome model, always
refreshes after settled work, and never replays an uncertain row
automatically.

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
- [channel editor interactions](https://github.com/looplj/axonhub/blob/d061ac7df6aef0c5ec6cdfa9dc5002546a1c5a57/frontend/src/features/channels/components/channels-action-dialog.tsx);
- [model-pattern semantics](https://github.com/looplj/axonhub/blob/d061ac7df6aef0c5ec6cdfa9dc5002546a1c5a57/frontend/src/features/channels/utils/pattern.ts);
- [channel editor copy](https://github.com/looplj/axonhub/blob/d061ac7df6aef0c5ec6cdfa9dc5002546a1c5a57/frontend/src/locales/zh-CN/channels.json);
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

This is a field expansion, not a page-layout expansion. The native editor may
reorder and group fields within the existing dialog shell so the workflow is
coherent: basic identity and status, connection/authentication, models,
automatic synchronization, routing, metadata, then truly advanced settings.
Additional AxonHub display facts use the existing table column-visibility and
detail systems. They must not cause a new page, card hierarchy, dialog shell,
toolbar, or navigation pattern.

#### AxonHub channel field contract

This contract is the prerequisite checklist for wiring the native editor. The
Adapter owns field facts, validation, options, secret read state, mutation
guards, and preservation. The feature policy owns section, order, label keys,
renderer selection, and textarea rows. No backend field can select arbitrary
layout, raw JSON, a renderer, or executable UI behavior.

##### Test references

- **A-read:** `tests/services/apiAdapters/managedResources/axonHub.test.ts` —
  `maps all fourteen approved fields to exact safe detail facts`,
  `normalizes nullable AxonHub detail values to safe display defaults`, and
  `returns only the definition-selected safe fact subset from list`.
- **A-descriptor:** same file —
  `exposes only the approved first editable field set`.
- **A-create:** same file —
  `maps every approved editable field to the pinned create input`,
  `keeps baseURL optional for native creation`, and
  `maps create rejection and applies the requested enabled status`.
- **A-update:** same file — the fourteen generated
  `maps $fieldId update according to the pinned field matrix` cases, the five
  generated `maps empty $fieldId to its verified empty-value behavior` cases, and
  `omits every normalized field when the edited values are unchanged`. Status
  coverage must additionally prove disabled-to-enabled uses only the dedicated
  status mutation and mixed field/status failure is partially applied.
- **A-model-validation:** same file —
  `validates supported manual and default-model invariants`.
- **A-secret:** same file —
  `omits unchanged unavailable permission-hidden and masked credentials`,
  `reveals an available saved key through the existing password control without
  changing unchanged intent`, `emits a replacement credential only after a
  user edit`, and the
  `fails closed for regular channels with multiple API keys` and
  `blocks a credential replacement when latest detail becomes multi-key`
  cases, plus the
  structured-credential crafted-submit cases inside
  `exposes only the approved first editable field set`.
- **A-settings:** same file —
  `preserves every selected pinned setting while updating extraModelPrefix`.
- **S-read:** `tests/services/apiService/axonHub/index.test.ts` —
  `loads native AxonHub detail by opaque GraphQL id` (including every
  first-slice top-level field plus credential and prefix selections),
  `accepts a complete pinned authoritative channel output`, and
  `selects every pinned beta5 settings field required for replacement preservation`.
- **S-mutation:** same file — `sends verified update and clear fields unchanged`
  and `omits or passes null create baseURL according to the native protocol`.
- **P-policy:**
  `tests/features/ManagedSiteChannels/presentation/managedResourceFieldPolicy.test.ts`
  — both descriptor-coverage cases plus renderer, option-label, mode-specific
  registry, and arbitrary-renderer rejection cases.

##### Editable field matrix

| Field | Read selection | Create input | Update input | Clear behavior | Editable now | Credential/type guard | Preservation rule | Coverage |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `name` | List and authoritative detail select `name`; detail fact is text. | Required `CreateChannelInput.name`. | Send `UpdateChannelInput.name` only when changed. | No clear; empty is rejected. | Yes, create/edit. | Safe for regular and structured credential types. | Omit when unchanged. | A-read, A-descriptor, A-create, A-update, S-read, P-policy |
| `type` | List and detail select `type`; detail fact is controlled text. | Required; limited to the regular-key allowlist below. | Send only when changed; a structured/unknown existing type must remain unchanged. | No clear. | Create: approved regular types. Edit: regular types may change within the allowlist; structured/unknown types are safe-edit only. | Adapter validation rejects OAuth, AWS, GCP, or unknown transitions before mutation dispatch. | Omit when unchanged; never default an unknown value to OpenAI. | A-read, A-descriptor, A-create, A-update, A-secret, S-read, P-policy |
| `baseURL` | List and detail select `baseURL`; null displays/edits as empty. | Optional; trimmed empty value is omitted. | Send `baseURL` when non-empty and changed. | Empty edit emits `clearBaseURL`. | Yes, create/edit. | Safe for every credential type. | Omit when unchanged. | A-read, A-create, A-update, S-read, S-mutation, P-policy |
| `status` | List and detail select `status`; archived/auto-disabled/unknown remain distinct display states. | Not part of beta5 `CreateChannelInput`; create defaults disabled. Requested enabled state uses the verified follow-up status mutation. | Never rely on `UpdateChannelInput.status`; call dedicated `updateChannelStatus` when changed. Apply an ordinary field patch first when both change. | No clear. | Yes. Create options: enabled/disabled. Edit additionally preserves archived or an existing future value. | Independent of credential type. Crafted unsupported values fail validation. | Omit when unchanged. Status-only failure maps normally; status failure after a successful field patch is partially applied and never replayed automatically. | A-read, A-descriptor, A-create, A-update, A-model-validation, S-read, S-mutation, P-policy |
| `key` | Authoritative detail selects `credentials.apiKey`, `apiKeys`, `gcp`, and `oauth`; an available regular key is resolved into the password field's local state when the editor opens. | Required explicit `replace` intent for approved regular-key types; maps to replacement data in `credentials.apiKeys`. | `unchanged` omits credentials; only a real user edit emits `replace`. | `allowClear: false`; `clear` is rejected. | Regular-key create/edit only. An available single saved regular key is prefilled; the eye control toggles visibility. Channels with more than one normalized non-empty `apiKeys`/legacy `apiKey` candidate remain editable for safe fields but set `canReplace: false`, expose `replacementBlockReason: multiple_credentials`, and expose no secret loader. | `canReplace` follows regular-key type support and the single-candidate requirement, while prefill additionally requires an available usable key. OAuth/AWS/GCP/unknown types remain guarded. Crafted replace/clear intents fail validation, and an authoritative multi-key refresh blocks credential dispatch. | Raw saved keys never enter list facts, analytics, migration projections, or controller state; closing the editor clears the field-local value. | A-read, A-descriptor, A-create, A-update, A-secret, S-read, P-policy |
| `supportedModels` | List and detail select `supportedModels`; detail fact is a list. The table fact is the numeric de-duplicated union count with `manualModels`. | Required normalized non-empty array. | Send replacement array only when changed. | Empty is rejected unless preserving an already-empty authoritative edit state for an unrelated change. | Yes, free-form multi-select. New custom values are mirrored into `manualModels`; removing a value removes it from the manual provenance list. | Independent of credential type. | Omit when unchanged; validation keeps `defaultTestModel` and `manualModels` consistent with supported models. | A-read, A-create, A-update, A-model-validation, S-read, P-policy |
| `manualModels` | Authoritative detail fact and hidden provenance list for models added through the supported-model editor; it is not an independent form control. | Optional normalized array; when model inputs are changed, every manual model must also occur in `supportedModels`. | Send replacement array when the supported-model editor changes; empty edit emits `clearManualModels`. | Empty is allowed. | No standalone control; maintained by the `supportedModels` editor. | Independent of credential type. | Omit when unchanged. | A-read, A-create, A-update, A-model-validation, S-read, P-policy |
| `defaultTestModel` | Authoritative detail selects `defaultTestModel`; null normalizes to empty for editing. | Required and must occur in supported models. | Send only when changed. | A user clear is rejected, but an authoritative pre-existing empty value may remain unchanged during unrelated edits. | Yes. | Independent of credential type. | Omit when unchanged; model invariants are enforced when model fields change without blocking status-only edits to older channels. | A-read, A-create, A-update, A-model-validation, S-read, P-policy |
| `autoSyncSupportedModels` | Authoritative detail selects the boolean; null normalizes to `false`. | Optional boolean. | Send only when changed. | No clear flag; `false` is a value. | Yes for model-sync-capable types; hidden for GitHub Copilot, Claude Code, pinned `codex`, and unknown future types. | Provider-managed credential types cannot change auto-sync settings; crafted edits fail validation. | Omit when unchanged. | A-read, A-create, A-update, S-read, P-policy |
| `autoSyncModelPattern` | Authoritative detail selects nullable text. | Optional; empty maps to `null`. | Send text when non-empty and changed. | Empty edit emits `clearAutoSyncModelPattern`. | Shown only when automatic sync is enabled for a supported type; hidden values are preserved. | Provider-managed credential types cannot change auto-sync settings; crafted edits fail validation. | Omit when unchanged. | A-read, A-create, A-update, S-read, S-mutation, P-policy |
| `tags` | List and detail select `tags`; detail fact is a list. | Optional normalized array. | Send a replacement array when changed, including `[]` when clearing. | Empty edit emits `tags: []`; AxonHub's custom update service ignores generated `clearTags`. | Yes, free-form multi-select. | Independent of credential type. | Omit when unchanged. | A-read, A-create, A-update, S-read, P-policy |
| `orderingWeight` | Authoritative detail selects integer `orderingWeight`; null normalizes to `0`. | Optional integer from `0` through `100`. Higher values are preferred by AxonHub channel ordering. | Send only when changed. | No clear flag; `0` is a value. | Yes, bounded number input. | Independent of credential type. | Omit when unchanged; non-integers and values outside `0..100` fail validation. | A-read, A-create, A-update, A-model-validation, S-read, P-policy |
| `remark` | Authoritative detail selects nullable text. | Optional; empty maps to `null`. | Send text when non-empty and changed. | Empty edit emits `clearRemark`. | Yes. The Adapter exposes only `type: textarea`; the feature policy owns `rows: 3`. | Independent of credential type. | Omit when unchanged. | A-read, A-descriptor, A-create, A-update, S-read, S-mutation, P-policy |
| `settings.extraModelPrefix` | Authoritative detail selects it together with every pinned beta5 settings member listed below. | Sent inside optional `settings` replacement object. | A changed prefix rebuilds `settings` by merging every pinned selected member. | Empty string clears only the prefix value; never emit `clearSettings`. | Yes, exposed as `extraModelPrefix`. | Independent of credential type. | Preserve all selected sibling settings exactly; unknown fork-only members are not claimed. | A-read, A-create, A-update, A-settings, S-read, P-policy |

##### Credential-type guard matrix

The exact first-slice regular-key allowlist is:

`openai`, `openai_responses`, `anthropic`, `gemini_openai`, `gemini`,
`gemini_vertex`, `deepseek`, `deepseek_anthropic`, `openrouter`, `xai`,
`siliconflow`, `volcengine`, `nanogpt`, and `ollama`.

These values are the only create options and the only types whose editor
descriptor sets `canReplace: true`. Existing `anthropic_aws`,
`anthropic_gcp`, `github_copilot`, `claudecode`, pinned upstream OAuth types
such as `codex` and `antigravity`, and every unknown future value are excluded
by default. They remain readable and may update safe non-credential fields,
but their type and credential intents are guarded by Adapter validation and
command construction, independent of policy visibility. Coverage: A-descriptor
and A-secret.

##### Replacement-object preservation matrix

When `settings.extraModelPrefix` changes, the authoritative detail query and
update merge preserve these pinned beta5 `settings` members:

- `modelMappings`
- `autoTrimedModelPrefixes`
- `hideOriginalModels`
- `hideMappedModels`
- `lowercaseModelId`
- `proxy`
- `transformOptions`
- `headerOverrideOperations`
- `bodyOverrideOperations`
- `passThroughUserAgent`
- `passThroughBody`
- `rateLimit`
- `retryableStatusCodes`
- `retryableErrorPatterns`
- `providerQuota`

Coverage: A-settings and S-read. Other selected detail objects such as
credentials, policies, endpoints, and disabled keys are read for their own
facts or deferred features but are not copied into `settings`. No raw JSON
editor is permitted for any deferred object.

##### Locale gate

The native editor's field, option, fallback, help, placeholder, validation, and
section copy stays shape-aligned across all six app locales. Frontend-owned
presentation resolvers call literal keys inside the narrow
`managedSiteChannels:editor` family so normal extraction can discover and prune
them without marker helpers or preservation rules. `pnpm run i18n:extract:ci`
must leave them unchanged. Copy describes the user goal and upstream-owned
behavior; it does not expose GraphQL field names or imply that the extension can
configure AxonHub's system-wide synchronization
interval.

The release creates channels as `disabled` because status is excluded from
`CreateChannelInput`. Creating an enabled channel may therefore require a
second mutation. Partial or uncertain completion is handled internally and the
UI is told to refresh before retrying.

The same dedicated status mutation is required for edits. The pinned schema
accepts `status` in `UpdateChannelInput`, but beta5's
`ChannelService.UpdateChannel` does not apply it; only
`UpdateChannelStatus` calls `SetStatus`. Native update orchestration strips
status from the ordinary field patch, applies that patch first when present,
and then applies the status mutation. A status failure after a successful
field patch is partially applied and is never replayed automatically.

The first slice edits regular API-key credentials only. Create type options are
limited to channel types whose pinned-release validation accepts regular API
keys. Existing OAuth, AWS, or GCP credential channels remain viewable and may
edit safe non-credential fields, but changing their type or credentials is
deferred.

This restriction is an Adapter invariant, not only a field-policy choice.
`ResourceEditor.submit` revalidates the current native type and credential
intent; crafted projections that select an OAuth, AWS, GCP, or unknown type
cannot dispatch a regular-key mutation or clear a hidden credential. Focused
Adapter tests cover those bypass attempts.

Regular AxonHub channels with more than one normalized non-empty credential
candidate across `credentials.apiKeys` and legacy `credentials.apiKey` are
also fail-closed for scalar credential replacement. Their secret descriptor
sets `canReplace: false` with the typed `multiple_credentials` replacement
block reason, and no secret loader is exposed, so the shared editor cannot
prefill only the first key. Safe non-credential edits remain available;
unchanged credential intent omits `credentials`, while crafted replace/clear
intents fail with `unsupported_option`. The authoritative update boundary
rechecks the refreshed detail before dispatch so a channel that becomes
multi-key while an editor is open cannot receive a scalar credential
replacement. AxonHub owns the multi-key operation in its own UI.

The AxonHub model fields follow the pinned native editor interaction rather
than exposing protocol fields as undifferentiated text inputs:

- `defaultTestModel` uses the existing select primitive. It is disabled with
  actionable help until at least one supported or manual model exists. A new
  draft selects the first candidate when candidates become available. If model
  editing removes the selected candidate, the editor selects the first
  remaining candidate. An empty model union leaves a new draft empty, while an
  existing stale value remains unchanged so an unrelated edit does not silently
  rewrite legacy data; the disabled select and help direct the user to add a
  model before editing the default.
- `autoSyncSupportedModels` is a boolean switch, not a synchronization mode.
  Its help text states that AxonHub performs the synchronization only for
  enabled channels and that frequency is controlled by AxonHub system
  settings, not by this extension's Managed Site Model Sync feature.
- `autoSyncModelPattern` is localized as "model filter pattern" rather than
  "auto-sync model mode". It appears only when automatic synchronization is
  enabled, provides the pinned `(?i)^gpt-4|claude-3` style example, explains
  that an empty pattern synchronizes all models, and keeps its prior value when
  the switch is turned off.
- Pattern validation mirrors the pinned AxonHub frontend: an empty pattern and
  `*` are valid, plain text is an exact match, patterns containing regular-
  expression characters are full-string expressions, and a leading `(?i)`
  enables case-insensitive matching. Invalid expressions produce a controlled
  field validation issue before mutation dispatch.

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

`archived` and `auto-disabled` must remain distinct from `disabled`. The pinned release returns
`null` credentials when the caller lacks channel-write permission, which must
not be interpreted as empty credentials. Defensive masked-string detection may
remain as compatibility hardening for forks or deployments, but masking is not
asserted as the beta5 protocol contract.

For regular API-key channels, editing automatically resolves a usable saved key
into the existing password input; the existing reveal control changes
visibility. The raw key is retained only in the secret field's local state, not
list facts, analytics, migration projections, or controller state. Prefilling or
revealing alone keeps the field `unchanged`; an actual input edit becomes
`replace`. Masked, permission-hidden, unavailable, and structured credentials
remain blank and are never inferred.

The shared table's `models` column remains a count, not a model-name preview.
The native list selection includes `supportedModels` and `manualModels`; the
Adapter counts their trimmed, non-empty, de-duplicated union while authoritative
detail keeps the two lists separate for editing.

Unedited top-level fields are omitted from partial update commands. When an
edited field belongs to a replacement object such as `settings`, the Adapter
merges every field defined by the pinned target contract and returned by the
authoritative detail query. Preservation of unknown or unselected fork-specific
fields is not claimed until target-deployment evidence extends that contract.

## Migration and compatibility

The Legacy Channel Path remains available for existing non-migrated Managed
Site Types. It may receive compatibility fixes and migration glue, but new
features default to the Resource-Native Path.

AxonHub cutover must include its currently exposed channel-migration workflow.
The migration feature receives a named canonical capability before AxonHub
switches controllers. Native orchestration consumes canonical selections,
preview rows, commands, and results without depending on `ManagedSiteChannel`
or `ChannelFormData`.

The visible migration workflow remains one shared
`ManagedSiteMigrationDialogView`. Legacy and native wrappers map their preview
and result models into a presentation-only contract containing controlled row
identity, display name, source/target comparison values, warning codes,
blocked reason and safe message, and per-item execution status. The native
mapping is derived from canonical source and target projections; it does not
create a legacy draft.

Migration type mapping is fail-closed. Every source type is classified as
`mapped` with an explicit canonical target mapping or `unsupported` with a
controlled reason. An unknown AxonHub type never defaults to OpenAI or another
provider. An unsupported row remains inspectable but is blocked from
its own execution. Mixed confirmation is allowed and passes the complete
canonical preview to `executeManagedSiteMigration`, preserving input order.
The landed canonical executor returns blocked rows as `skipped`, attempts only
ready rows, and returns all-unsupported or unavailable-target work as ordered
per-row results rather than throwing. Tests prove no credential resolution or
create call occurs for any blocked/unsupported row and no target create occurs
when the target capability/configuration is unavailable.

The shared view preserves the existing target selector, Modal,
`DestructiveConfirmDialog`, `CollapsibleSection`, warning count and tooltip,
base URL/type/models/groups/priority/weight/status comparison grid, blocked
details, no-rollback guidance, per-item result rows, and post-execution refresh.
Canonical `uncertain` is an explicit verify-and-refresh-required state. It is
not presented as ordinary failed or skipped work and is never automatically
replayed.

Other existing Managed Site Types do not need to migrate for AxonHub to use the
new controller. A static Managed Site Definition mode is the rollback switch:
reverting AxonHub to `legacy-channel` restores the legacy controller inside the
same presentation. Runtime errors never trigger that switch automatically.

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

The landed PR 2 capability contract coverage includes one test-only named
capability; the landed PR 1 substrate did not introduce feature capability
machinery only for a synthetic test.

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
- exact, wildcard, case-insensitive, empty, and malformed AxonHub model-filter
  pattern validation;
- `archived` remains distinct from disabled;
- create plus status follow-up partial/uncertain application maps to
  `mutation_state_uncertain` and is not automatically retried;
- deferred credentials, endpoints, policies, and settings are not cleared.

Fixtures use reserved example domains, fake ids, and fake model names. Real
protocol field and enum names remain because they are the contract. Production
response dumps and real credentials are prohibited.

### Dispatcher and UI tests

Vitest and Testing Library cover:

- explicit native/legacy controller selection and native-registration-missing
  failure while both successful paths render the same presentation components;
- identical page header, toolbar order, common columns, row-action menu,
  pagination placement, dialog shells, stable test ids, and keyboard/focus
  behavior for legacy and native controller fixtures;
- identical column visibility, sorting, status-facet, controlled-selection,
  route-search, legacy `channelId` list-filter/focus behavior, View-mode,
  model-sync/filter/migration capability,
  and analytics callback behavior for legacy and native fixtures;
- loading, configuration-required, authentication, permission, empty, list
  error, retry, detail, create, edit, delete, and refresh-recovery states;
- the configuration-required CTA uses the definition-owned settings deep link
  and can retry after configuration changes;
- primitive field renderers and field validation;
- the AxonHub default-test-model select derives de-duplicated options from the
  current supported/manual model union, handles the empty state, selects the
  first candidate for an empty new draft, and repairs a stale selection after
  model removal;
- automatic synchronization help identifies the AxonHub-owned schedule, and
  the model filter pattern has localized help/placeholder copy, is shown only
  while the switch is enabled, preserves its hidden value, and reports invalid
  patterns accessibly;
- unsupported create/update/delete/sync/filter/migration capabilities hide the
  corresponding UI and reject crafted controller calls;
- masked secret behavior;
- double-submit prevention and late-result protection;
- no automatic replay after possible or partial mutation application;
- bulk delete reports per-row success/failed/uncertain outcomes, refreshes after
  settlement, and never replays an uncertain row;
- resource-wide search either spans multiple upstream pages or is not rendered
  when the Adapter declares it unsupported;
- existing route, search, localized copy, and analytics behavior.

Existing legacy component tests are a frozen regression gate for the other five
Managed Site Types. Native tests reuse `MANAGED_SITE_CHANNELS_TEST_IDS` and
`CHANNEL_DIALOG_TEST_IDS`; they must not establish a parallel native test-id
family for controls that already exist.

There is no UI test matrix for internal commit-certainty states. Controller
tests assert only the corresponding product recovery action.

### Migration tests

Migration retains product-level per-item outcomes:

- preview ready/blocked states;
- successful, failed, and skipped rows with aggregate counts;
- unavailable or compatibility-masked source secrets are blocked;
- successful rows are not rolled back when another row fails;
- AxonHub uses its named capability and never reads editor descriptors;
- canonical-to-presentation mapping preserves the seven comparison fields,
  warning order, blocked reason, safe fallback copy, and opaque selection
  identity;
- uncertain results render a distinct verify-and-refresh-required state and
  cannot be retried from stale preview state.

Before PR 3, the existing migration dialog must run through the named
capability for AxonHub as both source and target. Equivalence tests preserve row
identity and selection, type mapping, warnings, masked/unavailable-secret
blocking, per-row failure, aggregate counts, successful-row retention, and the
post-execution refresh behavior.

### E2E decision

The substrate and canonical migration PRs do not add Playwright coverage because
their risks are better exercised through contract and feature tests. The final
AxonHub UI cutover adds or extends one stable Chromium options-page scenario
covering route selection, a representative edit in the existing dialog,
intercepted GraphQL, migration preview, and list refresh. The retained browser
proof runs the legacy and native paths with fixed fixture data, language,
desktop/mobile viewports, reduced motion, and intercepted responses. DOM,
accessibility, interaction, and responsive-behavior assertions prove the shared
chrome, common controls, columns, actions, focus behavior, editor workflow, and
migration workflow. It does not require a real AxonHub deployment in CI.

Committed pixel baselines are not part of this cutover's release contract.
Playwright failure screenshots and traces remain diagnostic artifacts; a future
visual-regression mechanism requires its own stability and maintenance design.

## Delivery slices

### Historical prerequisites: PR 1 and PR 2

The resource-native substrate and canonical migration capability described
below are already landed on the immutable prerequisite tip. They are not future
work for this cutover and must not be reimplemented or split into new commits.
Their existing tests and public contracts are inputs to PR 3.

### PR 1: resource-native substrate and AxonHub registration (landed)

The following bullets are the historical scope record only. Do not execute
them again during this cutover; verify their landed contracts and tests at the
prerequisite tip.

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

### PR 2: canonical migration capability and AxonHub bridge (landed)

The following bullets are the historical scope record only. Do not execute
them again during this cutover; verify the named capability and legacy bridge
at the prerequisite tip.

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

Expected scope: one PR with three ordered commits and independent validation
gates. The exact file count may exceed the earlier estimate when a behavior-
preserving extraction requires it; a second page or dialog implementation is
never an acceptable way to keep the count small.

Commit A is legacy-only presentation extraction. All Managed Site Types remain
on the legacy controller. It introduces the shared page/table/editor/migration
view contracts, moves existing markup behind those contracts, and captures
desktop/mobile parity evidence.

Commit B adds the native controller, cursor collection, field presentation
policy, editor body, and canonical migration-to-presentation mapping. It uses
native fixtures in tests but leaves AxonHub's production definition in
`legacy-channel` until parity and pagination gates pass.

Commit C changes only the AxonHub definition and its route/E2E assertions. It
proves that the native controller renders the same presentation contract,
while the other five Managed Site Types retain the legacy path.

Each commit must be independently reviewable and validated before the next
one starts. The static definition mode remains the rollback switch; no runtime
feature flag or silent fallback is added.

Suggested commits:

1. `feat(managed-sites): add native resource editor and list`
2. `test(axonhub): cover native resource UI parity`
3. `feat(axonhub): switch managed resources to native workspace`

The per-PR file estimates are gross touched-file counts and are not additive.
Existing AxonHub GraphQL, authentication, provider, controller, and capability
logic should be reused where it does not impose the new UI structure. The
current native page/table/editor/detail/migration implementation is a
discarded prototype; its data-layer tests and lifecycle protections may be
reimplemented or selectively ported behind the shared presentation boundary.

Stop the implementation and return to the design if any of these occur:

- a second page, table, editor shell, or migration markup tree is introduced;
- native code imports `ManagedSiteChannel`, `ChannelFormData`, or the legacy
  channel service;
- a shared view gains `isAxonHub` or another site-type conditional;
- section/order/label/renderer metadata is added to the Adapter contract;
- cursor collection cannot preserve the approved client-pagination semantics;
- a parity fixture changes toolbar order, common columns, row actions, test ids,
  focus behavior, or required desktop/mobile interactions;
- a field requires nested JSON, arbitrary conditional schema, or a custom
  renderer that has not received a separate product contract.
- an unknown migration type is mapped to a supported type instead of being
  blocked as `unsupported`;
- a second test-only native registration requires a copied page, table, editor,
  detail, or migration view instead of only a definition, policy, and Adapter
  fixture.

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
secrets, raw upstream messages, or other user-entered text. Legacy controller
adapters and native controller hooks own action/result emission exactly once;
presentation callbacks only forward the existing analytics action ids. No
passive impression event or new settings snapshot is required.

The design does not add, rename, or move a setting. Existing AxonHub
configuration navigation and search/deep-link targets must remain valid during
cutover; no new settings-search entry is required unless implementation changes
that surface.

New native-only copy is added to all six app locales and checked with
`pnpm run i18n:extract:ci`. Configuration-required retry and settings-target
copy remain controlled presentation inputs and never expose raw Adapter text.

Improving these existing AxonHub form controls does not add a new analytics
action or settings-search target. The interaction remains the existing create
or update action, and model names, filter patterns, and other field values must
not enter analytics. Focused Vitest and Testing Library coverage is the correct
layer for the dependent select, conditional field, and validation semantics;
the existing representative AxonHub cutover E2E remains the browser-level
coverage and is not expanded into a form-state matrix.

## Completion criteria

The design is successfully implemented when:

- a test-only unrelated Adapter and AxonHub both satisfy the same small public
  resource Interface without `ManagedSiteChannel` or `ChannelFormData`;
- AxonHub native fields in the first slice display and edit correctly;
- the default test model is selected from the current configured model union,
  and stale or empty candidate states provide deterministic, actionable
  behavior before submit;
- automatic model synchronization and its optional filter are named and
  explained according to AxonHub's native behavior, with invalid filter
  patterns rejected before dispatch;
- unedited top-level fields, selected replacement-object fields, and
  unchanged/masked credentials survive updates;
- possible or partial mutation application is never automatically retried;
- AxonHub migration uses a named Product Canonical Model capability;
- unknown migration types are fail-closed, return blocked/skipped row results,
  and never dispatch credential or create work;
- legacy and native controller fixtures render the same page, table, editor,
  and migration presentation contract on desktop and mobile;
- AxonHub-only fields appear only in the approved existing table/detail/editor
  extension points, with no second page or dialog visual system;
- native mode cannot silently fall back to legacy mode;
- operation and migration capability flags hide unsupported toolbar, row, filter,
  sync, and migration actions;
- existing non-migrated Managed Site Types continue to use the Legacy Channel
  Path unchanged;
- focused tests, hook-equivalent validation, compile/knip validation, locale
  extraction where applicable, and the targeted cutover E2E pass.
