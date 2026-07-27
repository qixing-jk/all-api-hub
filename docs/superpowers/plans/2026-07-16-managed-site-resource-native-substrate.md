# Managed Site Resource-Native Substrate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox notation (`- [ ]`) for tracking.

**Goal:** Add the resource-native contracts, factory, AxonHub protocol support, and an AxonHub native registration without changing production UI routing.

**Architecture:** A typed per-kind factory closes over native config, locator, list, detail, create, and update types, then exposes a small non-generic Workspace. AxonHub is registered in a dedicated native registry, while every Managed Site Definition remains on `legacy-channel` until the later UI cutover.

**Tech Stack:** TypeScript 5.9, Vitest 4, MSW, WXT browser-extension services, native `fetch`, GraphQL over HTTP, existing user-preferences storage.

---

## Source and execution order

Implement the first delivery slice from
`docs/superpowers/specs/2026-07-16-managed-site-resource-native-extension-design.md`.

This plan starts from commit `7756a5f18`. Execute it before:

1. `2026-07-16-axonhub-canonical-migration-capability.md`
2. `2026-07-16-axonhub-resource-native-ui-cutover.md`

At execution time, create or select an isolated worktree with
`superpowers:using-git-worktrees`. Do not implement PR2 or PR3 in this branch.

## File structure

Create:

- `src/services/apiAdapters/contracts/managedResourceNative.ts` — the only
  feature-facing resource-native contract.
- `src/services/apiAdapters/managedResources/factory.ts` — generic native
  definition and non-generic Workspace/editor implementation.
- `src/services/apiAdapters/managedResources/axonHub.ts` — AxonHub native
  registration and field/payload projection.
- `src/services/apiAdapters/managedResources/registry.ts` — explicit native
  registration lookup, separate from legacy `SiteTypeCapabilities`.
- `tests/services/apiAdapters/managedResources/factory.test.ts` — reusable
  synthetic Adapter contract tests.
- `tests/services/apiAdapters/managedResources/axonHub.test.ts` — AxonHub
  projection, preservation, mutation-certainty, and registry tests.

Modify:

- `src/services/accountSiteDefinitions/contracts.ts` — definition-owned
  resource mode, primary kind, labels, and settings target.
- `src/services/accountSiteDefinitions/definitions.ts` — explicit legacy mode
  for all six current Managed Site Types.
- `src/services/accountSiteDefinitions/registry.ts` — defensive cloning for the
  new policy object.
- `src/types/axonHub.ts` — pinned beta5 native channel/input types.
- `src/services/apiService/axonHub/index.ts` — native page/detail operations,
  signal propagation, selections, inputs, and controlled protocol errors.
- `tests/services/accountSiteDefinitions/registry.test.ts` — mode completeness
  and defensive-copy tests.
- `tests/services/apiService/axonHub/index.test.ts` — GraphQL contract tests.

Do not modify the legacy resource contracts, legacy AxonHub adapter/provider,
UI, migration, locale, analytics, or E2E files in this plan.

### Task 1: Add explicit Managed Site resource policy and public contracts

**Files:**

- Create: `src/services/apiAdapters/contracts/managedResourceNative.ts`
- Modify: `src/services/accountSiteDefinitions/contracts.ts`
- Modify: `src/services/accountSiteDefinitions/definitions.ts`
- Modify: `src/services/accountSiteDefinitions/registry.ts`
- Test: `tests/services/accountSiteDefinitions/registry.test.ts`

- [ ] **Step 1: Add failing definition-policy tests**

Add these cases to `registry.test.ts`:

```ts
it("gives every managed site an explicit managed-resource policy", () => {
  for (const siteType of MANAGED_SITE_TYPES) {
    expect(getAccountSiteDefinition(siteType)?.managedResource).toMatchObject({
      mode: "legacy-channel",
      primaryKind: "channel",
      settingsTarget: { tabId: "managedSite" },
    })
  }
})

it("keeps AxonHub on the legacy channel path until UI cutover", () => {
  expect(
    getAccountSiteDefinition(SITE_TYPES.AXON_HUB)?.managedResource,
  ).toMatchObject({
    mode: "legacy-channel",
    primaryKind: "channel",
    settingsTarget: { tabId: "managedSite", anchor: "axonhub" },
    actions: ["create", "delete-selected", "migrate"],
  })
})

it("returns defensive managed-resource policy copies", () => {
  const first = getAccountSiteDefinition(SITE_TYPES.AXON_HUB)!
  const mutableDetailFields = first.managedResource!.detailFieldIds as string[]
  first.managedResource!.settingsTarget.anchor = "changed"
  mutableDetailFields[0] = "changed"

  expect(
    getAccountSiteDefinition(SITE_TYPES.AXON_HUB)?.managedResource
      ?.settingsTarget,
  ).toEqual({ tabId: "managedSite", anchor: "axonhub" })
  expect(
    getAccountSiteDefinition(SITE_TYPES.AXON_HUB)?.managedResource
      ?.detailFieldIds[0],
  ).toBe("name")
})
```

