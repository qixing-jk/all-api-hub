# OpenRouter Native Key Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add complete workspace-scoped OpenRouter API-key management to the
existing Key Management page using native resource data, a provider-neutral
one-time-secret lifecycle shared with AIHubMix, and no `ApiToken` coercion.

**Architecture:** Extract fact-only resource contracts and field rendering from
the existing managed-resource implementation while retaining Managed Site
wrappers for AxonHub. Register a separate account-key-resource capability for
OpenRouter, keep its opaque string locators and workspace scope native, and add
feature-local controllers/components that coexist with the legacy token path.

**Tech Stack:** TypeScript, React, WXT, Zod, i18next, Vitest, Testing Library,
MSW, Playwright, pnpm.

**Design authority:**
`docs/superpowers/specs/2026-07-31-openrouter-native-key-management-design.md`

---

## Delivery Boundaries

This is one product feature delivered as progressive, compile-safe commits:

1. AxonHub keeps its existing Managed Site contracts and behavior. Generic
   resource facts/rendering move beneath narrow compatibility exports.
2. OpenRouter registers `account.keyResources`, never legacy
   `account.keyManagement`, `TokenProvisioningCapability`, or any
   `managedSites` capability.
3. OpenRouter inventory rows never become `ApiToken`, `AccountToken`, or
   `AccountRuntimeKey`; consequently they never inherit reveal, verify, repair,
   managed-site import, or direct export actions.
4. AIHubMix keeps its legacy key CRUD/provisioning contracts. Only its validated
   create response and presentation migrate to the common ephemeral-secret
   result.
5. Model catalog, channel management, workspace administration, automatic
   provisioning/repair, and live remote-mutation tests remain out of scope.

Before every task:

```powershell
git status --porcelain=v1 -b
```

Read every listed file before editing. Add the focused behavior test first,
observe the intended failure, implement the smallest complete slice, rerun the
focused command, stage only the task files, inspect the staged diff, run
`pnpm run validate:staged`, and commit with the listed message. When a task
changes shared exports/contracts, also run `pnpm compile` before staging.

## Final File and Ownership Map

| Responsibility | Final owner |
| --- | --- |
| Provider-neutral field/value/failure/mutation primitives | `src/services/apiAdapters/contracts/resourceNative.ts` |
| Provider-neutral ref/facts/mutation/editor/concurrency guards | `src/services/apiAdapters/nativeResources/` |
| Managed Site compatibility types | `src/services/apiAdapters/contracts/managedResourceNative.ts` |
| Account key refs, scope/session/collection/editor capability | `src/services/apiAdapters/contracts/accountKeyResource.ts` |
| Account-key public factory and correlation | `src/services/apiAdapters/accountKeyResources/` |
| Generic field-policy validation and native form controls | `src/features/ResourceEditor/` |
| OpenRouter HTTP schemas and transport | `src/services/apiService/openrouter/keyManagement.ts`, `keyManagementSchemas.ts` |
| OpenRouter scope, projection, payload, pagination, certainty | `src/services/apiAdapters/openrouter/accountKeyResource.ts` |
| Common ephemeral plaintext result | `src/services/accounts/createdRuntimeSecret.ts` |
| Common plaintext UI and profile persistence | `src/features/TokenProvisioning/components/OneTimeSecretDialog.tsx`, `apiCredentialProfileSaveAction.tsx` |
| Native Key Management orchestration | `src/features/KeyManagement/controllers/useAccountKeyResourceController.ts` |
| OpenRouter editor presentation policy | `src/features/KeyManagement/presentation/accountKeyResourceFieldPolicy.ts` |
| Native list/detail/editor/scope UI | `src/features/KeyManagement/components/AccountKeyResource/` |
| Existing legacy token orchestration | `src/features/KeyManagement/hooks/useKeyManagement.ts` |
| Literal localized product copy | `src/locales/*/keyManagement.json` |
| Deterministic browser contract | `e2e/openRouterKeyManagement.spec.ts` |

## Task 1: Extract Provider-Neutral Resource Contracts and Guards

**Files:**

- Create: `src/services/apiAdapters/contracts/resourceNative.ts`
- Create: `src/services/apiAdapters/nativeResources/factory.ts`
- Create: `src/services/apiAdapters/nativeResources/concurrency.ts`
- Modify: `src/services/apiAdapters/contracts/managedResourceNative.ts`
- Modify: `src/services/apiAdapters/managedResources/factory.ts`
- Modify: `src/features/ManagedSiteChannels/controllers/managedResourceConcurrency.ts`
- Create: `tests/services/apiAdapters/contracts/resourceNative.test.ts`
- Create: `tests/services/apiAdapters/nativeResources/factory.test.ts`
- Create: `tests/services/apiAdapters/nativeResources/concurrency.test.ts`
- Modify: `tests/services/apiAdapters/managedResources/factory.test.ts`
- Modify: `tests/services/apiAdapters/managedResources/axonHub.test.ts`
- Modify: `tests/features/ManagedSiteChannels/controllers/managedResourceConcurrency.test.ts`

- [ ] **Step 1: Write failing generic-contract and compatibility tests**

Create tests that import the neutral module directly and prove nullable values,
date-time facts, dynamic select dependencies, controlled failure detail, and
mutation certainty. Keep the existing Managed Site imports green through
aliases:

```ts
expect(RESOURCE_FIELD_TYPES).toMatchObject({
  Text: "text",
  Number: "number",
  DateTime: "date-time",
  Select: "select",
})

const value: ResourceFieldValue = null
expect(value).toBeNull()

const descriptor: ResourceFieldDescriptor = {
  fieldId: "creator",
  type: RESOURCE_FIELD_TYPES.Select,
  options: [],
  optionLoader: { dependsOn: ["workspace"] },
  nullable: true,
}
expect(descriptor.optionLoader.dependsOn).toEqual(["workspace"])

const failure: ResourceFailure = {
  code: RESOURCE_FAILURE_CODES.PermissionDenied,
  message: "permission denied",
  upstreamCode: "403",
}
expect(JSON.parse(JSON.stringify(failure))).toEqual(failure)

expect(MANAGED_RESOURCE_FIELD_TYPES).toBe(RESOURCE_FIELD_TYPES)
expect(MANAGED_RESOURCE_FAILURE_CODES).toBe(RESOURCE_FAILURE_CODES)
```

Extend managed factory tests to prove an AxonHub editor still coalesces a
concurrent submit, closes after an uncertain result, preserves opaque IDs, and
accepts the unchanged existing descriptors.

Add direct neutral-factory tests for:

- canonical ref construction/validation and facts/ref correlation;
- rejection of duplicate field IDs and unsafe search-value shapes;
- applied, not-applied, and possibly/partially-applied mutation resolution;
- one shared promise for concurrent editor submissions;
- retry after a definite rejection, but permanent closure after an applied or
  uncertain result; and
- settled bounded-concurrency mapping in original input order.

- [ ] **Step 2: Run the focused tests and verify RED**

```powershell
pnpm test tests/services/apiAdapters/contracts/resourceNative.test.ts tests/services/apiAdapters/nativeResources/factory.test.ts tests/services/apiAdapters/nativeResources/concurrency.test.ts tests/services/apiAdapters/managedResources/factory.test.ts tests/services/apiAdapters/managedResources/axonHub.test.ts tests/features/ManagedSiteChannels/controllers/managedResourceConcurrency.test.ts
```

Expected: the new neutral module and `DateTime`/nullable/dynamic-option shapes do
not exist; existing managed tests remain a compatibility baseline.

- [ ] **Step 3: Move only provider-neutral primitives**

Define the neutral contract with the runtime constants as the single source:

```ts
export const RESOURCE_FIELD_TYPES = {
  Text: "text",
  Textarea: "textarea",
  Number: "number",
  Boolean: "boolean",
  Select: "select",
  MultiSelect: "multi-select",
  Secret: "secret",
  DateTime: "date-time",
} as const

export type ResourceFieldOption = {
  value: string
  displayLabel?: string
  secondaryLabel?: string
}

type ResourceFieldDescriptorBase = {
  fieldId: string
  required?: boolean
  nullable?: boolean
  readOnly?: boolean
}

export type ResourceFieldDescriptor =
  | (ResourceFieldDescriptorBase & { type: "text" | "textarea" | "date-time" })
  | (ResourceFieldDescriptorBase & {
      type: "number"
      min?: number
      max?: number
      step?: number
    })
  | (ResourceFieldDescriptorBase & { type: "boolean" })
  | (ResourceFieldDescriptorBase & {
      type: "select" | "multi-select"
      options: readonly ResourceFieldOption[]
      optionLoader?: { dependsOn: readonly string[] }
    })
  | (ResourceFieldDescriptorBase & {
      type: "secret"
      secretState: ResourceSecretState
      canReplace: boolean
      replacementBlockReason?: ResourceSecretReplacementBlockReason
      allowClear: boolean
    })

export type ResourceFieldValue =
  | null
  | string
  | number
  | boolean
  | readonly string[]
  | SecretEditIntent

export type NativeResourceMutationResult<T, TFailure> =
  | { certainty: "applied"; value: T }
  | { certainty: "not-applied"; failure: TFailure }
  | { certainty: "possibly-applied" }
  | { certainty: "partially-applied" }
```

Move the existing failure codes, issue codes, secret states, operation options,
list query, projections, and validation types into the same file. Add optional
`message` and `upstreamCode` to `ResourceFailure`; do not add request bodies,
IDs, URLs, or arbitrary metadata.

`managedResourceNative.ts` must retain its current public names by re-exporting
or aliasing the neutral constants/types, then define only
`ManagedResourceRef`, `ResourceDisplayFacts`, `ResourcePage`, `ResourceEditor`,
`ManagedResourceWorkspace`, and `ManagedResourceRegistration`. Keep
`ManagedResourceError.name === "ManagedResourceError"`.

