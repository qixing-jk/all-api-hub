# OpenRouter Native Key Management Design

Date: 2026-07-31
Status: approved design

## Purpose

Add complete OpenRouter runtime API-key management to the existing Key
Management product surface without forcing OpenRouter resources into the
New API-shaped `ApiToken` model.

The feature uses OpenRouter's native Management API contracts, preserves the
native workspace and member scope, dynamically renders only product-approved
fields, and improves the one-time-secret experience shared with AIHubMix.

This design extends the account foundation in
`2026-07-17-openrouter-management-key-account-foundation-design.md`. That
foundation intentionally excluded runtime-key CRUD; this document is the
authority for the new CRUD scope. It does not change the foundation's
Management Key authentication, canonical origin, balance, duplicate-detection,
or account-onboarding contracts.

## User Outcome

After saving an OpenRouter account with a valid Management Key, a user can:

- select an OpenRouter workspace;
- list active and disabled API keys in that workspace;
- inspect native limits, usage, ownership, and lifecycle metadata;
- create a key with every documented OpenRouter create option;
- update every documented OpenRouter mutable option;
- disable, re-enable, or permanently delete a key;
- safely copy a newly created plaintext key;
- save that one-time secret to API Credentials and use existing export flows;
- understand why an existing OpenRouter key cannot be revealed again; and
- recover honestly from authentication, permission, rate-limit, network, and
  uncertain-mutation failures.

The experience stays in the existing Key Management page. OpenRouter does not
become a Managed Site Type and does not gain channel-management behavior.

## Verified OpenRouter Contracts

These contracts were verified against OpenRouter's public documentation and
OpenAPI on 2026-07-31:

- Management API Keys:
  <https://openrouter.ai/docs/guides/overview/auth/management-api-keys>
- API-key reference:
  <https://openrouter.ai/docs/api/api-reference/api-keys/list-api-keys>
  <https://openrouter.ai/docs/api/api-reference/api-keys/create-a-new-api-key>
  <https://openrouter.ai/docs/api/api-reference/api-keys/get-a-single-api-key>
  <https://openrouter.ai/docs/api/api-reference/api-keys/update-an-api-key>
  <https://openrouter.ai/docs/api/api-reference/api-keys/delete-an-api-key>
- Canonical OpenAPI:
  <https://github.com/OpenRouterTeam/docs/blob/main/openapi/openapi.yaml>

All operations below use the canonical API origin
`https://openrouter.ai/api/v1` and authenticate with:

```http
Authorization: Bearer <Management Key>
```

### Key operations

| Operation | Request | Success contract |
| --- | --- | --- |
| List | `GET /keys` | `200 { data: KeyInfo[] }` |
| Create | `POST /keys` | `201 { data: KeyInfo, key: string }` |
| Get | `GET /keys/{hash}` | `200 { data: KeyInfo }` |
| Update | `PATCH /keys/{hash}` | `200 { data: KeyInfo }` |
| Delete | `DELETE /keys/{hash}` | `200 { deleted: true }` |

Every operation requires a Management Key. A normal runtime API key must not
be accepted as the account credential for this capability.

`GET /keys` accepts `include_disabled`, `offset`, and `workspace_id`. The guide
describes pages of up to 100 keys. The response has no total, cursor, or
`has_more` field and does not promise a stable sort order.

### Create fields

`POST /keys` supports:

- required `name`;
- optional nullable USD `limit`;
- optional nullable `limit_reset`: `daily`, `weekly`, or `monthly`;
- optional `include_byok_in_limit`;
- optional nullable UTC `expires_at`;
- optional `workspace_id`; and
- optional nullable `creator_user_id`.

Create does not accept `disabled`. The product must not simulate disabled
creation by chaining an automatic PATCH after POST.

### Update fields

`PATCH /keys/{hash}` supports:

- `name`;
- `disabled`;
- nullable `limit`;
- nullable `limit_reset`; and
- `include_byok_in_limit`.

The update contract does not support changing `expires_at`, `workspace_id`, or
`creator_user_id`. Those values remain read-only after creation.

### Key information