Also add `keeps managed-resource field and action policy values unique`, which
checks each definition without freezing the whole definition object.

- [ ] **Step 2: Run the tests and verify the expected failure**

Run:

```powershell
pnpm exec vitest run tests/services/accountSiteDefinitions/registry.test.ts
```

Expected: FAIL because `managedResource` does not exist on the definition
contract.

- [ ] **Step 3: Add the definition policy contract**

Add to `accountSiteDefinitions/contracts.ts`:

```ts
export const MANAGED_RESOURCE_MODES = {
  LegacyChannel: "legacy-channel",
  NativeResource: "native-resource",
} as const

export type ManagedResourceMode =
  (typeof MANAGED_RESOURCE_MODES)[keyof typeof MANAGED_RESOURCE_MODES]

export const MANAGED_RESOURCE_KINDS = {
  Channel: "channel",
} as const

export type ManagedResourceKind =
  (typeof MANAGED_RESOURCE_KINDS)[keyof typeof MANAGED_RESOURCE_KINDS]

export const MANAGED_RESOURCE_PRODUCT_ACTIONS = {
  Create: "create",
  DeleteSelected: "delete-selected",
  Migrate: "migrate",
} as const

export type ManagedResourceProductAction =
  (typeof MANAGED_RESOURCE_PRODUCT_ACTIONS)[keyof typeof MANAGED_RESOURCE_PRODUCT_ACTIONS]

export interface ManagedResourceProductPolicy {
  mode: ManagedResourceMode
  primaryKind: ManagedResourceKind
  titleKey: "managedSiteChannels:title"
  itemLabelKey: "managedSiteChannels:table.columns.name"
  tableFieldIds: readonly string[]
  detailFieldIds: readonly string[]
  actions: readonly ManagedResourceProductAction[]
  settingsTarget: {
    tabId: "managedSite"
    anchor?: string
  }
}
```

Add `managedResource?: ManagedResourceProductPolicy` to
`AccountSiteDefinition`. Define one shared legacy policy in `definitions.ts`,
spread it into every managed-scoped definition, and give AxonHub the
`anchor: "axonhub"` settings target. Legacy policies may use empty field arrays
because their existing page owns its columns. AxonHub declares
`tableFieldIds` as `name`, `type`, `baseURL`, `status`, `supportedModels`, and
`tags`, `detailFieldIds` as the exact 14-field allowlist in Task 4, and actions
as create, delete-selected, and migrate. Clone the policy, both field arrays,
the action array, and the nested target in `cloneDefinition`.

- [ ] **Step 4: Add the non-generic feature-facing resource contract**

Create `managedResourceNative.ts` with these runtime constants and types:

```ts
import type { ManagedSiteType } from "~/constants/siteType"
import type { ManagedResourceKind } from "~/services/accountSiteDefinitions/contracts"

export const MANAGED_RESOURCE_FIELD_TYPES = {
  Text: "text",
  Textarea: "textarea",
  Number: "number",
  Boolean: "boolean",
  Select: "select",
  MultiSelect: "multi-select",
  Secret: "secret",
} as const

export const MANAGED_RESOURCE_FAILURE_CODES = {
  ConfigurationRequired: "configuration_required",
  InvalidConfiguration: "invalid_configuration",
  AuthenticationFailed: "authentication_failed",
  PermissionDenied: "permission_denied",
  ValidationFailed: "validation_failed",
  NotFound: "not_found",
  MutationStateUncertain: "mutation_state_uncertain",
  Unavailable: "unavailable",
  UpstreamRejected: "upstream_rejected",
  Aborted: "aborted",
  Unexpected: "unexpected",
} as const

export const MANAGED_RESOURCE_FIELD_ISSUE_CODES = {
  Required: "required",
  InvalidValue: "invalid_value",
  OutOfRange: "out_of_range",
  UnsupportedOption: "unsupported_option",
  InconsistentValue: "inconsistent_value",
} as const

export type ManagedResourceRef = {
  siteType: ManagedSiteType
  kind: ManagedResourceKind
  scopeKey: string
  resourceId: string
}

export type ResourceOperationOptions = { signal?: AbortSignal }

export type ResourceListQuery = {
  cursor?: string
  limit?: number
  search?: string
}

export type ResourceDisplayFacts = {
  ref: ManagedResourceRef
  displayName: string
  status:
    | "enabled"
    | "disabled"
    | "archived"
    | "auto-disabled"
    | "unknown"
  fields: readonly ResourceDisplayFact[]
  actions: { canUpdate: boolean; canDelete: boolean }
}

export type ResourceSecretState =
  | "available"
  | "masked"
  | "unavailable"
  | "permission-hidden"

export type ResourceDisplayFact =
  | { fieldId: string; kind: "text"; value: string }
  | { fieldId: string; kind: "number"; value: number }
  | { fieldId: string; kind: "boolean"; value: boolean }
  | { fieldId: string; kind: "list"; value: readonly string[] }
  | { fieldId: string; kind: "secret"; state: ResourceSecretState }

export type ResourcePage = {
  items: readonly ResourceDisplayFacts[]
  total?: number
  nextCursor?: string
}

export type SecretEditIntent =
  | { kind: "unchanged" }
  | { kind: "replace"; value: string }
  | { kind: "clear" }

export type ResourceFieldValue =
  | string
  | number
  | boolean
  | readonly string[]
  | SecretEditIntent

export type EditableResourceProjection = Readonly<
  Record<string, ResourceFieldValue>
>

export type ResourceFieldIssue = {
  fieldId: string
  code: (typeof MANAGED_RESOURCE_FIELD_ISSUE_CODES)[keyof typeof MANAGED_RESOURCE_FIELD_ISSUE_CODES]
}
export type ResourceValidationResult =
  | { valid: true }
  | { valid: false; issues: readonly ResourceFieldIssue[] }

type ResourceFieldDescriptorBase = {
  fieldId: string
  required?: boolean
}

export type ResourceFieldDescriptor =
  | (ResourceFieldDescriptorBase & { type: "text" })
  | (ResourceFieldDescriptorBase & { type: "textarea"; rows?: number })
  | (ResourceFieldDescriptorBase & {
      type: "number"
      min?: number
      max?: number
      step?: number
    })
  | (ResourceFieldDescriptorBase & { type: "boolean" })
  | (ResourceFieldDescriptorBase & {
      type: "select"
      options: readonly { value: string }[]
    })
  | (ResourceFieldDescriptorBase & {
      type: "multi-select"
      options: readonly { value: string }[]
    })
  | (ResourceFieldDescriptorBase & {
      type: "secret"
      secretState: ResourceSecretState
      allowClear: boolean
    })

export type ResourceFailure = {
  code: (typeof MANAGED_RESOURCE_FAILURE_CODES)[keyof typeof MANAGED_RESOURCE_FAILURE_CODES]
  fieldIssues?: readonly ResourceFieldIssue[]
}

export class ManagedResourceError extends Error {
  constructor(readonly failure: ResourceFailure) {
    super(failure.code)
    this.name = "ManagedResourceError"
  }
}

export interface ResourceEditor {
  readonly fields: readonly ResourceFieldDescriptor[]
  readonly initialValues: EditableResourceProjection
  validate(values: EditableResourceProjection): ResourceValidationResult
  submit(
    values: EditableResourceProjection,
    options?: ResourceOperationOptions,
  ): Promise<ResourceDisplayFacts>
}

export interface ManagedResourceWorkspace {
  readonly supportsSearch: boolean
  list(
    query?: ResourceListQuery,
    options?: ResourceOperationOptions,
  ): Promise<ResourcePage>
  get(
    ref: ManagedResourceRef,
    options?: ResourceOperationOptions,
  ): Promise<ResourceDisplayFacts>
  openCreateEditor(options?: ResourceOperationOptions): Promise<ResourceEditor>
  openEditEditor(
    ref: ManagedResourceRef,
    options?: ResourceOperationOptions,
  ): Promise<ResourceEditor>
  delete(
    ref: ManagedResourceRef,
    options?: ResourceOperationOptions,
  ): Promise<void>
}

export interface ManagedResourceRegistration {
  readonly siteType: ManagedSiteType
  readonly kind: ManagedResourceKind
  open(options?: ResourceOperationOptions): Promise<ManagedResourceWorkspace>
}
```