Create provider-neutral factory primitives in
`apiAdapters/nativeResources/factory.ts` rather than a second provider-shaped
factory. They own the reusable invariants currently embedded in the managed
factory:

```ts
createNativeResourceRefBoundary(...)
assertNativeResourceFacts(...)
resolveNativeResourceMutation(...)
createNativeEditorSubmitGate(...)
```

The ref boundary receives provider-specific build/match functions but owns
length, correlation, and opaque-resource-ID checks. The facts guard owns ref
identity, unique field IDs, and string-only search values. The mutation
resolver converts certainty to a public value/failure without knowing a site
type. The submit gate owns validation-before-command, one in-flight promise,
definite-rejection retry, and close-after-applied-or-uncertain behavior.

Move `mapSettledWithConcurrency` to
`apiAdapters/nativeResources/concurrency.ts`. Keep
`managedResourceConcurrency.ts` as a compatibility re-export so existing UI
callers do not move in this task.

Refactor `managedResources/factory.ts` to compose these primitives and import
`NativeResourceMutationResult` from the neutral contract. Re-export the type
from the old factory path for downstream compatibility. Do not change AxonHub
behavior, DTOs, refs, routes, or public failures.

- [ ] **Step 4: Re-run focused tests and compile**

```powershell
pnpm test tests/services/apiAdapters/contracts/resourceNative.test.ts tests/services/apiAdapters/nativeResources/factory.test.ts tests/services/apiAdapters/nativeResources/concurrency.test.ts tests/services/apiAdapters/managedResources/factory.test.ts tests/services/apiAdapters/managedResources/axonHub.test.ts tests/features/ManagedSiteChannels/controllers/managedResourceConcurrency.test.ts
pnpm compile
```

Expected: all pass; no AxonHub DTO, ref, registration, or route changes.

- [ ] **Step 5: Stage, validate, and commit**

```powershell
git add -- src/services/apiAdapters/contracts/resourceNative.ts src/services/apiAdapters/nativeResources/factory.ts src/services/apiAdapters/nativeResources/concurrency.ts src/services/apiAdapters/contracts/managedResourceNative.ts src/services/apiAdapters/managedResources/factory.ts src/features/ManagedSiteChannels/controllers/managedResourceConcurrency.ts tests/services/apiAdapters/contracts/resourceNative.test.ts tests/services/apiAdapters/nativeResources/factory.test.ts tests/services/apiAdapters/nativeResources/concurrency.test.ts tests/services/apiAdapters/managedResources/factory.test.ts tests/services/apiAdapters/managedResources/axonHub.test.ts tests/features/ManagedSiteChannels/controllers/managedResourceConcurrency.test.ts
git diff --cached --name-status
pnpm run validate:staged
git commit -m "refactor(resources): extract native field contracts"
```

## Task 2: Extract the Fact-Driven Resource Editor

**Files:**

- Create: `src/features/ResourceEditor/resourceFieldPolicy.ts`
- Create: `src/features/ResourceEditor/NativeResourceEditorBody.tsx`
- Modify: `src/features/ManagedSiteChannels/presentation/managedResourceFieldPolicy.ts`
- Modify: `src/features/ManagedSiteChannels/presentation/ManagedResourceEditorBody.tsx`
- Create: `tests/features/ResourceEditor/resourceFieldPolicy.test.ts`
- Create: `tests/features/ResourceEditor/NativeResourceEditorBody.test.tsx`
- Modify: `tests/features/ManagedSiteChannels/presentation/managedResourceFieldPolicy.test.ts`
- Modify: `tests/features/ManagedSiteChannels/presentation/ManagedResourceEditorBody.test.tsx`

- [ ] **Step 1: Add failing policy and renderer tests**

Prove that policy classification fails closed and that native facts render with
frontend-owned copy:

```tsx
expect(() =>
  resolveResourceFieldPolicy(
    [{ fieldId: "name", type: "text" }],
    { fields: [], hiddenFields: [] },
  ),
).toThrow("resource field policy mismatch")

render(
  <NativeResourceEditorBody
    t={t}
    descriptors={[
      { fieldId: "limit", type: "number", nullable: true, min: 0 },
      {
        fieldId: "creator",
        type: "select",
        options: [{ value: "member-1", displayLabel: "Example member" }],
      },
    ]}
    policy={policy}
    values={{ limit: null, creator: "member-1" }}
    onValueChange={onValueChange}
  />,
)
expect(screen.getByRole("combobox", { name: "Creator" })).toHaveTextContent(
  "Example member",
)
```

Also retain tests for AxonHub channel-specific Name/Type/Status/Base URL/Secret/
Models fields, secret loading, auto-selection, and field error association.

- [ ] **Step 2: Run the focused tests and verify RED**

```powershell
pnpm test tests/features/ResourceEditor/resourceFieldPolicy.test.ts tests/features/ResourceEditor/NativeResourceEditorBody.test.tsx tests/features/ManagedSiteChannels/presentation/managedResourceFieldPolicy.test.ts tests/features/ManagedSiteChannels/presentation/ManagedResourceEditorBody.test.tsx
```

- [ ] **Step 3: Implement generic policy validation**

The neutral policy must own classification and ordering but not translation
keys:

```ts
export type ResourceFieldPresentation<TSection extends string = string> = {
  fieldId: string
  section: TSection
  order: number
  renderer: ResourceFieldDescriptor["type"]
  resolveLabel: (t: TFunction) => string
  resolveHelp?: (t: TFunction) => string
  resolvePlaceholder?: (t: TFunction) => string
  optionLabelResolvers?: Readonly<Record<string, (t: TFunction) => string>>
  resolveOptionFallback?: (t: TFunction) => string
  issueLabelResolvers?: Partial<
    Record<ResourceFieldIssue["code"], (t: TFunction) => string>
  >
  visibleWhen?: (values: EditableResourceProjection) => boolean
}

export function resolveResourceFieldPolicy<TSection extends string>(
  descriptors: readonly ResourceFieldDescriptor[],
  policy: ResourceEditorFieldPolicy<TSection>,
  sectionOrder: Readonly<Record<TSection, number>>,
) {
  // Reject duplicate, missing, extra, or renderer-mismatched classifications.
  // Return fields ordered by section then numeric order.
}
```

Use literal resolver functions in provider policies. Never call `t` with a
backend field name or construct a dynamic key.

- [ ] **Step 4: Implement the neutral controlled editor and Managed Site wrapper**

Move ordinary text, textarea, number, boolean, select, multi-select, date-time,
help, read-only, and field-error rendering into `NativeResourceEditorBody`.
Its public boundary is:

```ts
export type NativeResourceEditorBodyProps<TSection extends string> = {
  t: TFunction
  descriptors: readonly ResourceFieldDescriptor[]
  policy: ResourceEditorFieldPolicy<TSection>
  sectionOrder: Readonly<Record<TSection, number>>
  sectionLabelResolvers: Readonly<Record<TSection, (t: TFunction) => string>>
  values: EditableResourceProjection
  fieldIssues?: readonly ResourceFieldIssue[]
  disabled?: boolean
  onValueChange: (fieldId: string, value: ResourceFieldValue) => void
  onLoadOptions?: (
    fieldId: string,
    values: EditableResourceProjection,
    options?: ResourceOperationOptions,
  ) => Promise<readonly ResourceFieldOption[]>
  renderFieldOverride?: ResourceFieldRenderOverride
}
```

Dynamic option loads use one `AbortController` per field, abort when any listed
dependency changes, ignore late generations, and expose loading/empty/error/
retry state beside that field. `displayLabel` and `secondaryLabel` are escaped
React text; option `value` is never used as translated copy or a test ID.

Keep secret-specific and channel-specialized controls in
`ManagedResourceEditorBody` through `renderFieldOverride`; do not move
ChannelDialog ownership into the neutral feature. Convert
`managedResourceFieldPolicy.ts` to aliases/wrappers around the generic policy
while retaining its exported API and exact AxonHub registry.

- [ ] **Step 5: Re-run focused tests and compile**

```powershell
pnpm test tests/features/ResourceEditor/resourceFieldPolicy.test.ts tests/features/ResourceEditor/NativeResourceEditorBody.test.tsx tests/features/ManagedSiteChannels/presentation/managedResourceFieldPolicy.test.ts tests/features/ManagedSiteChannels/presentation/ManagedResourceEditorBody.test.tsx
pnpm compile
```

- [ ] **Step 6: Stage, validate, and commit**

```powershell
git add -- src/features/ResourceEditor/resourceFieldPolicy.ts src/features/ResourceEditor/NativeResourceEditorBody.tsx src/features/ManagedSiteChannels/presentation/managedResourceFieldPolicy.ts src/features/ManagedSiteChannels/presentation/ManagedResourceEditorBody.tsx tests/features/ResourceEditor/resourceFieldPolicy.test.ts tests/features/ResourceEditor/NativeResourceEditorBody.test.tsx tests/features/ManagedSiteChannels/presentation/managedResourceFieldPolicy.test.ts tests/features/ManagedSiteChannels/presentation/ManagedResourceEditorBody.test.tsx
git diff --cached --name-status
pnpm run validate:staged
git commit -m "refactor(ui): extract native resource editor"
```

## Task 3: Add the Account Key Resource Capability

**Files:**

- Create: `src/services/apiAdapters/contracts/accountKeyResource.ts`
- Create: `src/services/apiAdapters/accountKeyResources/ref.ts`
- Create: `src/services/apiAdapters/accountKeyResources/factory.ts`
- Create: `src/services/accounts/createdRuntimeSecret.ts`
- Modify: `src/services/apiAdapters/contracts/siteTypeCapabilities.ts`
- Modify: `src/services/accounts/utils/apiServiceRequest.ts`
- Modify: `src/services/accounts/keyProductCapabilities.ts`
- Create: `tests/services/apiAdapters/accountKeyResources/ref.test.ts`
- Create: `tests/services/apiAdapters/accountKeyResources/factory.test.ts`
- Modify: `tests/services/accounts/apiServiceRequest.test.ts`
- Modify: `tests/services/accounts/keyProductCapabilities.test.ts`
- Modify: `tests/services/apiAdapters/registry.test.ts`

