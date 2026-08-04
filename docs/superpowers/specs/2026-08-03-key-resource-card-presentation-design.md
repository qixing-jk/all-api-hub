# Key Resource Card Presentation Design

## Summary

Unify saved-account API-key rows behind one provider-neutral presentation
shell while preserving each Account Site Type's native resource contract,
fields, and supported actions.

AIHubMix and OpenRouter are the first two consumers that need the same reduced
inventory presentation: both can return a complete plaintext key when the key
is created, but an existing inventory row cannot reliably reveal that secret
again. Their rows therefore share the same visual hierarchy and omit actions
that require a recoverable plaintext secret. Other account key sources retain
their current full action set when they can resolve a usable secret.

This design changes the Key Management list and detail presentation only.
Create editors and one-time-secret presentation remain outside its ownership.

## Relationship to OpenRouter Native Key Management

This specification complements rather than replaces
`2026-07-31-openrouter-native-key-management-design.md`. The dependency is
one-way: OpenRouter consumes the shared presentation, while the shared
presentation does not depend on OpenRouter types, controllers, or protocol
behavior.

| Concern | Owning specification or flow |
| --- | --- |
| Shared key-row card, information hierarchy, action visibility, and batch eligibility | This shared presentation design |
| AIHubMix inventory projection into the shared card | This shared presentation design |
| OpenRouter API, workspace scope, native resource contract, editor, CRUD, detail loading, and mutation certainty | OpenRouter native key-management design |
| Provider-neutral one-time-secret lifecycle and OpenRouter/AIHubMix creation-result integration | OpenRouter native key-management design |

AIHubMix is the first legacy `ApiToken` consumer of the
create-response-only inventory presentation. OpenRouter is the first native
Account Key Resource consumer. They share the same card semantics without
sharing a storage, protocol, or CRUD model.

The shared-presentation PR preserves the creation flows available on `main`.
The OpenRouter PR remains responsible for its planned provider-neutral
one-time-secret dialog and AIHubMix creation-result migration.

## Context

The Key Management page currently has two presentation paths:

- legacy runtime keys render through `TokenListItem` and `TokenHeader`; and
- native OpenRouter key resources render through
  `AccountKeyResourceListItem`.

The separation correctly protects the domain boundary between a recoverable
Account Runtime Key and an upstream-native Account Key Resource. It also made
the two row styles diverge in spacing, information hierarchy, action controls,
and detail behavior.

AIHubMix remains on the legacy `KeyManagementCapability` and `ApiToken` path,
but its saved/listed keys may be masked and cannot be recovered through a
detail endpoint. Consequently, the legacy row renders secret-dependent
actions that do not match the actual resource capability. OpenRouter avoids
that mismatch by using a native resource row, but its separate visual design
makes the same product surface feel unrelated.

The data-model distinction is required. The visual distinction is not.

## Goals

- Give all account key rows one consistent card structure and responsive
  behavior.
- Let AIHubMix and OpenRouter share the presentation appropriate for
  create-response-only secrets.
- Render every safe, useful provider-native fact and action that the selected
  resource actually supports.
- Hide secret-dependent and batch actions when the inventory row cannot
  provide a usable plaintext secret.
- Keep provider checks and protocol types out of the shared card component.
- Preserve existing create, edit, delete, loading, error, and one-time-secret
  ownership boundaries.
- Provide a gradual path for other account key sources to adopt the shared
  presentation without a resource-model migration.

## Non-Goals

- Do not convert OpenRouter native resources into `ApiToken` or
  `AccountRuntimeKey`.
- Do not migrate AIHubMix to `AccountKeyResourceCapability`.
- Do not merge the OpenRouter controller with legacy token CRUD or
  provisioning logic.
- Do not redesign the Add Token dialog, OpenRouter native editor, or
  one-time-secret dialog.
- Do not add, remove, or emulate upstream provider capabilities.
- Do not expose masked values as usable secrets or infer secret availability
  from visual shape alone.