The native `KeyInfo` contract includes:

- identity and presentation: `hash`, `name`, `label`;
- lifecycle: `disabled`, `created_at`, `updated_at`, `expires_at`;
- limits: `limit`, `limit_remaining`, `limit_reset`,
  `include_byok_in_limit`;
- usage: `usage`, `usage_daily`, `usage_weekly`, `usage_monthly`;
- BYOK usage: `byok_usage`, `byok_usage_daily`, `byok_usage_weekly`,
  `byok_usage_monthly`; and
- ownership: `workspace_id`, `creator_user_id`.

Known nullable/optional fields remain nullable/optional. Unknown upstream
fields are tolerated but are not automatically rendered. A present known
field with an invalid type is a malformed response, not a fallback value.

### One-time plaintext

Only a successful create response returns the plaintext key, in the top-level
`key` field. List, get, and update return metadata and a masked label, not the
secret. OpenRouter provides no reveal or recovery endpoint.

The resource `hash` is a management locator. The `label` is a safe masked
display value. Neither is the plaintext secret, and neither may be passed to
runtime inference, verification, copying, or export as if it were a key.

### Workspaces and members

OpenRouter exposes Management Key-authenticated workspace operations,
including:

- `GET /workspaces` with offset/limit pagination;
- `GET /workspaces/{id}`, where the path accepts an ID or slug; and
- `GET /workspaces/{id}/members` with offset/limit pagination.

The authenticated web product redirects key management into a
workspace-scoped route. The extension therefore models workspace selection as
a first-class resource scope rather than exposing a raw UUID as the primary
experience.

## Domain Model

### Account Key Resource

Introduce **Account Key Resource** as the product term for an upstream-native
API-key entity managed through a saved account credential.

An Account Key Resource is distinct from an **Account Runtime Key**:

- the Account Key Resource can exist without a recoverable plaintext secret;
- it owns CRUD, limits, status, usage, scope, and remote identity;
- an Account Runtime Key is usable for inference, verification, copying, or
  export and therefore requires a real secret; and
- a newly created one-time secret may be saved as an API Credential Profile,
  but a masked inventory row never becomes a runtime key.

This distinction prevents the OpenRouter list response from being coerced into
`ApiToken` or `AccountRuntimeKey` merely to reuse existing components.

### Native and product-owned shapes

The OpenRouter Adapter retains the complete validated native DTO. Product
features consume narrower shapes:

- an opaque Account Key Resource reference;
- safe display facts;
- an editable projection for the current create/edit mode;
- frontend-owned presentation policy; and
- an optional ephemeral created-secret result.

The opaque reference contains the local account identity, site type, resolved
workspace scope, and native resource locator. It is never rendered, searched,
logged, sent to telemetry, or treated as a secret. Every operation validates
that a supplied reference matches the active account and workspace before
decoding the native locator.

## Architecture

### Shared resource-native primitives

Extract the provider-neutral parts of the current managed-resource substrate:

- field descriptor and value types;
- safe display facts;
- validation issues;
- operation options and cancellation;
- editor lifecycle;
- mutation certainty;
- common failure categories; and
- single-submit and late-result guards.

Managed Site registrations keep compatible aliases or narrow wrappers around
the extracted primitives. This task must not migrate or behaviorally rewrite
AxonHub, its Managed Site route, or its native channel resource.

Account-specific resource references, account configuration, workspace scope,
runtime-secret semantics, and capability registration remain in a new account
key resource layer. Do not widen `ManagedSiteType`,
`ManagedResourceRegistration`, or managed-channel UI contracts to include
OpenRouter.

### Account key resource registration

An account key resource registration is selected by Account Site Type and
opened with an already saved account snapshot. The opened provider session
owns:

- canonical authenticated API request construction;
- available key scopes;
- default-scope resolution;
- opening a selected scope's key collection; and
- provider-native create/edit field facts.

An opened key collection owns:

- cursor-based list and detail reads;
- create and edit editors;
- delete;
- mutation reconciliation; and
- the exact active account/scope binding used to validate resource refs.

OpenRouter is the first native account key resource registration.