- [ ] **Step 1: Write failing capability, ref, and product-policy tests**

Use a fake account-native capability to prove the new path is separate:

```ts
expect(context.accountKeyResources).toBe(
  context.capabilities.account?.keyResources,
)
expect(context.keyManagement).toBeUndefined()

expect(
  isAccountKeyResourceRefFor(ref, {
    accountId: "account-example",
    siteType: SITE_TYPES.OPENROUTER,
    scopeKey: "workspace-example",
  }),
).toBe(true)

expect(getAccountKeyProductCapabilities(openRouterReadyAccount)).toMatchObject({
  resourceKeys: { list: true, create: true, update: true, delete: true },
  runtimeKeys: { list: false, resolveSecret: false },
  defaultTokenAutomation: { run: false },
})
```

The registry test should still assert that OpenRouter has no native capability
until Task 6 registers it; add a helper expectation but do not weaken the
existing no-legacy/no-managed-site assertions.

- [ ] **Step 2: Run the focused tests and verify RED**

```powershell
pnpm test tests/services/apiAdapters/accountKeyResources/ref.test.ts tests/services/apiAdapters/accountKeyResources/factory.test.ts tests/services/accounts/apiServiceRequest.test.ts tests/services/accounts/keyProductCapabilities.test.ts tests/services/apiAdapters/registry.test.ts
```

- [ ] **Step 3: Define the account-native public contract**

Use account/site/scope correlation and safe facts only:

```ts
export type AccountKeyResourceRef = {
  accountId: string
  siteType: AccountSiteType
  scopeKey: string
  resourceId: string
}

export type AccountKeyScope = {
  scopeKey: string
  routeKey: string
  displayName: string
  isDefault: boolean
  secondaryLabel?: string
}

export type AccountKeyResourceFacts = {
  ref: AccountKeyResourceRef
  displayName: string
  maskedLabel: string
  status: "enabled" | "disabled" | "expired" | "unknown"
  fields: readonly ResourceDisplayFact[]
  searchValues?: readonly string[]
  actions: { canUpdate: boolean; canDelete: boolean }
}

export type AccountKeyEditorSubmitResult = {
  facts: AccountKeyResourceFacts
  createdSecret?: CreatedRuntimeSecret
}

export interface AccountKeyResourceEditor {
  readonly fields: readonly ResourceFieldDescriptor[]
  readonly initialValues: EditableResourceProjection
  validate(values: EditableResourceProjection): ResourceValidationResult
  loadOptions?: (
    fieldId: string,
    values: EditableResourceProjection,
    options?: ResourceOperationOptions,
  ) => Promise<readonly ResourceFieldOption[]>
  submit(
    values: EditableResourceProjection,
    options?: ResourceOperationOptions,
  ): Promise<AccountKeyEditorSubmitResult>
}

export interface AccountKeyResourceCollection {
  readonly scope: AccountKeyScope
  list(query?: ResourceListQuery, options?: ResourceOperationOptions): Promise<
    ResourcePage<AccountKeyResourceFacts>
  >
  get(ref: AccountKeyResourceRef, options?: ResourceOperationOptions): Promise<AccountKeyResourceFacts>
  openEditEditor(ref: AccountKeyResourceRef, options?: ResourceOperationOptions): Promise<AccountKeyResourceEditor>
  delete(ref: AccountKeyResourceRef, options?: ResourceOperationOptions): Promise<void>
}

export interface AccountKeyResourceSession {
  resolveDefaultScope(options?: ResourceOperationOptions): Promise<AccountKeyScope>
  listScopes(options?: ResourceOperationOptions): Promise<readonly AccountKeyScope[]>
  openCollection(scopeKey: string, options?: ResourceOperationOptions): Promise<AccountKeyResourceCollection>
  openCreateEditor(scopeKey: string, options?: ResourceOperationOptions): Promise<AccountKeyResourceEditor>
}

export type AccountKeyResourceCapability = {
  open(input: AccountKeyResourceOpenInput, options?: ResourceOperationOptions): Promise<AccountKeyResourceSession>
}
```

`AccountKeyResourceOpenInput` contains only the saved account display snapshot
needed for correlation/profile naming and its already-built `ApiServiceRequest`.
It never accepts a caller-supplied Management Key separate from that request.

Add the compile-time `CreatedRuntimeSecret` contract in
`services/accounts/createdRuntimeSecret.ts` here so the account-key public
contract is usable in this commit. Its account-key correlation is structural
(`accountId`, `siteType`, `scopeKey`, `resourceId`) and does not import
`AccountKeyResourceRef`, avoiding a contract cycle. Constructors, validation,
and UI behavior arrive in Task 4.

The ref validator must reject blank/oversized values, wrong account/site/scope,
arrays, and mutated refs before adapter access. Native `resourceId` remains
opaque to consumers.

Build the account-key resource factory by composing the neutral ref boundary,
facts guard, mutation resolver, and editor submit gate from Task 1. The factory
owns account/site/scope/ref correlation, option-load failure mapping, and
create/edit editor lifecycle; it must not copy the corresponding managed
factory blocks. Its tests prove wrong-account, wrong-scope, and late/duplicate
submit results cannot escape through the public capability.

- [ ] **Step 4: Project capability and readiness without changing automation**

Add `account.keyResources?: AccountKeyResourceCapability` to
`SiteTypeCapabilities`, expose it as `accountKeyResources` from
`createDisplayAccountApiContext`, and add `resourceKeys` to
`AccountKeyProductCapabilities`. `runtimeKeys` and `apiTokens` continue to mean
recoverable legacy/runtime secrets; do not make them true merely because a
native resource capability exists. Default automation remains
`hasKeyManagement && hasTokenProvisioning`.

- [ ] **Step 5: Re-run focused tests and compile**

```powershell
pnpm test tests/services/apiAdapters/accountKeyResources/ref.test.ts tests/services/apiAdapters/accountKeyResources/factory.test.ts tests/services/accounts/apiServiceRequest.test.ts tests/services/accounts/keyProductCapabilities.test.ts tests/services/apiAdapters/registry.test.ts
pnpm compile
```

- [ ] **Step 6: Stage, validate, and commit**

```powershell
git add -- src/services/apiAdapters/contracts/accountKeyResource.ts src/services/apiAdapters/accountKeyResources/ref.ts src/services/apiAdapters/accountKeyResources/factory.ts src/services/accounts/createdRuntimeSecret.ts src/services/apiAdapters/contracts/siteTypeCapabilities.ts src/services/accounts/utils/apiServiceRequest.ts src/services/accounts/keyProductCapabilities.ts tests/services/apiAdapters/accountKeyResources/ref.test.ts tests/services/apiAdapters/accountKeyResources/factory.test.ts tests/services/accounts/apiServiceRequest.test.ts tests/services/accounts/keyProductCapabilities.test.ts tests/services/apiAdapters/registry.test.ts
git diff --cached --name-status
pnpm run validate:staged
git commit -m "feat(keys): add account-native resource capability"
```

## Task 4: Create the Shared One-Time-Secret Lifecycle

**Files:**

- Modify: `src/services/accounts/createdRuntimeSecret.ts`
- Create: `src/features/TokenProvisioning/components/OneTimeSecretDialog.tsx`
- Modify: `src/features/TokenProvisioning/components/OneTimeApiKeyDialog.tsx`
- Modify: `src/features/TokenProvisioning/components/AddTokenDialog/index.tsx`
- Create: `src/services/apiAdapters/aihubmix/createdSecret.ts`
- Modify: `src/features/TokenProvisioning/utils/apiCredentialProfileSaveAction.tsx`
- Modify: `src/features/TokenProvisioning/testIds.ts`
- Modify: `src/services/apiCredentialProfiles/accountTokenImport.ts`
- Create: `tests/services/accounts/createdRuntimeSecret.test.ts`
- Create: `tests/features/TokenProvisioning/OneTimeSecretDialog.test.tsx`
- Modify: `tests/features/TokenProvisioning/OneTimeApiKeyDialog.test.tsx`
- Modify: `tests/features/TokenProvisioning/utils/apiCredentialProfileSaveAction.test.ts`
- Modify: `tests/services/accounts/createdTokenSecretHandling.test.ts`
- Modify: `tests/features/TokenProvisioning/components/AddTokenDialog/prefill.test.tsx`
- Create: `tests/services/apiAdapters/aihubmix/createdSecret.test.ts`

- [ ] **Step 1: Add failing secret-domain and dialog tests**

Prove that the common result is not `ApiToken`, the secret never enters the
correlation/display object, and close confirmation depends on a successful
built-in action:

```ts
const result = createLegacyCreatedRuntimeSecret({
  account: exampleAccount,
  token: { name: "Example key", key: "sk-example-secret" },
})
expect(result).toMatchObject({
  displayName: "Example key",
  secret: "sk-example-secret",
  secretAvailability: "create-response-only",
  credential: { apiType: API_TYPES.OPENAI_COMPATIBLE },
})
expect(result).not.toHaveProperty("id")
expect(result).not.toHaveProperty("status")
```

Dialog cases:

```tsx
await user.click(screen.getByTestId(TOKEN_PROVISIONING_TEST_IDS.oneTimeKeyCloseButton))
expect(screen.getByRole("dialog", { name: "Leave without saving?" })).toBeVisible()
expect(onClose).not.toHaveBeenCalled()

await user.click(screen.getByTestId(TOKEN_PROVISIONING_TEST_IDS.oneTimeKeyCopyButton))
await user.click(screen.getByTestId(TOKEN_PROVISIONING_TEST_IDS.oneTimeKeyCloseButton))
expect(onClose).toHaveBeenCalledOnce()
```