- Do not migrate legacy protocol, storage, or resource models merely to reuse
  the shared presentation.

## Product Semantics

### Shared product category

The common visual category is a **Key Resource Row**: a saved-account view of
one remote API-key resource. A Key Resource Row may or may not also represent
an Account Runtime Key.

This distinction lets the page present remote resource administration
consistently without claiming that every listed resource contains a usable
secret.

### Secret availability

The presenter classifies each row by product semantics rather than Site Type:

- **recoverable**: the row can resolve a usable plaintext secret when the user
  requests it;
- **create-response-only**: plaintext is handled only in the creation result
  workflow and is not available from an existing inventory row; or
- **unavailable**: the row is intentionally display-only for secret-dependent
  behavior.

AIHubMix and OpenRouter inventory rows use `create-response-only`. A transient
full key value must not make inventory actions appear temporarily; the
provider-owned creation-result workflow remains the authoritative place to
copy or save the created secret.

### Capability groups

Capabilities are projected per row:

| Group | Examples | Rendering rule |
| --- | --- | --- |
| Resource administration | details, edit, enable or disable, delete | Render when supported by the resource contract |
| Secret-dependent actions | reveal, copy, verify API, verify CLI, save or export to another tool | Render only for a recoverable secret |
| Batch actions | batch save, import, or export | Include only rows whose required secret and destination capabilities are available |
| Provider-native context | workspace, group, model restrictions, limits, usage, expiration, creator, BYOK | Render safe supported facts through common fact slots |

The shared card does not contain `siteType === ...` branches. Provider-aware
presenters map provider contracts into these capability groups before render.

## Shared Card Design

### Component responsibility

Introduce a provider-neutral `KeyResourceCard` presentation shell. It owns:

- card surface, padding, borders, and responsive layout;
- title, status badge, account badge, and optional masked label;
- a compact summary-fact area;
- an icon-based action area with accessible names and tooltips;
- controlled detail expansion;
- detail loading, failure, empty, and ready states; and
- optional batch selection when the row is eligible.

It does not fetch data, resolve secrets, inspect Site Types, translate raw
backend text, or own mutation state.

The default summary keeps the key row first. When a site can return only a
masked value for an existing key, the site-owned limitation appears inline in
that same key row, before the summary facts. The details disclosure is reserved
for secondary metadata and does not hide this action-relevant limitation.

### Presentation input

The shared input is a product-owned view model with these conceptual fields:

- stable local row key;
- display name and status;
- account label and optional provider-native secondary label;
- optional masked label;
- three or four ordered summary facts;
- ordered detail facts;
- available row actions and their pending or disabled state;
- detail expansion state and callbacks;
- secret availability classification; and
- batch-selection eligibility.

The exact TypeScript names may follow existing Key Management conventions,
but the contract must remain provider-neutral and must not expose raw native
DTOs, remote locators, credentials, or plaintext secrets.

### Information hierarchy

The default card shows only the facts needed to compare rows quickly:

1. resource name, status, and account;
2. masked label when it is a safe provider display value;
3. up to four high-value native facts; and
4. the actions currently supported by that row.

Expanded details show every approved safe fact. A provider with more fields
does not receive a different card layout; it receives a richer detail fact
collection.

On narrow viewports, header content and actions wrap without overlapping.
Action buttons remain icon buttons with tooltips and accessible labels. Facts
use the same label-value grid and preserve unknown, zero, negative, unlimited,
and expired states without fabricating values.

## Provider Presentation

### AIHubMix

AIHubMix continues to use its existing key-management Adapter and legacy CRUD
controller. Its presenter maps the normalized token into the shared card.

The summary prioritizes status, remaining quota, used quota, and expiration.
Details retain safe available metadata such as creation time, group, model
restrictions, IP restrictions, quota policy, and other fields already owned by
the normalized token contract.

Existing masked inventory keys are `create-response-only`. Their rows:

- render details, supported edit or enable/disable behavior, and delete;
- omit reveal, copy, verification, save-to-profile, third-party export, and
  managed-site import actions; and
- do not participate in secret-dependent batch selection.

This shared-presentation PR does not change AIHubMix creation-result handling.
The later provider-neutral one-time-secret migration remains owned by the
OpenRouter native key-management design.

### OpenRouter

OpenRouter continues to use `AccountKeyResourceCapability`, its workspace
session, native controller, and native editor.

The summary prioritizes status, workspace, limit or unlimited state, remaining
limit, and usage while respecting the shared maximum of four summary facts.
Expanded details retain the approved safe projection: creator presence,
reset cadence, total and period usage, corresponding BYOK usage, whether BYOK
counts toward the limit, timestamps, and expiration.

OpenRouter inventory keys are `create-response-only`. Their rows expose
details, supported edit or enable/disable behavior, and delete. They do not
expose secret-dependent actions or batch selection.

The workspace selector and status filter remain page-level controls because
they scope the collection rather than one row.

### Other account key sources

Legacy sources that can reliably resolve a usable plaintext secret retain the
current full action set. Their presenters may adopt the shared card
incrementally. This change must not remove existing behavior merely because a
provider has not yet migrated to the new presentation view model.

## Data Flow and Ownership

The target flow is:

1. Existing legacy hooks or the OpenRouter native controller load and own
   resource state.
2. A legacy or native presenter converts safe domain facts and supported
   operations into the shared card view model.
3. `KeyResourceCard` renders that view model and invokes supplied callbacks.
4. The existing controller performs reads or mutations and returns updated
   state to the presenter.

The legacy presenter owns the mapping from normalized `ApiToken` and secret
resolution semantics. The native presenter owns the mapping from
`AccountKeyResourceFacts`. Neither presenter performs remote IO.

Detail ownership remains source-specific:

- legacy detail facts come from the normalized inventory row unless the
  existing flow already owns an additional read; and
- OpenRouter detail expansion continues to use the native controller's
  cancellable detail read and failure state.

Editors remain separate. Visual unification must not turn their field schemas,
validation, mutation certainty, or lifecycle behavior into shared CRUD logic.

## Loading, Failure, and Permission States

- Existing page and inventory loading states remain authoritative.
- Detail expansion displays source-provided loading and retryable failure
  states inside the common card.
- Partial workspace inventory remains usable and keeps the existing warning
  and retry behavior.
- Authentication and permission failures remain actionable and must not be
  collapsed into empty inventory.
- An action that is structurally supported but temporarily pending may be
  disabled with progress feedback.
- An action that is not supported by the resource contract is omitted instead
  of rendered as a permanently disabled control.
- Secret unavailability is explained in the detail presentation and the
  creation workflow, not repeated as tooltips for controls that are absent.

## Accessibility and Responsive Behavior

- Use semantic headings and buttons.
- Every icon-only action has a localized accessible name and tooltip.
- Detail controls expose `aria-expanded` and preserve keyboard focus through
  expansion and asynchronous refresh.
- Status is communicated by localized text in addition to color.
- Loading and failure changes use appropriate status or alert semantics.
- The action row wraps below the title on constrained widths without hiding
  facts or overlapping controls.
- Detail content remains keyboard navigable and does not introduce a focus
  trap.

## Telemetry Decision

No new analytics event is added. This design introduces no new user command;
existing edit, delete, detail, and creation events retain their current
ownership. Removing unsupported controls also removes impossible or misleading
entry points rather than creating a new measurable behavior.

If implementation discovers that the shared detail action lacks existing
coverage and product measurement is required, that is a separate explicit
telemetry decision rather than a hidden addition to this presentation
refactor.

## Testing Strategy

### Shared component tests

- renders the common header, badges, masked label, and ordered summary facts;
- renders only supplied actions and gives icon buttons accessible names;
- supports detail loading, failure, retry, empty, and ready states;
- preserves unknown, zero, negative, unlimited, and expired facts;
- hides selection when batch eligibility is false; and
- wraps responsively without relying on brittle full-class snapshots.