### Legacy compatibility bridge

Existing New API-family, Sub2API, VoAPI, and AIHubMix key capabilities remain
on the current `KeyManagementCapability`, `ApiToken`, token form, and
`TokenProvisioningCapability` paths.

A narrow presentation bridge maps their existing entries into the Key
Management page's row view model without changing:

- numeric token IDs;
- list/create/update/delete protocol calls;
- secret resolution;
- model/group/IP form behavior;
- automatic token provisioning;
- repair policies; or
- existing exporter contracts.

Legacy mutations continue to open the existing Add Token dialog. OpenRouter
mutations open the native resource editor. No site type registers both native
and legacy CRUD for the same resource.

Subsequent provider work defaults to the native path. Migrating an existing
provider's complete resource model requires a separate verified design.

### OpenRouter service and Adapter ownership

The OpenRouter API service owns HTTP transport, canonical origin, Bearer
authentication, DTO parsing, endpoint-specific response validation, and safe
error preservation.

The OpenRouter account key Adapter owns:

- workspace and member pagination;
- workspace-scope resolution;
- offset-to-cursor mapping for keys;
- opaque `hash` locator encoding/decoding;
- native DTO-to-display projection;
- create/edit field descriptors and validation;
- request payload construction;
- mutation certainty and read-only reconciliation;
- runtime API profile facts for newly created keys; and
- mapping transport failures into product failure categories.

Add concise source comments beside authentication, endpoint fields,
one-time-secret handling, and deliberate no-reveal/no-retry behavior.

## Workspace Scope

### Default and available workspaces

When a user selects one OpenRouter account, the provider session:

1. resolves `GET /workspaces/default` to the native default workspace;
2. drains `GET /workspaces?offset=N&limit=100`;
3. deduplicates workspaces by native ID;
4. marks the resolved default workspace; and
5. exposes stable display facts: name, slug, and role-independent identity.

If workspace inventory fails but the default workspace resolves, show the
default workspace with a non-blocking warning and a retry action. If the
default workspace cannot be resolved, fail scope initialization instead of
guessing a workspace ID.

The selected workspace ID is passed explicitly to key list/create requests.
The Adapter does not infer it from editable account metadata.

### Members and creator selection

`creator_user_id` is an optional create-only field. When the user opens the
create editor, the Adapter loads the selected workspace's members and provides
their user ID and role as select options.

Changing workspace:

- cancels the previous member request;
- discards options from the old workspace;
- clears a creator value that is not valid in the new workspace;
- reloads member options; and
- revalidates before enabling submit.

A failed member load leaves creator selection unavailable with the actual
safe failure and a retry action. The ordinary UI does not replace the member
selector with an unexplained raw ID field.

### All-accounts mode and deep links

The all-accounts Key Management view loads only the resolved default workspace
for each OpenRouter account. Managing another workspace requires selecting the
single account first. This prevents one control from ambiguously selecting
both account and workspace scope.

The selected single-account workspace is retained in a route parameter so a
refresh or back navigation preserves context. Invalid, unauthorized, or stale
workspace parameters fall back to the resolved default with an actionable
notice; they never cause a cross-workspace request.

The existing Key Management settings-search destination remains canonical. No
new settings search result is introduced merely for the workspace selector.

## Dynamic Field Rendering

Dynamic rendering means the provider supplies facts and constraints while the
frontend owns presentation. It does not mean rendering arbitrary upstream
JSON or translating raw backend field names.

### Adapter-owned descriptor facts

Descriptors may express:

- field ID and value kind;
- required/optional/null semantics;
- numeric bounds and precision;
- finite select values;
- editability by create/edit mode;
- dependent option loading;
- dependencies used for visibility or validation; and
- secret state.

The Adapter does not supply arbitrary React components, Tailwind classes,
translated copy, or backend-provided HTML.

### Frontend-owned presentation policy

A static Account Key Resource presentation registry matches each supported
site/resource/mode to:

- section and order;
- design-system renderer;
- literal translation-key resolvers;
- help, placeholder, and recovery copy;
- option-label resolvers;
- visibility conditions;
- read-only explanations; and
- accessible names and descriptions.