Also cover failed clipboard, failed save retaining the secret, successful save,
double-submit prevention, deliberate confirmed close, reset on a new result,
and no backdrop close.

- [ ] **Step 2: Run the focused tests and verify RED**

```powershell
pnpm test tests/services/accounts/createdRuntimeSecret.test.ts tests/services/apiAdapters/aihubmix/createdSecret.test.ts tests/features/TokenProvisioning/OneTimeSecretDialog.test.tsx tests/features/TokenProvisioning/OneTimeApiKeyDialog.test.tsx tests/features/TokenProvisioning/utils/apiCredentialProfileSaveAction.test.ts tests/services/accounts/createdTokenSecretHandling.test.ts tests/features/TokenProvisioning/components/AddTokenDialog/prefill.test.tsx
```

- [ ] **Step 3: Implement the ephemeral result and profile save boundary**

Define only current-dialog facts:

```ts
export type CreatedRuntimeSecret = {
  correlation:
    | { kind: "legacy-create"; accountId: string }
    | { kind: "account-key-resource"; ref: AccountKeyResourceRef }
  displayName: string
  secret: string
  secretAvailability: "create-response-only"
  credential: {
    accountName: string
    fallbackAccountName?: string
    apiType: ApiVerificationApiType
    baseUrl: string
    siteType?: string
    tagIds: readonly string[]
  }
}
```

Reject blank secrets and blank correlation IDs in constructors. The type has no
storage serializer, list projection, logger, analytics payload, or global queue.

Change `createProfileFromAccountToken` to accept an optional `apiType` with the
current OpenAI-compatible default. Change the one-time save builder to accept
`CreatedRuntimeSecret` and redact exactly `result.secret` from errors. Keep the
batch runtime-key save path unchanged.

- [ ] **Step 4: Implement the provider-neutral dialog and AIHubMix adapter**

`OneTimeSecretDialog` receives `result`, `onClose`, optional save action, and
controlled result callbacks only:

```ts
type OneTimeSecretDialogProps = {
  isOpen: boolean
  result: CreatedRuntimeSecret | null
  onClose: () => void
  autoCopy?: boolean
  saveAction?: { onSave: () => Promise<void>; label?: string }
  onCopyResult?: (result: "success" | "failure") => void
  onSaveResult?: (result: "success" | "failure") => void
}
```

Keep plaintext in component/mutation state only. A successful auto-copy counts
as handled; a failed auto-copy does not. Closing before copy/save opens a local
confirmation modal; confirmed close clears local state then calls `onClose`.

Keep `OneTimeApiKeyDialog.tsx` as a narrow compatibility wrapper for existing
callers. Put AIHubMix ownership in
`apiAdapters/aihubmix/createdSecret.ts`: it accepts the saved account plus a
validated, full, unmasked create response and returns
`CreatedRuntimeSecret`; it rejects blank or masked values and always uses the
canonical AIHubMix API origin. `AddTokenDialog` calls this adapter, builds the
common save action, and renders the new dialog. Do not change AIHubMix CRUD,
token provisioning, origin normalization, repair skip policy, or masked-key
behavior.

- [ ] **Step 5: Re-run focused tests, related callers, and compile**

```powershell
pnpm test tests/services/accounts/createdRuntimeSecret.test.ts tests/services/apiAdapters/aihubmix/createdSecret.test.ts tests/features/TokenProvisioning/OneTimeSecretDialog.test.tsx tests/features/TokenProvisioning/OneTimeApiKeyDialog.test.tsx tests/features/TokenProvisioning/utils/apiCredentialProfileSaveAction.test.ts tests/services/accounts/createdTokenSecretHandling.test.ts tests/features/TokenProvisioning/components/AddTokenDialog/prefill.test.tsx tests/features/AccountManagement/components/AccountDialog.test.tsx tests/features/AccountManagement/components/CopyKeyDialog.test.tsx tests/entrypoints/options/pages/ModelList/ModelKeyDialog.test.tsx tests/features/ModelList/components/ModelKeyDialog.test.tsx
pnpm compile
```

- [ ] **Step 6: Stage, validate, and commit**

```powershell
git add -- src/services/accounts/createdRuntimeSecret.ts src/services/apiAdapters/aihubmix/createdSecret.ts src/features/TokenProvisioning/components/OneTimeSecretDialog.tsx src/features/TokenProvisioning/components/OneTimeApiKeyDialog.tsx src/features/TokenProvisioning/components/AddTokenDialog/index.tsx src/features/TokenProvisioning/utils/apiCredentialProfileSaveAction.tsx src/features/TokenProvisioning/testIds.ts src/services/apiCredentialProfiles/accountTokenImport.ts tests/services/accounts/createdRuntimeSecret.test.ts tests/services/apiAdapters/aihubmix/createdSecret.test.ts tests/features/TokenProvisioning/OneTimeSecretDialog.test.tsx tests/features/TokenProvisioning/OneTimeApiKeyDialog.test.tsx tests/features/TokenProvisioning/utils/apiCredentialProfileSaveAction.test.ts tests/services/accounts/createdTokenSecretHandling.test.ts tests/features/TokenProvisioning/components/AddTokenDialog/prefill.test.tsx
git diff --cached --name-status
pnpm run validate:staged
git commit -m "refactor(keys): share one-time secret handling"
```

## Task 5: Implement the Verified OpenRouter Management API

**Files:**

- Create: `src/services/apiService/openrouter/request.ts`
- Create: `src/services/apiService/openrouter/keyManagementSchemas.ts`
- Create: `src/services/apiService/openrouter/keyManagement.ts`
- Modify: `src/services/apiService/openrouter/constants.ts`
- Modify: `src/services/apiService/openrouter/index.ts`
- Modify: `src/services/apiTransport/errors.ts`
- Modify: `src/services/apiTransport/request.ts`
- Create: `tests/services/apiService/openrouter/keyManagement.test.ts`
- Modify: `tests/services/apiService/openrouter/index.test.ts`
- Modify: `tests/services/apiTransport/errors.test.ts`
- Modify: `tests/services/apiTransport/request.test.ts`

- [ ] **Step 1: Add failing HTTP contract and parser tests**

Use MSW with reserved example identities. Assert canonical origin and Bearer
Management Key for every operation:

```ts
expect(request.url).toBe(
  "https://openrouter.ai/api/v1/keys?include_disabled=true&offset=100&workspace_id=workspace-example",
)
expect(request.headers.get("authorization")).toBe("Bearer mgmt-example")
```

Cover:

- `GET /keys`, `POST /keys`, `GET/PATCH/DELETE /keys/{hash}`;
- `GET /workspaces/default`, paged `GET /workspaces`, and paged members;
- exact create fields and exact mutable PATCH fields;
- `limit: null`, `limit: 0`, negative remaining values, nullable timestamps;
- 201 top-level plaintext key and malformed/missing plaintext;
- known optional fields, invalid known fields, and retained unknown fields;
- nested `{ error: { code, message, metadata } }` failures;
- 400/401/403/404/429/500 and abort;
- no mutation replay after network, abort, malformed-success, or 500 failure.

- [ ] **Step 2: Run the focused tests and verify RED**

```powershell
pnpm test tests/services/apiService/openrouter/keyManagement.test.ts tests/services/apiService/openrouter/index.test.ts tests/services/apiTransport/errors.test.ts tests/services/apiTransport/request.test.ts
```

- [ ] **Step 3: Centralize OpenRouter request construction**

Move canonicalization and credential validation from `index.ts` into
`request.ts`:

```ts
export function createOpenRouterManagementRequest(
  request: ApiServiceRequest,
): ApiServiceRequest {
  const accessToken = request.auth.accessToken?.trim()
  if (!accessToken) throw new OpenRouterManagementKeyRequiredError()
  return {
    ...request,
    baseUrl: OPENROUTER_API_BASE_URL,
    auth: {
      authType: AuthTypeEnum.AccessToken,
      accessToken,
      userId: undefined,
    },
  }
}
```

Both credits/account validation and key management must use this helper. Add a
source comment beside it citing OpenRouter's Management API authentication
guide. Never accept a runtime key fallback.

- [ ] **Step 4: Implement loose native schemas with strict known fields**

Use the existing Zod dependency. Keep unknown fields while rejecting invalid
known fields:

```ts
export const openRouterKeyInfoSchema = z
  .object({
    hash: z.string().trim().min(1),
    name: z.string(),
    label: z.string(),
    disabled: z.boolean(),
    limit: z.number().finite().nullable().optional(),
    limit_remaining: z.number().finite().nullable().optional(),
    limit_reset: z.enum(["daily", "weekly", "monthly"]).nullable().optional(),
    include_byok_in_limit: z.boolean().optional(),
    usage: z.number().finite().optional(),
    usage_daily: z.number().finite().optional(),
    usage_weekly: z.number().finite().optional(),
    usage_monthly: z.number().finite().optional(),
    byok_usage: z.number().finite().optional(),
    byok_usage_daily: z.number().finite().optional(),
    byok_usage_weekly: z.number().finite().optional(),
    byok_usage_monthly: z.number().finite().optional(),
    created_at: z.string().nullable().optional(),
    updated_at: z.string().nullable().optional(),
    expires_at: z.string().nullable().optional(),
    workspace_id: z.string().nullable().optional(),
    creator_user_id: z.string().nullable().optional(),
  })
  .loose()
```

Define corresponding workspace/member/list/create/update/delete response
schemas and `z.infer` types. Do not hand-cast response bodies.

- [ ] **Step 5: Implement endpoint functions without mutation retry**

Export the seven read/mutation functions with typed input objects. Query
parameters use `URLSearchParams`; path hashes use `encodeURIComponent`.
Mutation calls set `currentTabTransport: "disabled"`, invoke the transport
exactly once, and parse exactly one response. Add source comments for create
fields, PATCH limitations, and one-time plaintext.