### Presenter and integration tests

- AIHubMix masked inventory rows retain native metadata and resource
  administration while omitting secret-dependent and batch actions;
- AIHubMix creation-result behavior is unchanged by the shared-presentation
  PR;
- OpenRouter rows retain workspace, limit, usage, BYOK, timestamp, and
  expiration facts;
- OpenRouter detail loading and retry continue through the native controller;
- providers with recoverable secrets retain reveal, copy, verification,
  export, and eligible batch actions; and
- all-account counts and selection totals exclude ineligible rows without
  treating them as missing inventory.

### Browser-level decision

Update the existing deterministic OpenRouter Key Management E2E flow to locate
and operate the common card for the representative create, detail, edit, and
delete path. Keep AIHubMix state matrices in focused Vitest and Testing Library
coverage because their risk is capability projection and rendering rather than
extension-runtime integration. Add an AIHubMix browser scenario only if
implementation exposes a cross-entrypoint or persistence regression that
lower-level tests cannot prove.

## Delivery and Migration Strategy

Deliver this design as a prerequisite PR based on `main`, separate from the
OpenRouter native key-management PR. The prerequisite must not import
OpenRouter-native resource types or depend on the OpenRouter feature branch.

### PR 1: Shared Key Resource presentation

1. Add and test the provider-neutral card contract and shell.
2. Map the existing legacy runtime-key rows into the shell without changing
   their Adapter or CRUD contracts.
3. Add the create-response-only capability projection for AIHubMix.
4. Verify that recoverable legacy providers keep their complete action set.
5. Remove superseded legacy row markup only after all direct render sites and
   standalone component tests use the shared shell.

This PR owns the common card, the legacy presenter, AIHubMix's reduced
inventory action projection, and regression protection for other legacy
providers.

### PR 2: OpenRouter native key management

The OpenRouter feature PR is based on the shared-presentation PR while it is
stacked, then retargeted or rebased onto `main` after the prerequisite merges.
It:

1. retains the OpenRouter native Adapter, workspace session, controller,
   editor, detail loading, mutations, and one-time-secret integration;
2. adds only the OpenRouter presenter needed to map native safe facts and
   actions into the shared card; and
3. does not introduce or retain a second independent key-card implementation.

The merge order is the shared-presentation PR first and the OpenRouter PR
second. The OpenRouter feature is not considered presentation-complete until
the shared card integration is present, so the split must not become a shipped
follow-up gap.

### Progressive adoption

Within those PR boundaries, use a progressive presentation migration:

1. land the shared shell through existing legacy rows;
2. establish AIHubMix's capability-driven reduced inventory actions;
3. consume the stable shell from OpenRouter's native presenter; and
4. route subsequent key-row presentation work to the shared card.

Temporary compatibility wrappers may remain during the migration, but new row
presentation work must target the shared card. Do not maintain two independent
card implementations after all callers have migrated.

## Success Criteria

- AIHubMix and OpenRouter inventory rows are visually harmonious and use the
  same card component.
- All account key rows share one presentation language without sharing an
  incorrect protocol type.
- Each provider still exposes all safe supported native facts and resource
  actions.
- Create-response-only rows omit reveal, copy, verification, export, import,
  and batch selection.
- Recoverable providers retain their current full secret-dependent actions.
- OpenRouter workspace scope and native detail behavior remain intact.
- AIHubMix legacy CRUD and creation behavior remain intact.
- This presentation change does not alter creation-result handling; the
  provider-neutral one-time-secret lifecycle remains owned by the OpenRouter
  native key-management design.
- The shared presentation lands as a reviewable prerequisite PR, and the
  OpenRouter PR consumes it without duplicating the card implementation.
- Loading, error, partial, permission, responsive, and accessibility states are
  covered at the appropriate test layer.