Every Adapter descriptor must be classified by the matching frontend policy
as rendered, read-only, or deliberately unsupported. Missing, duplicate, or
type-mismatched classifications fail closed. Runtime-selected upstream text is
never passed to `t(...)`.

### OpenRouter field layout

Use a compact, single-column editor aligned with OpenRouter's native mental
model and the repository's existing modal primitives.

Sections appear in this order:

1. **Basic information**: name, workspace, optional creator.
2. **Spending limit**: unlimited/limited choice, USD amount, reset cadence.
3. **Lifecycle**: expiration on create; enabled/disabled on edit.
4. **Advanced**: whether BYOK usage counts toward the limit.

Workspace and creator are real select controls backed by official inventory,
not raw UUID fields. Advanced fields are progressively disclosed without
hiding currently non-default values during edit.

The editor shows a live, localized rule summary, for example the semantic
equivalent of “USD 20 each month, including BYOK, expires at …”. UTC reset and
expiration behavior is accompanied by the user's local-time interpretation,
while submitted values remain canonical UTC.

`null`, zero, and unlimited remain distinct throughout input state,
validation, payload construction, and display. A limit of zero must not be
silently converted to unlimited.

### Mode-specific behavior

Create renders every documented create field but not `disabled`.

Edit renders every documented PATCH field. Workspace, creator, and expiration
are shown as read-only detail with an explanation that OpenRouter requires a
new key to change those properties.

The editor guards unsaved changes and prevents double submit. Loading,
option-loading, empty-option, permission-limited, validation, submission,
uncertain-result, and success states use existing design-system components.

## Key List and Detail UX

The existing page and account selector remain. Selecting an OpenRouter account
adds a workspace selector scoped to that account.

An OpenRouter key row summarizes:

- name;
- masked label;
- enabled/disabled/expired state;
- current limit or unlimited state;
- remaining limit when available; and
- cumulative usage.

Expanded details expose the safe product projection of:

- reset cadence;
- daily, weekly, monthly, and total usage;
- corresponding BYOK usage;
- whether BYOK counts toward the limit;
- created and updated timestamps;
- expiration;
- workspace name; and
- creator user ID when present.

Usage and remaining-limit visuals must preserve negative values and unlimited
states. They must not clamp negative remaining amounts, fabricate zeroes for
missing data, or imply that a nullable upstream measurement is known.

Disabled keys are included by default and can be filtered by status. Search
covers name, masked label, status, and explicitly approved safe display facts.
It excludes plaintext, native `hash`, workspace/member IDs, account
credentials, and raw native objects.

Existing OpenRouter rows do not offer reveal, copy, verification, or export
actions. Their unavailable action state explains that OpenRouter only returns
the plaintext once and that the recovery is to create a replacement key.

Delete uses the existing destructive-confirmation pattern and states that the
remote deletion cannot be undone.

## Shared One-Time Secret Lifecycle

### Common result

Introduce a provider-neutral created-secret result that contains only the
current UI session's necessary facts:

- the correlated Account Key Resource ref or legacy creation correlation;
- display label;
- plaintext secret;
- runtime API base URL and API kind needed to save a credential; and
- the fact that the secret is create-response-only.

It does not implement `ApiToken`, enter resource display facts, or become a
global runtime-key cache.

### Producers

OpenRouter native create produces the common result only after validating both
the created KeyInfo and the top-level plaintext key.

AIHubMix retains its existing legacy key resource and token-provisioning
contracts, but adapts its validated create response into the same common
created-secret result. AIHubMix-specific API-origin normalization remains in
the AIHubMix Adapter.

No other provider becomes one-time merely because its create response includes
a key. The provider contract must explicitly declare create-response-only
secret semantics.

### Presentation and lifetime

The current one-time API key dialog evolves into a provider-neutral one-time
secret experience. It:

- uses shared Modal, Alert, Input, and Button primitives;
- cannot close through a backdrop click;
- offers explicit copy;
- offers save to API Credentials;
- keeps the secret visible if saving fails;
- allows later use of existing API Credential export integrations after save;
- warns before closing if no built-in copy or save action succeeded; and
- clearly states that the extension cannot reveal the key again.