Every new OpenRouter endpoint must call
`fetchApiResponse<unknown>(request, options)`, never `fetchApiData`. Validate
the complete raw response body before extracting provider fields. The top-level
body is the endpoint contract here: create must retain both
`{ data, key }`, and delete must retain `{ deleted: true }`; neither may be
collapsed into the shared One API/New API `data` convention before its Zod
schema parses it.

Extend `ApiError` with optional `upstreamCode`. Use the protocol-neutral raw
response contract from
`../specs/2026-08-05-api-transport-raw-response-boundary-design.md`, then let
the OpenRouter service recognize its nested `error.code` and `error.message`.
Preserve the message in private UI while ignoring `metadata`. Accept only
string/number codes whose normalized string is at most 64 characters and
matches `[A-Za-z0-9_.-]+`. Existing New API business-error classification and
unrelated provider behavior must remain unchanged.

- [ ] **Step 6: Re-run focused tests and compile**

```powershell
pnpm test tests/services/apiService/openrouter/keyManagement.test.ts tests/services/apiService/openrouter/index.test.ts tests/services/apiTransport/errors.test.ts tests/services/apiTransport/request.test.ts
pnpm compile
```

- [ ] **Step 7: Stage, validate, and commit**

```powershell
git add -- src/services/apiService/openrouter/request.ts src/services/apiService/openrouter/keyManagementSchemas.ts src/services/apiService/openrouter/keyManagement.ts src/services/apiService/openrouter/constants.ts src/services/apiService/openrouter/index.ts src/services/apiTransport/errors.ts src/services/apiTransport/request.ts tests/services/apiService/openrouter/keyManagement.test.ts tests/services/apiService/openrouter/index.test.ts tests/services/apiTransport/errors.test.ts tests/services/apiTransport/request.test.ts
git diff --cached --name-status
pnpm run validate:staged
git commit -m "feat(openrouter): add management key API"
```

## Task 6: Implement and Register the OpenRouter Native Adapter

**Files:**

- Create: `src/services/apiAdapters/openrouter/keyResourceFields.ts`
- Create: `src/services/apiAdapters/openrouter/accountKeyResource.ts`
- Modify: `src/services/apiAdapters/openrouter/index.ts`
- Create: `tests/services/apiAdapters/openrouter/accountKeyResource.test.ts`
- Modify: `tests/services/apiAdapters/registry.test.ts`
- Modify: `tests/services/accounts/apiServiceRequest.test.ts`
- Modify: `tests/services/accounts/keyProductCapabilities.test.ts`

- [ ] **Step 1: Add failing scope, projection, form, and mutation tests**

Test the adapter as a public capability, not by mocking its internal helper
sequence:

```ts
const session = await openRouterAccountKeyResources.open({
  account: exampleOpenRouterAccount,
  request: exampleManagementRequest,
})
const defaultScope = await session.resolveDefaultScope()
expect(defaultScope).toEqual({
  scopeKey: "workspace-default-id",
  routeKey: "default",
  displayName: "Default workspace",
  isDefault: true,
})
```

Cover workspace dedupe/pagination/fallback, member pagination, member reload
after workspace change, opaque hash correlation, key cursor offsets, duplicate
hash/repeated cursor rejection, AbortSignal, safe search facts, every list/detail
field, create/edit descriptor classification inputs, null/zero/unlimited,
create-only fields, PATCH diffs, one-time secret result, and error mapping.

Mutation cases must prove:

```ts
expect(createApiKey).toHaveBeenCalledTimes(1)
expect(updateApiKey).toHaveBeenCalledTimes(1)
expect(deleteApiKey).toHaveBeenCalledTimes(1)
```

For uncertain update, one GET confirms only an exact requested-field match. For
uncertain delete, one GET 404 confirms deletion; a returned resource leaves an
uncertain observable-current-state result. Create never searches by name and
never retries.

- [ ] **Step 2: Run the focused tests and verify RED**

```powershell
pnpm test tests/services/apiAdapters/openrouter/accountKeyResource.test.ts tests/services/apiAdapters/registry.test.ts tests/services/accounts/apiServiceRequest.test.ts tests/services/accounts/keyProductCapabilities.test.ts
```

- [ ] **Step 3: Define canonical OpenRouter field IDs and values**

Use one runtime constant source shared by Adapter and frontend policy:

```ts
export const OPENROUTER_KEY_FIELD_IDS = {
  Name: "name",
  Workspace: "workspace_id",
  Creator: "creator_user_id",
  LimitMode: "limit_mode",
  Limit: "limit",
  LimitReset: "limit_reset",
  ExpiresAt: "expires_at",
  Disabled: "disabled",
  IncludeByokInLimit: "include_byok_in_limit",
} as const

export const OPENROUTER_LIMIT_MODES = {
  Unlimited: "unlimited",
  Limited: "limited",
} as const

export const OPENROUTER_LIMIT_RESETS = {
  None: "none",
  Daily: "daily",
  Weekly: "weekly",
  Monthly: "monthly",
} as const
```

Do not repeat these literals in presentation, payload, or branching code.

- [ ] **Step 4: Implement workspace/session/collection semantics**

The capability binds one saved account/request. It resolves
`/workspaces/default`, drains `/workspaces?limit=100&offset=N`, deduplicates by
ID, and sorts default first then display name. When inventory fails but default
resolves, return the default plus a controlled non-blocking scope warning; when
default fails, opening the session fails.

`listScopes` exposes safe name/slug/role facts; `scopeKey` is the native ID and
`routeKey` is the slug. `openCollection` accepts only a scope from the validated
inventory. Account/scope/ref mismatch fails before decoding the hash.

Key collection cursors encode only an internal offset. A 100-item page emits the
next cursor; a shorter page stops. Reject malformed cursors, duplicate hashes,
and non-progressing offsets. Include disabled keys on every list request.

- [ ] **Step 5: Implement native projections and editor behavior**

Define the OpenRouter capability through the account-key resource factory from
Task 3. Supply only provider-owned scope inventory, locators, DTO projection,
field descriptors, commands, endpoint calls, and failure mapping; keep public
ref validation, fact correlation, and editor submit lifecycle in the shared
factory.

Retain the parsed native DTO inside Adapter closures. Project only safe facts:
name, masked label, status, limits, remaining, usage/BYOK usage, timestamps,
workspace display name, and creator display facts. `searchValues` contains name,
masked label, status, and approved display text; it excludes hash, workspace/
member IDs, account credential, and native objects.

Create descriptors include every documented POST field. Creator uses:

```ts
{
  fieldId: OPENROUTER_KEY_FIELD_IDS.Creator,
  type: RESOURCE_FIELD_TYPES.Select,
  nullable: true,
  options: [],
  optionLoader: { dependsOn: [OPENROUTER_KEY_FIELD_IDS.Workspace] },
}
```

`loadOptions` validates the selected workspace, drains its members, and returns
`displayLabel`/`secondaryLabel` facts. Edit descriptors keep workspace,
creator, and expiry read-only and emit only documented mutable PATCH fields.
Convert a local `datetime-local` value to a validated UTC ISO string at payload
construction; blank maps to `null` only for create expiry.

On successful create, validate both `data` and top-level plaintext, then return
`CreatedRuntimeSecret` with correlation ref and OpenRouter's runtime API base
URL. Add official-source comments beside auth, fields, unsupported reveal,
create-only plaintext, and deliberate no-replay branches.

- [ ] **Step 6: Map failures and certainty without leaking secrets**

Map structured status/code to neutral failure codes. The private UI message is
`toSanitizedErrorSummary(error, [managementKey, createdPlaintextWhenKnown])`
with a localized fallback when blank. Never place request bodies, hashes,
workspace/member IDs, or error metadata into `ResourceFailure`.

Classify known 4xx rejection as not applied; a post-dispatch abort, network
loss, malformed success, or 5xx is possibly applied. Mutations are never
automatically replayed. Update/delete may perform exactly one read-only
reconciliation as defined in Step 1.

- [ ] **Step 7: Register only the native capability and rerun tests**

```ts
export const openRouterCapabilities: SiteTypeCapabilities = {
  siteType: SITE_TYPES.OPENROUTER,
  family: ACCOUNT_SITE_ADAPTER_FAMILIES.OpenRouter,
  account: {
    data: openRouterAccountData,
    refresh: openRouterAccountRefresh,
    keyResources: openRouterAccountKeyResources,
  },
}
```

Registry tests must assert exactly `data`, `keyResources`, and `refresh`, with
no `keyManagement`, `tokenProvisioning`, `managedSites`, or model catalog.

```powershell
pnpm test tests/services/apiAdapters/openrouter/accountKeyResource.test.ts tests/services/apiAdapters/registry.test.ts tests/services/accounts/apiServiceRequest.test.ts tests/services/accounts/keyProductCapabilities.test.ts
pnpm compile
```

- [ ] **Step 8: Stage, validate, and commit**

```powershell
git add -- src/services/apiAdapters/openrouter/keyResourceFields.ts src/services/apiAdapters/openrouter/accountKeyResource.ts src/services/apiAdapters/openrouter/index.ts tests/services/apiAdapters/openrouter/accountKeyResource.test.ts tests/services/apiAdapters/registry.test.ts tests/services/accounts/apiServiceRequest.test.ts tests/services/accounts/keyProductCapabilities.test.ts
git diff --cached --name-status
pnpm run validate:staged
git commit -m "feat(openrouter): register native key resources"
```

## Task 7: Build the Native Key Management Controller

**Files:**