Keep native DTOs, config, commands, mutation certainty, and `unknown` out of this
file.

`ResourceDisplayFact` is safe product data, not an erased native value. It is
the only extension point for displaying additional verified primitive fields.
It deliberately has no object, nested, or JSON variant. The definition selects
which ids appear in the table and detail surface; the Adapter may return fewer
facts from `list` than from `get`. Reject duplicate fact ids and facts whose ids
are absent from the active definition policy in focused definition/Adapter
tests; the generic factory rejects duplicates without importing product policy.

- [ ] **Step 5: Run the definition tests and compile**

Run:

```powershell
pnpm exec vitest run tests/services/accountSiteDefinitions/registry.test.ts
pnpm compile
```

Expected: PASS.

- [ ] **Step 6: Commit the policy and public contract**

```powershell
git add src/services/apiAdapters/contracts/managedResourceNative.ts src/services/accountSiteDefinitions/contracts.ts src/services/accountSiteDefinitions/definitions.ts src/services/accountSiteDefinitions/registry.ts tests/services/accountSiteDefinitions/registry.test.ts
pnpm run validate:staged
git commit -m "refactor(managed-sites): define resource-native contracts"
```

### Task 2: Implement the typed native-resource factory

**Files:**

- Create: `src/services/apiAdapters/managedResources/factory.ts`
- Create: `tests/services/apiAdapters/managedResources/factory.test.ts`

- [ ] **Step 1: Write the synthetic Adapter contract tests**

Create `factory.test.ts` with a test-only definition using:

```ts
type TestConfig = { scope: string }
type TestLocator = { tenant: string; route: string }
type TestDetail = {
  id: TestLocator
  name: string
  secret: string
  settings: { visible: string; hidden: string }
}

const encodeLocator = (locator: TestLocator) =>
  `${encodeURIComponent(locator.tenant)}/${encodeURIComponent(locator.route)}`

function createDeferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}
```

Add these exact tests:

- `opens a ready workspace without exposing native config or detail types`
- `supports an opaque nonnumeric resource id and cursor page without a total`
- `rejects empty or over-512-character resource ids before native access`
- `rejects refs with the wrong site type resource kind or scope`
- `keeps hidden native detail in the edit-editor closure`
- `preserves a hidden nested native field across an allowed edit`
- `coalesces concurrent editor submits into one Adapter mutation`
- `maps possible and partial mutation outcomes to mutation_state_uncertain`
- `treats deletion of an already-missing resource as success`
- `maps abort before dispatch to aborted and keeps the editor reusable`
- `maps abort after dispatch to mutation_state_uncertain and closes the editor`
- `maps every Adapter read and mutation failure to a controlled public code`

- [ ] **Step 2: Run the contract test and verify the missing-module failure**

```powershell
pnpm exec vitest run tests/services/apiAdapters/managedResources/factory.test.ts
```

Expected: FAIL because `managedResources/factory.ts` does not exist.

- [ ] **Step 3: Define the internal correlated Adapter contract**

Keep the following result Adapter-facing: export it from `factory.ts` so a
site Adapter and later named capabilities can share the native certainty
contract, but do not add it to the feature-facing
`managedResourceNative.ts` contract:

```ts
export type NativeResourceMutationResult<T, TFailure> =
  | { certainty: "applied"; value: T }
  | { certainty: "not-applied"; failure: TFailure }
  | { certainty: "possibly-applied" }
  | { certainty: "partially-applied" }
```

Also export `defineNativeResourceKind` and its strongly typed definition input.
The registry still receives only the erased `ManagedResourceRegistration`:

```ts
export type NativeResourcePage<TItem> = {
  items: readonly TItem[]
  total?: number
  nextCursor?: string
}

export type NativeResourceEditorDefinition<TCommand> = {
  fields: readonly ResourceFieldDescriptor[]
  initialValues: EditableResourceProjection
  validate(values: EditableResourceProjection): ResourceValidationResult
  buildCommand(values: EditableResourceProjection): TCommand
}

export type NativeResourceKindDefinition<
  TConfig,
  TLocator,
  TListItem,
  TDetail,
  TCreateCommand,
  TUpdateCommand,
  TFailure,
> = {
  siteType: ManagedSiteType
  kind: ManagedResourceKind
  supportsSearch: boolean
  openConfig(options?: ResourceOperationOptions): Promise<TConfig>
  scopeKey(config: TConfig): string
  encodeLocator(locator: TLocator): string
  decodeLocator(resourceId: string): TLocator
  locatorFromListItem(item: TListItem): TLocator
  list(
    config: TConfig,
    query?: ResourceListQuery,
    options?: ResourceOperationOptions,
  ): Promise<NativeResourcePage<TListItem>>
  get(
    config: TConfig,
    locator: TLocator,
    options?: ResourceOperationOptions,
  ): Promise<TDetail>
  toListFacts(
    item: TListItem,
    ref: ManagedResourceRef,
  ): ResourceDisplayFacts
  toDetailFacts(
    detail: TDetail,
    ref: ManagedResourceRef,
  ): ResourceDisplayFacts
  createEditor(
    config: TConfig,
    options?: ResourceOperationOptions,
  ): Promise<NativeResourceEditorDefinition<TCreateCommand>>
  editEditor(
    config: TConfig,
    detail: TDetail,
  ): NativeResourceEditorDefinition<TUpdateCommand>
  create(
    config: TConfig,
    command: TCreateCommand,
    options?: ResourceOperationOptions,
  ): Promise<NativeResourceMutationResult<TDetail, TFailure>>
  update(
    config: TConfig,
    detail: TDetail,
    command: TUpdateCommand,
    options?: ResourceOperationOptions,
  ): Promise<NativeResourceMutationResult<TDetail, TFailure>>
  delete(
    config: TConfig,
    locator: TLocator,
    options?: ResourceOperationOptions,
  ): Promise<NativeResourceMutationResult<void, TFailure>>
  mapFailure(error: unknown): ResourceFailure
}

export function defineNativeResourceKind<
  TConfig,
  TLocator,
  TListItem,
  TDetail,
  TCreateCommand,
  TUpdateCommand,
  TFailure,
>(
  definition: NativeResourceKindDefinition<
    TConfig,
    TLocator,
    TListItem,
    TDetail,
    TCreateCommand,
    TUpdateCommand,
    TFailure
  >,
): ManagedResourceRegistration
```

The definition must provide `siteType`, `kind`, `supportsSearch`, `openConfig`,
`scopeKey`, locator encode/decode, list/get/project functions, create/edit
editor builders, mutation functions, and a failure mapper. Do not export an
erased generic container or use registry-level casts.

`TFailure` is the Adapter's controlled internal failure type. It is the only
addition to the design sketch's correlated generics and is necessary to keep
failure translation at the Workspace boundary; it never appears in the public
Workspace or registry type.

- [ ] **Step 4: Implement ref validation, editor closure, and certainty mapping**

Use one normalization helper:

```ts
const toPublicMutation = async <T, TFailure>(
  operation: () => Promise<NativeResourceMutationResult<T, TFailure>>,
  mapFailure: (failure: TFailure) => ResourceFailure,
): Promise<T> => {
  const result = await operation()
  if (result.certainty === "applied") return result.value
  if (result.certainty === "not-applied") {
    throw new ManagedResourceError(mapFailure(result.failure))
  }
  throw new ManagedResourceError({
    code: MANAGED_RESOURCE_FAILURE_CODES.MutationStateUncertain,
  })
}
```

The editor closure stores native detail and one `inflight` Promise. A second
submit returns the same Promise. Validation failure does not dispatch. Applied,
possibly-applied, partially-applied, and not-found outcomes close the session;
a confirmed pre-dispatch rejection leaves it reusable. Already-missing delete
is normalized to success. Validate `resourceId` as a non-empty string of at most
512 characters before locator decoding or native access.

- [ ] **Step 5: Run the factory tests**

```powershell
pnpm exec vitest run tests/services/apiAdapters/managedResources/factory.test.ts
```

Expected: PASS with all twelve contract cases.

- [ ] **Step 6: Commit the factory**

```powershell
git add src/services/apiAdapters/managedResources/factory.ts tests/services/apiAdapters/managedResources/factory.test.ts
pnpm run validate:staged
git commit -m "refactor(managed-sites): implement resource-native adapter factory"
```

### Task 3: Expose the pinned AxonHub native protocol

**Files:**

- Modify: `src/types/axonHub.ts`
- Modify: `src/services/apiService/axonHub/index.ts`
- Test: `tests/services/apiService/axonHub/index.test.ts`

- [ ] **Step 1: Add failing GraphQL contract tests**

Using the existing `AUTH_URL`, `GRAPHQL_URL`, `matchesGraphqlOperation`, and MSW
helpers, add these tests:

- `returns one native AxonHub channel page with its upstream cursor`
- `loads native AxonHub detail by opaque GraphQL id`
- `selects every pinned beta5 settings field required for replacement preservation`
- `sends verified update and clear fields unchanged`
- `classifies abort before mutation dispatch as not-dispatched`
- `classifies abort after mutation dispatch as dispatched`
- `retains controlled status and dispatch phase in AxonHub protocol failures`

Assert operation names, variables, and required selections. Do not snapshot a
whole GraphQL document.

- [ ] **Step 2: Run the focused protocol tests and verify failure**

```powershell
pnpm exec vitest run tests/services/apiService/axonHub/index.test.ts
```

Expected: FAIL because native page/detail functions and beta5 fields are absent.

- [ ] **Step 3: Complete the beta5 native types**

Extend `AxonHubChannel`, `AxonHubChannelCredentials`,
`AxonHubChannelSettings`, `AxonHubCreateChannelInput`, and
`AxonHubUpdateChannelInput` with the pinned fields from the spec. The update
type must represent `status`, append fields, and every verified `clearXxx`
flag. Settings must explicitly type every beta5 `ChannelSettingsInput` member;
do not rely on `[key: string]: unknown` for preservation.

Use this pinned `d061ac7` settings matrix in both the detail selection and the
replacement input. Every selected output object is mapped field-for-field to
its input counterpart when only `extraModelPrefix` changes:

| Setting field | Pinned output/input shape |
| --- | --- |
| `extraModelPrefix` | nullable string |
| `modelMappings` | `{ from, to }[]` to `ModelMappingInput[]` |
| `autoTrimedModelPrefixes` | string array |
| `hideOriginalModels` | nullable boolean |
| `hideMappedModels` | nullable boolean |
| `lowercaseModelId` | nullable boolean |
| `proxy` | `{ type, url, username, password }` to `ProxyConfigInput` |
| `transformOptions` | `{ forceArrayInstructions, forceArrayInputs, replaceDeveloperRoleWithSystem, reasoningEffortMapping: { from, to }[] }` to matching input |
| `headerOverrideOperations` | `{ op, path, from, to, value, condition, match: { path, eq }, index, splat }[]` to matching inputs |
| `bodyOverrideOperations` | same override-operation shape |
| `passThroughUserAgent` | nullable boolean |
| `passThroughBody` | nullable boolean |
| `rateLimit` | `{ rpm, tpm, maxConcurrent, queueSize, queueTimeoutMs }` to matching input |
| `retryableStatusCodes` | integer array |
| `retryableErrorPatterns` | `{ pattern, regex }[]` to matching inputs |
| `providerQuota` | `{ opencodeGo: { workspaceId, authCookie } }` to matching input |

The detail GraphQL selection must include every field and nested member in the
table. Tests assert each member individually. Do not claim preservation for an
unselected fork-specific field. Keep the pinned source URL and commit beside
the selection and mapping code.

- [ ] **Step 4: Add controlled internal protocol errors**

In the AxonHub API module add:

```ts
export type AxonHubRequestFailureKind =
  | "authentication"
  | "permission"
  | "not-found"
  | "upstream-rejected"
  | "protocol"
  | "unavailable"
  | "aborted"

export class AxonHubRequestError extends Error {
  constructor(
    readonly kind: AxonHubRequestFailureKind,
    readonly dispatch: "not-dispatched" | "dispatched",
  ) {
    super(kind)
    this.name = "AxonHubRequestError"
  }
}
```

Wrap `AbortError` in `AxonHubRequestError` while preserving whether the native
mutation was dispatched. A signal already aborted before mutation dispatch is
`not-dispatched`; an abort from the in-flight mutation request is `dispatched`.
Distinguish sign-in rejection from network failure, classify a post-refresh
403 as permission denial, and never include response body text or credentials
in the typed error.

- [ ] **Step 5: Add native page/detail operations and signal-aware mutations**

Add:

```ts
export type AxonHubChannelPage = {
  items: AxonHubChannel[]
  total?: number
  nextCursor?: string
}

export async function listAxonHubChannelPage(
  config: AxonHubConfig,
  input: { cursor?: string; limit: number },
  options?: Pick<RequestInit, "signal">,
): Promise<AxonHubChannelPage>

export async function getAxonHubChannel(
  config: AxonHubConfig,
  id: string,
  options?: Pick<RequestInit, "signal">,
): Promise<AxonHubChannel>
```

Make create, update, status update, and delete accept the same signal options.
Keep current legacy list/cache/projection exports working by building them on
the new page primitive where practical.