The user may still deliberately close the dialog. The product must not make a
remote key undeletable or trap the user because clipboard acknowledgement
cannot prove that the secret was stored safely.

The plaintext exists only in the active mutation/dialog state. It must not be
written to account storage, resource inventory, route state, recovery queues,
diagnostics, logs, analytics, error objects, browser messages unrelated to the
active flow, or background persistence.

Normal component unmount, account switch, or extension termination destroys
the local secret. The product never claims crash-safe recovery.

## Pagination and Read Consistency

### Keys

The OpenRouter Adapter maps an internal opaque cursor to offset increments of
100. It continues while a page contains 100 items and stops on a shorter page.

The collector:

- validates every item before accepting the page;
- rejects duplicate native hashes across or within pages;
- rejects repeated/non-progressing cursors;
- honors AbortSignal;
- has a bounded maximum page count as a final protocol guard; and
- does not expose an incomplete collection as a successful full inventory.

Concurrent upstream create/delete can shift offset pagination. A detected
duplicate, identity conflict, or otherwise inconsistent sequence fails with a
refreshable read error instead of silently dropping or duplicating rows.

### Workspaces and members

Workspace and member endpoints use their documented offset/limit pagination
and `total_count`. Collectors validate count and identity consistency, dedupe
by native ID, and stop on an empty/short final page or satisfied total.

Read-only requests may apply bounded rate-limit backoff when a safe retry delay
is available. Retry loops remain abortable and bounded. Fixed sleeps are not
used as readiness evidence.

## Mutation Semantics and Concurrency

OpenRouter does not document mutation idempotency, ETags, or version
preconditions. Create, update, and delete are therefore never automatically
replayed.

### Create

- Submit records dispatch before sending POST.
- A validated 201 response is `applied` and provides the one-time secret.
- A known pre-dispatch validation/auth failure is `not-applied`.
- A timeout, abort, connection loss, or malformed response after dispatch is
  `possibly-applied` unless the protocol proves otherwise.
- A possibly applied create does not search by name, retry, or claim secret
  recovery. It directs the user to inspect the selected OpenRouter workspace.

Names are not unique resource locators and cannot prove which key a request
created.

### Update

The editor sends only documented mutable fields selected by the user, not the
complete stale native object.

After an uncertain update, the client may perform one get-by-hash read. The
update is confirmed only when every requested mutable field equals the remote
value. Otherwise the outcome remains uncertain. The read never triggers a
second PATCH.

### Delete

After an uncertain delete, the client may perform one get-by-hash read. A 404
confirms deletion. A returned resource confirms that it still exists but does
not prove the delete was never applied and recreated; the UI refreshes and
reports the observable current state. The read never triggers a second DELETE.

### UI correlation

Each editor is bound to one account, workspace, resource ref, and request
epoch. It permits one in-flight submit. Account/scope changes, editor close,
and new requests invalidate earlier epochs so late results cannot update or
reveal secrets in a different context.

An applied or possibly applied mutation closes the reusable editor submission
state. Duplicate callbacks cannot settle twice.

## Error and Recovery Design

Use controlled product categories while retaining safe upstream detail in the
affected user's private UI:

- `401`: Management Key missing, invalid, or expired; edit the account
  credential.
- `403`: authenticated but insufficient Management Key, organization, or
  workspace permission; preserve a safe upstream reason.
- `404`: resource or scope no longer exists; refresh or return to the default
  workspace.
- `429`: request limited; bounded read retry or user-directed later retry.
- malformed response: OpenRouter returned an unsupported structure; do not
  manufacture fallback resources.
- network/unavailable: operation did not complete or may have completed,
  according to its dispatch certainty.
- validation: keep field-local issues and a local actionable fallback.

Do not replace useful safe upstream `code` and `message` with generic copy.
Redact authorization values, plaintext keys, cookies, credentials, request
bodies containing secrets, and authentication headers before private UI or
logs. Telemetry and external reports never include raw upstream messages.