- Create: `src/features/KeyManagement/controllers/useAccountKeyResourceController.ts`
- Modify: `src/features/KeyManagement/constants.ts`
- Modify: `src/features/KeyManagement/hooks/useKeyManagement.ts`
- Create: `tests/features/KeyManagement/controllers/useAccountKeyResourceController.test.tsx`
- Modify: `tests/entrypoints/options/pages/KeyManagement/useKeyManagement.test.tsx`

- [ ] **Step 1: Add failing single-account and all-account controller tests**

Use deferred promises to prove abort/generation behavior. Cover:

- single account: resolve/list scopes, route slug selection, list drain, search,
  status filter, refresh, open detail/create/edit/delete;
- invalid/stale/unauthorized route slug: default fallback, notice, URL
  canonicalization request, and no request to the stale scope;
- workspace change: abort old list/member loads, clear invalid creator, ignore
  late results, and request route replacement with account plus workspace slug;
- all accounts: open default scope only for each native-capable account,
  `Promise.allSettled` isolation, no workspace inventory selector, and merged
  native rows;
- submit/delete: one in-flight mutation, late-result isolation, refresh after
  applied result, fresh-read lock after uncertain result;
- create success: keep `CreatedRuntimeSecret` only in controller dialog state;
  closing/account switch/unmount clears it;
- no ID/name/limit/message in analytics calls.

Representative assertions:

```ts
expect(openCollection).toHaveBeenCalledWith("workspace-default-id", {
  signal: expect.any(AbortSignal),
})
expect(replaceRoute).toHaveBeenCalledWith({
  accountId: "account-example",
  workspace: "team",
})
expect(JSON.stringify(trackComplete.mock.calls)).not.toContain("hash-example")
expect(JSON.stringify(trackComplete.mock.calls)).not.toContain("workspace-default-id")
```

- [ ] **Step 2: Run focused tests and verify RED**

```powershell
pnpm test tests/features/KeyManagement/controllers/useAccountKeyResourceController.test.tsx tests/entrypoints/options/pages/KeyManagement/useKeyManagement.test.tsx
```

- [ ] **Step 3: Implement isolated native orchestration**

Export route constants from `constants.ts`:

```ts
export const KEY_MANAGEMENT_ROUTE_PARAMS = {
  AccountId: "accountId",
  Workspace: "workspace",
} as const

export const ACCOUNT_KEY_STATUS_FILTERS = {
  All: "all",
  Enabled: "enabled",
  Disabled: "disabled",
  Expired: "expired",
} as const
```

`useAccountKeyResourceController` receives `accounts`, `selectedAccount`,
`routeParams`, and a `replaceRoute` callback. It returns a discriminated state
with scopes, selected scope, rows, load progress/failures, editor/detail/delete
state, ephemeral created secret, status filter, and commands.

Use one generation per account/scope list and one per editor option field.
Abort obsolete requests; late generations cannot write rows, options, feedback,
or plaintext. Drain cursors until absent while rejecting duplicate ref identity
or cursor. Use all-account concurrency bounded to the existing Key Management
account-loading policy rather than unbounded `Promise.all`.

Track existing actions only: RefreshAccountTokens, CreateAccountToken,
UpdateAccountToken, DeleteAccountToken, CopyAccountTokenKey, and
SaveAccountTokenToApiCredentialProfile. Use the existing tracker's sanitized
`duration_ms`; do not add a provider-specific duration field. Insights contain
only `siteType`, mode, controlled counts/status, and coarse error category.

- [ ] **Step 4: Keep the legacy hook compatible without adding native logic**

In `useKeyManagement`, read `accountKeyResources` from the display context. If
an account has native resources but neither legacy key management nor service
credential, settle its legacy inventory as loaded with zero tokens rather than
`unsupported-key-management`. Do not load native scopes or resources in this
legacy hook and do not change its legacy CRUD/repair/visibility behavior.

- [ ] **Step 5: Re-run focused tests and compile**

```powershell
pnpm test tests/features/KeyManagement/controllers/useAccountKeyResourceController.test.tsx tests/entrypoints/options/pages/KeyManagement/useKeyManagement.test.tsx
pnpm compile
```

- [ ] **Step 6: Stage, validate, and commit**

```powershell
git add -- src/features/KeyManagement/controllers/useAccountKeyResourceController.ts src/features/KeyManagement/constants.ts src/features/KeyManagement/hooks/useKeyManagement.ts tests/features/KeyManagement/controllers/useAccountKeyResourceController.test.tsx tests/entrypoints/options/pages/KeyManagement/useKeyManagement.test.tsx
git diff --cached --name-status
pnpm run validate:staged
git commit -m "feat(keys): orchestrate native account resources"
```

## Task 8: Add the OpenRouter Dynamic Editor Experience

**Files:**

- Create: `src/features/KeyManagement/presentation/accountKeyResourceFieldPolicy.ts`
- Create: `src/features/KeyManagement/components/AccountKeyResource/AccountKeyResourceEditorDialog.tsx`
- Create: `src/features/KeyManagement/components/AccountKeyResource/OpenRouterWorkspaceSelector.tsx`
- Create: `tests/features/KeyManagement/presentation/accountKeyResourceFieldPolicy.test.ts`
- Create: `tests/features/KeyManagement/components/AccountKeyResourceEditorDialog.test.tsx`
- Create: `tests/features/KeyManagement/components/OpenRouterWorkspaceSelector.test.tsx`

- [ ] **Step 1: Add failing field-policy and editor behavior tests**

Assert exact field classification by mode:

```ts
expect(createPolicy.fields.map(({ fieldId }) => fieldId)).toEqual([
  OPENROUTER_KEY_FIELD_IDS.Name,
  OPENROUTER_KEY_FIELD_IDS.Workspace,
  OPENROUTER_KEY_FIELD_IDS.Creator,
  OPENROUTER_KEY_FIELD_IDS.LimitMode,
  OPENROUTER_KEY_FIELD_IDS.Limit,
  OPENROUTER_KEY_FIELD_IDS.LimitReset,
  OPENROUTER_KEY_FIELD_IDS.ExpiresAt,
  OPENROUTER_KEY_FIELD_IDS.IncludeByokInLimit,
])
expect(editPolicy.fields.map(({ fieldId }) => fieldId)).toContain(
  OPENROUTER_KEY_FIELD_IDS.Disabled,
)
```

Render tests cover compact single-column section order, literal localized
labels, unlimited/limited visibility, zero limit, reset cadence, BYOK advanced
disclosure, UTC/local expiry explanation, read-only edit fields, member
loading/empty/error/retry, invalid creator clearing after workspace change,
field issue association, double submit, unsaved-close confirmation, focus
return, and narrow-width action wrapping.

- [ ] **Step 2: Run focused tests and verify RED**

```powershell
pnpm test tests/features/KeyManagement/presentation/accountKeyResourceFieldPolicy.test.ts tests/features/KeyManagement/components/AccountKeyResourceEditorDialog.test.tsx tests/features/KeyManagement/components/OpenRouterWorkspaceSelector.test.tsx
```

- [ ] **Step 3: Define a static frontend-owned OpenRouter policy**

Use sections `basic`, `spending`, `lifecycle`, and `advanced`, with a fixed
section-order map. Every `resolveLabel`, help, placeholder, issue, and finite
option label calls a literal `t("keyManagement:openRouter...")` key. Policy
validation must fail if an Adapter descriptor is unclassified, duplicated, or
renderer-mismatched.

Visibility rules are product-owned:

```ts
visibleWhen: (values) =>
  values[OPENROUTER_KEY_FIELD_IDS.LimitMode] ===
  OPENROUTER_LIMIT_MODES.Limited
```

Dynamic workspace/member `displayLabel` is rendered as escaped upstream data,
not passed to `t`.

- [ ] **Step 4: Implement the editor and scope selector**

Compose `Modal`, `NativeResourceEditorBody`, `Alert`, `Button`, and existing
form primitives. The editor keeps projection state locally and delegates all
validation, option loading, and submit to its provided editor contract. It
shows the localized semantic rule summary without deriving protocol payloads.

The page-level workspace selector uses `SearchableSelect`, displays name plus
slug, exposes loading/partial/error/retry, and never falls back to a raw-ID
input. Changing it calls the controller with `scopeKey` while routing uses the
validated `routeKey` slug.

- [ ] **Step 5: Re-run focused tests and compile**

```powershell
pnpm test tests/features/KeyManagement/presentation/accountKeyResourceFieldPolicy.test.ts tests/features/KeyManagement/components/AccountKeyResourceEditorDialog.test.tsx tests/features/KeyManagement/components/OpenRouterWorkspaceSelector.test.tsx
pnpm compile
```

- [ ] **Step 6: Stage, validate, and commit**

```powershell
git add -- src/features/KeyManagement/presentation/accountKeyResourceFieldPolicy.ts src/features/KeyManagement/components/AccountKeyResource/AccountKeyResourceEditorDialog.tsx src/features/KeyManagement/components/AccountKeyResource/OpenRouterWorkspaceSelector.tsx tests/features/KeyManagement/presentation/accountKeyResourceFieldPolicy.test.ts tests/features/KeyManagement/components/AccountKeyResourceEditorDialog.test.tsx tests/features/KeyManagement/components/OpenRouterWorkspaceSelector.test.tsx
git diff --cached --name-status
pnpm run validate:staged
git commit -m "feat(openrouter): add native key editor"
```

## Task 9: Integrate Native Rows into Key Management

**Files:**