Add the pinned commit URL beside the detail selection and update input logic,
stating the settings-preservation, clear-flag, and permission-null contracts.

- [ ] **Step 6: Run protocol and legacy AxonHub tests**

```powershell
pnpm exec vitest run tests/services/apiService/axonHub/index.test.ts tests/services/apiAdapters/managedSites/axonHub.test.ts tests/services/managedSites/providers/axonHub.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit the protocol slice**

```powershell
git add src/types/axonHub.ts src/services/apiService/axonHub/index.ts tests/services/apiService/axonHub/index.test.ts
pnpm run validate:staged
git commit -m "refactor(axonhub): expose native channel protocol"
```

### Task 4: Register the AxonHub native Adapter without UI cutover

**Files:**

- Create: `src/services/apiAdapters/managedResources/axonHub.ts`
- Create: `src/services/apiAdapters/managedResources/registry.ts`
- Create: `tests/services/apiAdapters/managedResources/axonHub.test.ts`

- [ ] **Step 1: Write failing AxonHub registration tests**

Add these exact cases:

- `opens AxonHub with validated saved configuration`
- `maps missing invalid authentication permission and aborted config failures safely`
- `maps native list and detail responses to safe display facts`
- `maps all fourteen approved fields to safe detail facts`
- `returns only the definition-selected safe fact subset from list`
- `searches across all AxonHub pages when supportsSearch is true`
- `matches resource-wide search against opaque id and safe display facts`
- `exposes only the approved first editable field set`
- `keeps archived distinct from disabled`
- `omits unchanged unavailable permission-hidden and masked credentials`
- `emits a replacement credential only for explicit replace intent`
- `emits only changed top-level fields and verified clear flags`
- `preserves every selected pinned setting while updating extraModelPrefix`
- `validates supported manual and default-model invariants`
- `maps create plus failed status follow-up to mutation_state_uncertain without replay`
- `registers AxonHub separately from legacy SiteTypeCapabilities`
- `does not treat registration presence as native rollout mode`
- `has a registration for every definition currently marked native-resource`

Use `vi.hoisted` mocks and local placeholder builders. Never import legacy test
builders or real service data.

- [ ] **Step 2: Run the Adapter tests and verify failure**

```powershell
pnpm exec vitest run tests/services/apiAdapters/managedResources/axonHub.test.ts
```

Expected: FAIL because the registration and native registry do not exist.

- [ ] **Step 3: Implement AxonHub config opening and failure mapping**

`openConfig` must call `userPreferences.getPreferences()` directly, then pass
the result to `resolveManagedSiteRuntimeConfigForType(preferences,
SITE_TYPES.AXON_HUB)`. Missing fields map to `configuration_required`; storage
errors remain `unavailable` or `unexpected` rather than becoming missing config.
Validate sign-in with the caller signal.

Keep configuration in a site-private session shared by the registration and
later named Axon capabilities. Export these exact symbols from this Adapter
module, not from the public Workspace contract:

```ts
export type AxonHubNativeFailure = {
  code:
    | "configuration_required"
    | "invalid_configuration"
    | "authentication_failed"
    | "permission_denied"
    | "not_found"
    | "unavailable"
    | "upstream_rejected"
    | "aborted"
    | "unexpected"
  dispatch: "before" | "after"
}

export class AxonHubNativeError extends Error {
  constructor(readonly failure: AxonHubNativeFailure) {
    super(failure.code)
    this.name = "AxonHubNativeError"
  }
}

export interface AxonHubNativeResourceOperations {
  readonly scopeKey: string
  list(
    query?: ResourceListQuery,
    options?: ResourceOperationOptions,
  ): Promise<{
    items: readonly AxonHubChannel[]
    nextCursor?: string
  }>
  get(
    ref: ManagedResourceRef,
    options?: ResourceOperationOptions,
  ): Promise<AxonHubChannel>
  create(
    input: AxonHubCreateChannelInput,
    desiredStatus: AxonHubChannelStatus,
    options?: ResourceOperationOptions,
  ): Promise<
    NativeResourceMutationResult<AxonHubChannel, AxonHubNativeFailure>
  >
  update(
    detail: AxonHubChannel,
    input: AxonHubUpdateChannelInput,
    options?: ResourceOperationOptions,
  ): Promise<
    NativeResourceMutationResult<AxonHubChannel, AxonHubNativeFailure>
  >
  delete(
    ref: ManagedResourceRef,
    options?: ResourceOperationOptions,
  ): Promise<NativeResourceMutationResult<void, AxonHubNativeFailure>>
}