User-facing mutation recovery leads with current impact and the next action,
not internal endpoint or state-machine terminology.

## Protection Bypass and Automatic Work

All OpenRouter native key mutations are explicit user commands under the
existing Manage API Keys command surface.

OpenRouter native key resources do not register `TokenProvisioningCapability`
and do not participate in:

- account post-save automatic key creation;
- background default-key provisioning;
- quick-create selection;
- missing-key repair;
- invalid-key automatic deletion; or
- automatic mutation retry.

Page entry and refresh use the existing Key Management read policy. Adding the
native resource capability must not broaden unrelated protection-bypass
operations or sources.

## Telemetry and Privacy

Telemetry decision: **reuse existing key-management actions**, extending their
typed controlled context only where required for native resources.

Reuse create, update, delete, copy-one-time-secret, save-to-API-Credentials,
refresh, cancel, and failure result semantics. Record only controlled values
such as:

- site type enum;
- operation enum;
- result/status enum;
- item/failure counts;
- duration bucket; and
- whether the workflow involved a one-time secret.

Do not record:

- account, key, workspace, member, or resource IDs;
- key name or masked label;
- plaintext secret or Management Key;
- URLs or paths;
- limit, usage, or expiration values;
- upstream message, response body, or stack trace; or
- user-entered text.

Do not add passive impression telemetry. Privacy allow-lists/sanitizers and
focused tests change together with any new controlled field.

## Accessibility and Responsive Behavior

Reuse the current design system and modal focus management. The native editor
and one-time-secret dialog must provide:

- semantic labels and descriptions;
- field-level error association;
- keyboard access to every select, toggle, action, and disclosure;
- focus return to the invoking control;
- announced loading, error, uncertain, and success states;
- no color-only status meaning;
- non-overlapping actions at narrow option-page widths; and
- wrapping/truncation that never obscures values or controls.

The workspace and creator option loaders expose loading, empty, error, and
retry states inside their field context rather than freezing the whole editor
when unrelated fields remain usable.

## Testing Strategy

Implementation follows focused TDD for executable behavior.

### Contract and factory tests

Cover:

- opaque string refs and active account/scope validation;
- provider-neutral descriptor/value/failure primitives;
- managed-resource compatibility wrappers;
- legacy account-key presentation bridge;
- single-submit and late-result isolation;
- mutation certainty mapping; and
- no secret in display facts or serializable resource state.

### OpenRouter API service tests

Using MSW and placeholder identities, cover:

- exact canonical origin and Bearer Management Key authentication;
- list/create/get/update/delete methods and paths;
- all documented create and update fields;
- nullable, zero, negative-remaining, and optional display values;
- create-only top-level secret parsing;
- workspace/default/member reads and pagination;
- key offset pagination termination and inconsistency detection;
- malformed core and known optional fields;
- unknown-field tolerance;
- 400/401/403/404/429/500 responses;
- AbortSignal; and
- proof that mutations are not automatically retried.

No fixture contains a real credential, organization, workspace, member, URL,
or account identity unless the protocol-specific canonical OpenRouter origin
is the behavior under test.

### Adapter tests

Cover:

- native DTO preservation;
- opaque hash locator correlation;
- safe display projection;
- complete create/edit descriptor classification;
- workspace/member options and dependent invalidation;
- payload construction for null, zero, unlimited, reset, BYOK, expiration,
  workspace, creator, and disabled semantics;
- create one-time-secret result;
- update/delete read-only reconciliation; and
- safe failure mapping.

### Component and controller tests

Cover:

- native and legacy rows on the same page;
- account and workspace selection/deep-link behavior;
- all-accounts default-workspace boundary;
- dynamic sections and mode-specific fields;
- dependent member loading and cancellation;
- local/UTC time explanation;
- loading, empty, disabled, error, permission-limited, partial-option, and
  uncertain states;
- list summaries and expanded native details;
- unavailable reveal/copy/export actions for inventory rows;
- create/edit/delete flows;
- one-time copy/save/close confirmation;
- secret retention after save failure;
- AIHubMix common one-time-secret regression;
- New API/Sub2API legacy form and mutation regressions;
- telemetry allow-list behavior; and
- shared surface direct render/harness sites.