- Create: `src/features/KeyManagement/components/AccountKeyResource/AccountKeyResourceList.tsx`
- Create: `src/features/KeyManagement/components/AccountKeyResource/AccountKeyResourceListItem.tsx`
- Create: `src/features/KeyManagement/components/AccountKeyResource/AccountKeyResourceDetails.tsx`
- Modify: `src/features/KeyManagement/KeyManagement.tsx`
- Modify: `src/features/KeyManagement/components/TokenList.tsx`
- Modify: `src/features/KeyManagement/components/Header.tsx`
- Modify: `src/features/KeyManagement/components/AccountSelectorPanel.tsx`
- Modify: `src/features/KeyManagement/types.ts`
- Modify: `src/features/KeyManagement/testIds.ts`
- Modify: `src/locales/en/keyManagement.json`
- Modify: `src/locales/es-419/keyManagement.json`
- Modify: `src/locales/ja/keyManagement.json`
- Modify: `src/locales/pt-BR/keyManagement.json`
- Modify: `src/locales/vi/keyManagement.json`
- Modify: `src/locales/zh-CN/keyManagement.json`
- Modify: `src/locales/zh-TW/keyManagement.json`
- Create: `tests/features/KeyManagement/components/AccountKeyResourceListItem.test.tsx`
- Create: `tests/features/KeyManagement/components/AccountKeyResourceDetails.test.tsx`
- Modify: `tests/entrypoints/options/pages/KeyManagement/TokenList.grouping.test.tsx`
- Modify: `tests/entrypoints/options/pages/KeyManagement/TokenList.emptyStates.test.tsx`
- Modify: `tests/entrypoints/options/pages/KeyManagement/KeyManagement.emptyStateActions.test.tsx`
- Modify: `tests/features/KeyManagement/components/Header.test.tsx`
- Modify: `tests/features/KeyManagement/components/AccountSummaryBar.test.tsx`
- Modify: `tests/utils/i18nLocaleValidation.test.ts`

- [ ] **Step 1: Add failing native row, page, route, and compatibility tests**

Assert the OpenRouter row shows name, masked label, account/workspace, status,
limit/remaining/usage, and expandable native detail. It exposes only edit and
delete; copy/reveal/verify/save/export/managed-site/repair controls are absent:

```tsx
expect(screen.getByText("sk-or-v1-••••example")).toBeVisible()
expect(screen.queryByRole("button", { name: /copy key/i })).toBeNull()
expect(screen.queryByRole("button", { name: /verify api/i })).toBeNull()
expect(screen.queryByRole("button", { name: /save to api credentials/i })).toBeNull()
expect(screen.getByRole("button", { name: /edit key/i })).toBeVisible()
expect(screen.getByRole("button", { name: /delete key/i })).toBeVisible()
```

Add tests for disabled-by-default inclusion, status filtering, negative
remaining values, unlimited/missing distinctions, all-account mixed legacy and
native rows, partial account failures, combined empty/search states, native
counts in account summary, native Add action, no Repair/managed-site status for
OpenRouter, route preservation on refresh/back, and workspace clearing on
account/all-account switch.

Use static native test IDs. Never put hash/workspace/member ID into a DOM ID,
`data-testid`, label, route, log, or analytics fixture assertion.

- [ ] **Step 2: Run focused tests and verify RED**

```powershell
pnpm test tests/features/KeyManagement/components/AccountKeyResourceListItem.test.tsx tests/features/KeyManagement/components/AccountKeyResourceDetails.test.tsx tests/entrypoints/options/pages/KeyManagement/TokenList.grouping.test.tsx tests/entrypoints/options/pages/KeyManagement/TokenList.emptyStates.test.tsx tests/entrypoints/options/pages/KeyManagement/KeyManagement.emptyStateActions.test.tsx tests/features/KeyManagement/components/Header.test.tsx tests/features/KeyManagement/components/AccountSummaryBar.test.tsx
```

- [ ] **Step 3: Add a discriminated page-row boundary**

Keep legacy export types unchanged and introduce a broader display-only union:

```ts
export type NativeKeyManagementRow = {
  kind: "account-key-resource"
  rowKey: string
  accountId: string
  accountName: string
  workspaceName: string
  facts: AccountKeyResourceFacts
}

export type KeyManagementDisplayRow =
  | { kind: "runtime-key"; entry: KeyManagementEntry }
  | NativeKeyManagementRow
```

`ApiCredentialProfileSaveEntry` and `CliProxyExportEntry` remain aliases of the
legacy `KeyManagementEntry`, so native rows cannot enter batch/direct exports.
Generate `rowKey` locally from per-load sequence/correlation state; it must not
contain the native hash.

- [ ] **Step 4: Render native list/detail without legacy token components**

Implement dedicated row/header/detail components using Card, Badge, Button, and
Typography. Do not import `TokenListItem`, `TokenHeader`, `TokenDetails`,
`KeyDisplay`, `ApiToken`, or `AccountRuntimeKey`.

`TokenList` accepts native rows/state alongside legacy entries, renders both in
all-account mode, and computes empty/search states from their combined visible
count. Batch selection/export operates only on legacy entries and explains the
eligible count when native rows coexist.

- [ ] **Step 5: Wire page orchestration and dialogs**

`KeyManagement.tsx` owns the composition of legacy and native controllers. It:

- passes the selected account and route params to the native controller;
- writes `{ accountId, workspace: routeKey }` for valid single-account scope;
- clears workspace when changing account or selecting all accounts;
- renders the workspace selector only for one native-capable account;
- routes Add to native editor or legacy AddTokenDialog, never both;
- renders native editor/detail/delete and `OneTimeSecretDialog` state;
- clears the secret only after deliberate dialog close;
- does not enable repair, managed-site status, model list, or automatic flows
  for OpenRouter.

The native delete confirmation includes the visible key name and an irreversible
remote-deletion warning but not the hash.

- [ ] **Step 6: Add synchronized literal copy in all seven locales**

Add one identical key shape under `openRouter` in every `keyManagement.json`:
workspace selector states, status filter values, row/detail labels, editor
sections/fields/help/options/read-only explanations, semantic summary,
one-time/recovery copy, permission/auth/rate-limit/uncertain fallbacks, and
delete warning. Source calls use literal namespaced keys.

Do not modify settings-search registries, `*.search.ts`, anchors, or
`ANCHOR_TO_TAB`; the existing Key Management page search result remains the
canonical destination.

- [ ] **Step 7: Re-run focused tests, locale checks, extraction, and compile**

```powershell
pnpm test tests/features/KeyManagement/components/AccountKeyResourceListItem.test.tsx tests/features/KeyManagement/components/AccountKeyResourceDetails.test.tsx tests/entrypoints/options/pages/KeyManagement/TokenList.grouping.test.tsx tests/entrypoints/options/pages/KeyManagement/TokenList.emptyStates.test.tsx tests/entrypoints/options/pages/KeyManagement/KeyManagement.emptyStateActions.test.tsx tests/features/KeyManagement/components/Header.test.tsx tests/features/KeyManagement/components/AccountSummaryBar.test.tsx tests/utils/i18nLocaleValidation.test.ts
pnpm run i18n:extract:ci
pnpm compile
```

Inspect every `src/locales/**/keyManagement.json` diff and account for any
extractor deletion before staging.

- [ ] **Step 8: Stage, validate, and commit**

```powershell
git add -- src/features/KeyManagement/components/AccountKeyResource/AccountKeyResourceList.tsx src/features/KeyManagement/components/AccountKeyResource/AccountKeyResourceListItem.tsx src/features/KeyManagement/components/AccountKeyResource/AccountKeyResourceDetails.tsx src/features/KeyManagement/KeyManagement.tsx src/features/KeyManagement/components/TokenList.tsx src/features/KeyManagement/components/Header.tsx src/features/KeyManagement/components/AccountSelectorPanel.tsx src/features/KeyManagement/types.ts src/features/KeyManagement/testIds.ts src/locales/en/keyManagement.json src/locales/es-419/keyManagement.json src/locales/ja/keyManagement.json src/locales/pt-BR/keyManagement.json src/locales/vi/keyManagement.json src/locales/zh-CN/keyManagement.json src/locales/zh-TW/keyManagement.json tests/features/KeyManagement/components/AccountKeyResourceListItem.test.tsx tests/features/KeyManagement/components/AccountKeyResourceDetails.test.tsx tests/entrypoints/options/pages/KeyManagement/TokenList.grouping.test.tsx tests/entrypoints/options/pages/KeyManagement/TokenList.emptyStates.test.tsx tests/entrypoints/options/pages/KeyManagement/KeyManagement.emptyStateActions.test.tsx tests/features/KeyManagement/components/Header.test.tsx tests/features/KeyManagement/components/AccountSummaryBar.test.tsx tests/utils/i18nLocaleValidation.test.ts
git diff --cached --name-status
pnpm run validate:staged
git commit -m "feat(openrouter): integrate native key management"
```

## Task 10: Close Privacy, One-Time Action, and Compatibility Coverage

**Files:**

- Modify: `tests/services/productAnalytics/privacy.test.ts`
- Modify: `tests/services/productAnalytics/actions.test.ts`
- Modify: `tests/features/TokenProvisioning/OneTimeSecretDialog.test.tsx`
- Modify: `tests/services/accounts/accountRuntimeKeys.test.ts`
- Modify: `tests/services/accountOperations.autoProvisionKeyOnAccountAdd.test.ts`
- Modify: `tests/services/accountKeyRepair.test.ts`
- Modify: `tests/features/KeyManagement/components/RepairMissingKeysDialog/index.test.tsx`
- Modify: `tests/services/apiAdapters/managedResources/axonHubMigration.test.ts`
- Modify: `tests/features/ManagedSiteChannels/controllers/useManagedResourceControllers.test.tsx`

- [ ] **Step 1: Add privacy and no-coercion regressions**

Sanitize a completed OpenRouter action containing deliberately forbidden
fixtures:

```ts
const sanitized = sanitizeProductAnalyticsEventPayload(
  PRODUCT_ANALYTICS_EVENTS.FeatureActionCompleted,
  {
    feature_id: PRODUCT_ANALYTICS_FEATURE_IDS.KeyManagement,
    action_id: PRODUCT_ANALYTICS_ACTION_IDS.CreateAccountToken,
    entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    result: PRODUCT_ANALYTICS_RESULTS.Success,
    site_type: SITE_TYPES.OPENROUTER,
    duration_ms: 42,
    account_id: "account-example",
    workspace_id: "workspace-example",
    hash: "hash-example",
    name: "Example key",
    limit: 20,
    upstream_message: "private upstream detail",
  } as never,
)
expect(sanitized).toEqual({
  feature_id: PRODUCT_ANALYTICS_FEATURE_IDS.KeyManagement,
  action_id: PRODUCT_ANALYTICS_ACTION_IDS.CreateAccountToken,
  entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
  result: PRODUCT_ANALYTICS_RESULTS.Success,
  site_type: SITE_TYPES.OPENROUTER,
  duration_ms: 42,
})
```

Assert OpenRouter never appears in `AccountRuntimeKey`, ApiToken repair,
automatic creation, invalid-key deletion, or AxonHub migration inputs. Assert
AIHubMix still skips repair and its fresh create uses the common secret dialog.

- [ ] **Step 2: Add one-time action-result telemetry tests**

Use the dialog's controlled callbacks and the native page/controller wrapper to
prove copy/save success/failure complete exactly one existing action span. The
callback values are only `success`/`failure`; plaintext is not an argument.
Closing/canceling records a controlled result without dialog contents.

- [ ] **Step 3: Run compatibility and privacy suites**

```powershell
pnpm test tests/services/productAnalytics/privacy.test.ts tests/services/productAnalytics/actions.test.ts tests/features/TokenProvisioning/OneTimeSecretDialog.test.tsx tests/services/accounts/accountRuntimeKeys.test.ts tests/services/accountOperations.autoProvisionKeyOnAccountAdd.test.ts tests/services/accountKeyRepair.test.ts tests/features/KeyManagement/components/RepairMissingKeysDialog/index.test.tsx tests/services/apiAdapters/managedResources/axonHubMigration.test.ts tests/features/ManagedSiteChannels/controllers/useManagedResourceControllers.test.tsx
```

Expected: all pass without production analytics-contract changes. If a test
shows a genuinely missing controlled enum, add only that enum plus its privacy
allow-list and fixed-enum test in the same task; never add identity/text fields.

- [ ] **Step 4: Run related tests and compile**

```powershell
pnpm exec vitest related --run src/services/apiAdapters/contracts/resourceNative.ts src/services/apiAdapters/contracts/accountKeyResource.ts src/services/apiAdapters/openrouter/accountKeyResource.ts src/features/KeyManagement/controllers/useAccountKeyResourceController.ts src/features/KeyManagement/KeyManagement.tsx src/features/TokenProvisioning/components/OneTimeSecretDialog.tsx
pnpm compile
```

- [ ] **Step 5: Stage, validate, and commit**

```powershell
git add -- tests/services/productAnalytics/privacy.test.ts tests/services/productAnalytics/actions.test.ts tests/features/TokenProvisioning/OneTimeSecretDialog.test.tsx tests/services/accounts/accountRuntimeKeys.test.ts tests/services/accountOperations.autoProvisionKeyOnAccountAdd.test.ts tests/services/accountKeyRepair.test.ts tests/features/KeyManagement/components/RepairMissingKeysDialog/index.test.tsx tests/services/apiAdapters/managedResources/axonHubMigration.test.ts tests/features/ManagedSiteChannels/controllers/useManagedResourceControllers.test.tsx
git diff --cached --name-status
pnpm run validate:staged
git commit -m "test(openrouter): lock key management boundaries"
```

Do not create an empty commit when every existing compatibility assertion
already proves the requirement. Record the passing commands and continue.

## Task 11: Add Deterministic Extension E2E and Final Gates

**Files:**

- Create: `e2e/utils/mockedSite/openRouterKeyManagementRoutes.ts`
- Create: `e2e/openRouterKeyManagement.spec.ts`
- Modify: `src/features/KeyManagement/testIds.ts`
- Modify: `src/features/TokenProvisioning/testIds.ts`
- Modify: `tests/features/KeyManagement/components/AccountKeyResourceListItem.test.tsx`
- Modify: `tests/features/TokenProvisioning/OneTimeSecretDialog.test.tsx`

- [ ] **Step 1: Build a stateful mocked OpenRouter route helper**

The helper must fail closed on unhandled routes and verify Bearer auth. It owns
in-memory workspaces, members, and keys and handles:

```text
GET    /api/v1/workspaces/default
GET    /api/v1/workspaces?offset&limit
GET    /api/v1/workspaces/{id}/members?offset&limit
GET    /api/v1/keys?include_disabled&offset&workspace_id
POST   /api/v1/keys
GET    /api/v1/keys/{hash}
PATCH  /api/v1/keys/{hash}
DELETE /api/v1/keys/{hash}
```

Return one plaintext fixture only from POST. Record only safe request facts for
assertions; never log or snapshot the Management Key/plaintext.

- [ ] **Step 2: Add one Chromium extension workflow**

Use `extensionTest`, `seedStoredAccounts`, `forceExtensionLanguage`,
`stubLlmMetadataIndex`, `waitForExtensionRoot`, and permission guards. Override
`navigator.clipboard.writeText` with the existing sessionStorage recorder
pattern; do not depend on OS clipboard permission.

The single test must:

1. seed a placeholder OpenRouter account;
2. open `#keys?accountId=account-example&workspace=team`;
3. verify route/workspace restoration after reload;
4. list active and disabled paged keys;
5. create with workspace/member, finite limit, monthly reset, expiry, and BYOK;
6. copy the one-time plaintext and save it to API Credentials;
7. edit name/limit/reset/BYOK and disable the key;
8. filter and still find the disabled row;
9. delete through confirmation; and
10. assert the final remote/UI state.

Use static test IDs for workspace, native row, editor, status filter, submit,
delete, one-time input/copy/save. Never derive a test ID from hash/workspace/
member ID.

- [ ] **Step 3: Run focused E2E and fix only evidenced defects**

```powershell
pnpm exec playwright test e2e/openRouterKeyManagement.spec.ts --project=chromium --workers=1
```

Expected: one passing mocked extension workflow. This is browser/runtime/UI
evidence, not live OpenRouter compatibility.

If the E2E exposes a product defect, stop this task before editing, add a named
correction step with the exact source and focused test files to this plan, then
fix only that evidenced defect and rerun its lower-level test before rerunning
the E2E.

- [ ] **Step 4: Run final unit, i18n, push, and Firefox gates**

```powershell
pnpm exec vitest related --run src/services/apiAdapters/contracts/resourceNative.ts src/services/apiAdapters/contracts/accountKeyResource.ts src/services/apiService/openrouter/keyManagement.ts src/services/apiAdapters/openrouter/accountKeyResource.ts src/features/ResourceEditor/NativeResourceEditorBody.tsx src/features/KeyManagement/controllers/useAccountKeyResourceController.ts src/features/KeyManagement/KeyManagement.tsx src/features/TokenProvisioning/components/OneTimeSecretDialog.tsx
pnpm run i18n:extract:ci
pnpm run validate:push
pnpm build:firefox
```

Firefox evidence is build compatibility only; there is no Firefox Playwright
project in this repo.

- [ ] **Step 5: Inspect final invariants and diff**

```powershell
rg -n "openrouter" src/services/apiAdapters/openrouter src/features/KeyManagement src/services/accounts/keyProductCapabilities.ts
rg -n "ApiToken|AccountRuntimeKey|TokenProvisioningCapability|managedSites" src/services/apiAdapters/openrouter src/features/KeyManagement/components/AccountKeyResource
rg -n "hash-example|workspace-example|mgmt-example|sk-example-secret" src/locales src/services/productAnalytics
git diff --check
$branchBase = git merge-base origin/main HEAD
git diff --check "$branchBase...HEAD"
git diff --stat "$branchBase...HEAD"
git status --porcelain=v1
```

Confirm:

- no OpenRouter legacy/managed-site registration;
- all official list/create/PATCH fields represented;
- no masked label treated as plaintext;
- no mutation replay;
- create-only secret remains dialog-local;
- AIHubMix shares the common lifecycle without resource migration;
- default-only all-account behavior and validated workspace-slug routing;
- no identity/secret/native object in DOM test IDs, logs, or telemetry;
- settings-search registry unchanged;
- locale shapes synchronized; and
- AxonHub/legacy key behavior retained.

- [ ] **Step 6: Stage E2E artifacts, validate, and commit**

Stage the two E2E files, stable test-ID/test changes, and only evidenced source
corrections. Inspect names before validation:

```powershell
git add -- e2e/utils/mockedSite/openRouterKeyManagementRoutes.ts e2e/openRouterKeyManagement.spec.ts src/features/KeyManagement/testIds.ts src/features/TokenProvisioning/testIds.ts tests/features/KeyManagement/components/AccountKeyResourceListItem.test.tsx tests/features/TokenProvisioning/OneTimeSecretDialog.test.tsx
git diff --cached --name-status
pnpm run validate:staged
git commit -m "test(openrouter): cover native key lifecycle"
```

If E2E required a source correction, add its exact source and focused test to
the staging command, rerun that focused test plus E2E, and use
`fix(openrouter): harden native key workflow` instead. Do not create an empty
commit.

## Handoff Evidence

At completion, report separately:

- focused Vitest evidence per task;
- `i18n:extract:ci`, `validate:staged`, and `validate:push` evidence;
- deterministic Chromium E2E evidence;
- Firefox build evidence;
- optional live evidence only if the user separately supplies credentials and
  explicitly authorizes remote mutations;
- every commit hash; and
- any residual risk, especially untested live upstream drift.

Maintainability decision: reuse the existing capability registry, API
transport, design system, analytics actions, profile storage, and AxonHub
resource behavior. Extract only provider-neutral field/failure/rendering and
one-time-secret primitives. Keep legacy token forms, automation, model list,
managed-site channels, and third-party exporters unchanged because migrating
them would exceed this feature boundary.