export function openAxonHubNativeResourceOperations(
  options?: ResourceOperationOptions,
): Promise<AxonHubNativeResourceOperations>
```

The session closes over validated `AxonHubConfig`; callers never receive it.
Its non-secret normalized origin is exposed only as `scopeKey` for ref
validation. Open/read failures throw `AxonHubNativeError`; mutation failures
use the certainty result.
Use it as the factory's correlated `TConfig` so list/detail/editor mutations and
the named migration capability share one protocol implementation. Mutations
always return the certainty union.
Map the internal failure only at the Workspace or named-feature boundary.

- [ ] **Step 4: Implement the approved AxonHub display/editor projection**

Use this exact field-id allowlist:

```ts
const AXON_HUB_EDITABLE_FIELD_IDS = [
  "name",
  "type",
  "baseURL",
  "status",
  "key",
  "supportedModels",
  "manualModels",
  "defaultTestModel",
  "autoSyncSupportedModels",
  "autoSyncModelPattern",
  "tags",
  "orderingWeight",
  "remark",
  "extraModelPrefix",
] as const
```

Regular-key type options must exclude pinned OAuth/AWS/GCP credential types and
exclude unknown future types by default. Existing special-credential channels
remain viewable and may edit safe non-credential fields, but cannot change type
or credentials.

Map every allowlisted id into a primitive `ResourceDisplayFact` returned by
detail. The list projection returns only the definition's table ids. The `key`
fact carries secret state and never a credential value. Resource-wide search
loads all required upstream pages and compares the normalized term against the
opaque resource id and safe textual/list facts only; it never searches native
detail, credentials, or only the current cursor page.

Top-level updates omit unchanged fields. Empty base URL, manual models, pattern,
tags, and remark use verified clear flags. Clearing `extraModelPrefix` writes an
empty prefix inside a settings object merged from every field selected by the
pinned detail query; never send `clearSettings`.

- [ ] **Step 5: Implement create/update/delete certainty**

Create sends one native create command. If the requested status is enabled, run
the dedicated status mutation once. A failure after confirmed creation returns
`partially-applied`; a lost acknowledgement after dispatch returns
`possibly-applied`. Neither path retries create. Edit uses
`UpdateChannelInput.status` in the main mutation. Delete treats an upstream
not-found as success.

- [ ] **Step 6: Add the explicit native registry**

`registry.ts` must import the production Axon registration and expose:

```ts
export function getManagedResourceRegistration(
  siteType: ManagedSiteType,
  kind: ManagedResourceKind,
): ManagedResourceRegistration | null
```

Use a typed key helper and a fixed registration array. Do not add a property to
`SiteTypeCapabilities.managedSites`, infer definition mode from registration
presence, or fall back to the legacy adapter.

- [ ] **Step 7: Run focused and legacy regression tests**

```powershell
pnpm exec vitest run tests/services/apiAdapters/managedResources/axonHub.test.ts tests/services/apiService/axonHub/index.test.ts tests/services/apiAdapters/managedSites/axonHub.test.ts tests/services/apiAdapters/registry.test.ts tests/services/managedSites/providers/axonHub.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit the registration slice**

```powershell
git add src/services/apiAdapters/managedResources/axonHub.ts src/services/apiAdapters/managedResources/registry.ts tests/services/apiAdapters/managedResources/axonHub.test.ts
pnpm run validate:staged
git commit -m "refactor(axonhub): register native resource adapter"
```

## PR1 final verification

- [ ] Confirm every task commit ran `validate:staged` after its exact `git add`
  and before `git commit`. Do not run a no-staged-files command as a substitute.

- [ ] Run the shared-contract remote handoff gate:

```powershell
pnpm run validate:push
```

Expected: `pnpm compile` and `pnpm knip` both pass.

- [ ] Inspect scope:

```powershell
git diff --stat 7756a5f18..HEAD
git diff --name-status 7756a5f18..HEAD
git diff --check 7756a5f18..HEAD
```

Expected: only the files named in this plan; no UI, migration, locale,
analytics, E2E, legacy resource contract, or legacy AxonHub adapter changes.

## Release-readiness decisions

- Telemetry: `none`; no user-visible route changes in PR1.
- E2E: `none`; protocol, factory, registration, and legacy regression tests
  cover the changed risk.
- Maintainability: reuse current Axon authentication, GraphQL transport, config
  resolver, and preference storage. Keep the new native projection out of the
  legacy Axon provider/adapter and do not split the entire Axon apiService.