Tests assert user-visible behavior and protocol boundaries rather than exact
object graphs, DOM wrappers, CSS classes, or internal mock choreography.

### E2E decision

Add one deterministic Chromium extension scenario:

1. preseed a placeholder OpenRouter account;
2. open Key Management through the real options route;
3. select a mocked workspace;
4. load paginated active/disabled keys;
5. create a key with representative native fields;
6. observe and handle the one-time secret;
7. edit mutable fields; and
8. delete the key.

Use browser routing/mocks rather than a real OpenRouter credential. Field and
error matrices remain in Vitest. This scenario proves real extension routing,
lazy entrypoint behavior, dialog layering, state handoff, and page refresh; it
does not prove live OpenRouter compatibility.

A signed-in live smoke is optional separate evidence and requires explicit
authorization for a real Management Key and remote mutations. Automated tests
must never silently perform live create/update/delete operations.

## Validation and Handoff Gates

Before implementation handoff:

1. run affected/related Vitest suites;
2. run `pnpm run i18n:extract:ci` and inspect all task-scoped locale changes,
   including deleted existing keys;
3. run `pnpm run validate:staged` on only task-scoped staged files;
4. run `pnpm run validate:push` because shared contracts, exports, types, and
   runtime paths change;
5. run the deterministic OpenRouter Chromium E2E;
6. run the Firefox build;
7. inspect the full task-scoped diff for secret leakage, duplicated runtime
   literals, weak fallbacks, accidental legacy migration, stale comments, and
   generated artifacts; and
8. keep local, CI, browser, and any optional live evidence explicitly
   separated in the final handoff.

## Progressive Delivery

Implementation should be planned as reviewable stages:

1. provider-neutral resource primitives plus account-native contracts and a
   no-behavior-change legacy bridge;
2. common one-time-secret lifecycle plus AIHubMix regression migration;
3. OpenRouter workspace/key API service and native Adapter;
4. native Key Management controller, dynamic presentation, and UI;
5. telemetry, i18n, E2E, compatibility closeout, and documentation comments.

Each stage must preserve a buildable, testable branch. Do not implement the
same OpenRouter CRUD in the legacy `ApiToken` path as a temporary shortcut.

## Non-Goals

- Do not make OpenRouter a Managed Site Type.
- Do not add OpenRouter channel management, model catalog, model pricing,
  check-in, redemption, or workspace administration.
- Do not create, edit, or delete workspaces or workspace membership.
- Do not recover, infer, persist, or fabricate plaintext for existing keys.
- Do not expose raw native JSON or arbitrary backend-defined fields.
- Do not automatically PATCH a just-created key to simulate unsupported create
  fields.
- Do not automatically retry remote key mutations.
- Do not add OpenRouter to automatic token provisioning or repair.
- Do not migrate the full AIHubMix, New API, Sub2API, or VoAPI key resource
  model in this work.
- Do not rewrite the AxonHub managed-resource UI or registration.
- Do not add direct one-off exporter implementations to the one-time dialog;
  save to API Credentials and reuse existing export integrations.
- Do not claim deterministic automated tests are a live OpenRouter smoke.

## Success Criteria

The design is successfully implemented when:

- OpenRouter keys remain native resources with string hash locators and all
  documented fields represented correctly;
- the current Key Management page supports workspace-scoped OpenRouter list,
  create, edit, enable/disable, delete, detail, and one-time-secret handling;
- workspace and creator use official inventory-backed selection rather than
  primary raw-ID fields;
- existing inventory rows never pretend to reveal, copy, verify, or export a
  masked label;
- OpenRouter and AIHubMix share one provider-neutral one-time-secret lifecycle;
- legacy provider behavior, automation, repair, and exports remain compatible;
- uncertain mutations never trigger an automatic replay;
- logs and telemetry contain no secrets or resource identities; and
- focused, broad, browser, i18n, and cross-browser gates pass with their
  evidence reported separately.
