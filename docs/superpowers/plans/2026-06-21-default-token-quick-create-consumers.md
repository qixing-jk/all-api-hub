# Default Token Quick-Create Consumers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove Sub2API-specific quick-create product semantics from Copy Key, Kilo export, and Channel Dialog by routing them through the generic default-token provisioning decision interface.

**Architecture:** Keep backend-specific policy in `SiteAdapter.tokenProvisioning` and keep product orchestration in the existing UI/service consumers. Product code handles generic `ready`, `selection_required`, and `blocked` outcomes, while `ensureAccountApiToken(...)` accepts policy-resolved `defaultTokenData` without dropping future token fields.

**Tech Stack:** TypeScript, React, WXT extension services, existing `apiAdapters`, Testing Library, Vitest, `rg`, `pnpm run validate:staged`, `pnpm run validate:push`.

**Spec:** `docs/superpowers/specs/2026-06-20-default-token-quick-create-consumers-design.md`

---

## File Structure

- Modify `src/services/accounts/accountOperations.ts`
  - Adds generic `defaultTokenData` and `explicitGroup` options to `ensureAccountApiToken(...)`.
  - Keeps `sub2apiGroup` as a temporary compatibility alias.
  - Passes the full policy-resolved token payload into `tokenProvisioning.resolveDefaultTokenCreation(...)`.
- Modify `tests/services/accountOperations.ensureAccountApiToken.test.ts`
  - Adds service tests proving `defaultTokenData` is preserved.
  - Keeps compatibility tests for `sub2apiGroup` and `resolveSub2ApiQuickCreateResolution(...)`.
- Modify `src/features/AccountManagement/components/CopyKeyDialog/hooks/useCopyKeyDialog.ts`
  - Imports `resolveDefaultTokenQuickCreateResolution(...)`.
  - Removes the `account.siteType === "sub2api"` quick-create gate.
  - Renames Sub2API-specific state to default-token quick-create state.
- Modify `src/features/AccountManagement/components/CopyKeyDialog/index.tsx`
  - Renames Add Token dialog bridge variables and handlers to generic quick-create language.
- Modify `tests/features/AccountManagement/components/CopyKeyDialog.test.tsx`
  - Adds a non-Sub2API policy-selection regression test.
  - Ensures the generic resolver path is used by product behavior.
- Modify `tests/features/AccountManagement/components/CopyKeyDialog.sub2api.test.tsx`
  - Preserves current Sub2API single-group, multi-group, no-group, and one-time-key behavior.
- Modify `src/components/KiloCodeExportDialog.tsx`
  - Imports `resolveDefaultTokenQuickCreateResolution(...)`.
  - Renames Sub2API create context to generic default-token create context.
  - Passes `defaultTokenData: resolution.tokenData` into `ensureAccountApiToken(...)`.
- Modify `tests/components/KiloCodeExportDialog.test.tsx`
  - Mocks the generic resolver.
  - Asserts full `tokenData` is passed to shared ensure.
  - Preserves constrained Add Token dialog and blocked-message behavior.
- Modify `src/components/dialogs/ChannelDialog/context/ChannelDialogContext.tsx`
  - Renames `sub2apiTokenDialog` state and methods to `defaultTokenQuickCreateDialog` state and methods.
- Modify `src/components/dialogs/ChannelDialog/components/ChannelDialogContainer.tsx`
  - Uses the generic quick-create dialog state to render `AddTokenDialog`.
- Modify `src/components/dialogs/ChannelDialog/hooks/useChannelDialog.ts`
  - Imports `resolveDefaultTokenQuickCreateResolution(...)`.
  - Replaces no-token Sub2API quick-create branching with generic decision handling.
  - Passes `defaultTokenData` into `ensureAccountApiToken(...)`.
  - Renames the exported helper `openSub2ApiTokenCreationDialog` to `openDefaultTokenQuickCreateDialogForAccount`.
- Modify `tests/components/UseChannelDialog.duplicateChannelWarning.test.tsx`
  - Mocks the generic resolver.
  - Updates context state/method names.
  - Preserves deferred dialog recovery and fail-closed behavior.
- Modify `tests/entrypoints/options/pages/KeyManagement/AddTokenDialog.prefill.test.tsx`
  - Only if generic dialog prefill shape changes during implementation.
- Modify `tests/entrypoints/options/pages/KeyManagement/useTokenData.test.tsx`
  - Only if generic dialog prefill shape changes during implementation.

Do not modify:

- `src/services/apiService/**`
  - Backend token CRUD remains delegated behind `keyManagement`.
- `src/services/apiAdapters/**`
  - The token provisioning policy seam already exists; this slice consumes it.
- `src/locales/**`
  - Existing Sub2API-named message keys remain the current copy contract.
- Account Dialog policy behavior in `src/features/AccountManagement/components/AccountDialog/sitePolicy.ts`
  - Mechanical imports or shared helper renames are allowed only if compile requires them.
- Repair Missing Keys, Model Key dialog, Verify API, Verify CLI, managed-site providers, telemetry schemas, settings search, or Playwright E2E.

Telemetry decision: reuse existing.

Settings search decision: none.

E2E decision: no new Playwright E2E. The behavioral risk is service/component routing and state recovery, which focused Vitest and Testing Library tests cover directly.

---

### Task 1: Teach Shared Ensure About Generic Policy Token Data

**Files:**
- Modify: `src/services/accounts/accountOperations.ts`
- Modify: `tests/services/accountOperations.ensureAccountApiToken.test.ts`

- [ ] **Step 1: Add a failing service test for `defaultTokenData`**

In `tests/services/accountOperations.ensureAccountApiToken.test.ts`, add this test in the `ensureAccountApiToken` coverage near the existing grouped-create tests:

```ts
it("passes policy-resolved default token data to shared ensure", async () => {
  const token = buildSub2ApiToken({ id: 42, key: "sk-created" })
  const policyTokenData = {
    ...generateDefaultTokenRequest(),
    name: "Policy Resolved Default Key",
    group: "vip",
    remain_quota: 12345,
  }

  fetchAccountTokensMock.mockResolvedValueOnce([]).mockResolvedValueOnce([token])
  createApiTokenMock.mockResolvedValueOnce(true)
  resolveDefaultTokenCreationMock.mockImplementationOnce((request) => ({
    kind: DEFAULT_TOKEN_CREATION_DECISION_KINDS.Create,
    tokenData: request.defaultTokenData,
    oneTimeSecret: false,
    recoverCreatedToken: TOKEN_CREATION_SECRET_RECOVERY.InventoryRefetch,
  }))
  classifyCreatedTokenMock.mockReturnValueOnce({
    kind: CREATED_TOKEN_SECRET_DECISION_KINDS.NeedsInventoryRefetch,
  })

  await expect(
    ensureAccountApiToken(ACCOUNT, DISPLAY_ACCOUNT, {
      toastId: "toast-policy-token-data",
      defaultTokenData: policyTokenData,
    }),
  ).resolves.toEqual(token)

  expect(resolveDefaultTokenCreationMock).toHaveBeenCalledWith(
    expect.objectContaining({
      workflow: TOKEN_PROVISIONING_WORKFLOWS.SharedEnsure,
      defaultTokenData: policyTokenData,
    }),
  )
  expect(createApiTokenMock).toHaveBeenCalledWith(
    expect.any(Object),
    policyTokenData,
  )
})
```

- [ ] **Step 2: Add an explicit `explicitGroup` compatibility test**

In the same test file, add this test next to the existing `sub2apiGroup` test:

```ts
it("keeps explicitGroup as the generic group-selection alias", async () => {
  const token = buildSub2ApiToken({ id: 12, key: "sk-vip" })

  fetchAccountTokensMock.mockResolvedValueOnce([]).mockResolvedValueOnce([token])
  createApiTokenMock.mockResolvedValueOnce(true)
  resolveDefaultTokenCreationMock.mockImplementationOnce((request) => ({
    kind: DEFAULT_TOKEN_CREATION_DECISION_KINDS.Create,
    tokenData: { ...request.defaultTokenData, group: request.explicitGroup },
    oneTimeSecret: false,
    recoverCreatedToken: TOKEN_CREATION_SECRET_RECOVERY.InventoryRefetch,
  }))
  classifyCreatedTokenMock.mockReturnValueOnce({
    kind: CREATED_TOKEN_SECRET_DECISION_KINDS.NeedsInventoryRefetch,
  })

  await expect(
    ensureAccountApiToken(ACCOUNT, DISPLAY_ACCOUNT, {
      toastId: "toast-explicit-group",
      explicitGroup: "vip",
    }),
  ).resolves.toEqual(token)

  expect(resolveDefaultTokenCreationMock).toHaveBeenCalledWith(
    expect.objectContaining({
      workflow: TOKEN_PROVISIONING_WORKFLOWS.SharedEnsure,
      explicitGroup: "vip",
    }),
  )
  expect(createApiTokenMock).toHaveBeenCalledWith(
    expect.any(Object),
    expect.objectContaining({ group: "vip" }),
  )
})
```

- [ ] **Step 3: Run the focused service test and verify it fails**

Run:

```powershell
pnpm vitest run tests/services/accountOperations.ensureAccountApiToken.test.ts
```

Expected: FAIL because `ensureAccountApiToken(...)` does not accept or forward `defaultTokenData` / `explicitGroup` yet.

- [ ] **Step 4: Add the shared ensure option type**

In `src/services/accounts/accountOperations.ts`, place this type near `DefaultTokenQuickCreateResolution`:

```ts
type EnsureAccountApiTokenOptions = {
  toastId?: string
  defaultTokenData?: CreateTokenRequest
  explicitGroup?: string
  /**
   * Temporary compatibility alias for older Sub2API callers.
   * New product code should pass `defaultTokenData` from policy resolution.
   */
  sub2apiGroup?: string
}
```

- [ ] **Step 5: Update the `ensureAccountApiToken(...)` signature and policy request**

Replace the `toastIdOrOptions` parameter type:

```ts
toastIdOrOptions?: string | EnsureAccountApiTokenOptions,
```

Then replace the no-token decision request with:

```ts
const defaultTokenData =
  options.defaultTokenData ?? generateDefaultTokenRequest()
const explicitGroup = options.explicitGroup ?? options.sub2apiGroup

const decision = requiredTokenProvisioning.resolveDefaultTokenCreation({
  workflow: TOKEN_PROVISIONING_WORKFLOWS.SharedEnsure,
  defaultTokenData,
  explicitGroup,
})
```

Do not remove `sub2apiGroup` in this task. It is a compatibility alias until cleanup searches prove no old caller remains.

- [ ] **Step 6: Run the focused service test and verify it passes**

Run:

```powershell
pnpm vitest run tests/services/accountOperations.ensureAccountApiToken.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit the service API change**

Run:

```powershell
git add src/services/accounts/accountOperations.ts tests/services/accountOperations.ensureAccountApiToken.test.ts
git commit -m "refactor(accounts): accept generic default token data"
```

---

### Task 2: Migrate Copy Key Dialog To Generic Quick-Create Decisions

**Files:**
- Modify: `src/features/AccountManagement/components/CopyKeyDialog/hooks/useCopyKeyDialog.ts`
- Modify: `src/features/AccountManagement/components/CopyKeyDialog/index.tsx`
- Modify: `tests/features/AccountManagement/components/CopyKeyDialog.test.tsx`
- Modify: `tests/features/AccountManagement/components/CopyKeyDialog.sub2api.test.tsx`

- [ ] **Step 1: Add a failing generic-selection product test**

In `tests/features/AccountManagement/components/CopyKeyDialog.test.tsx`, import the module namespace:

```ts
import * as accountOperations from "~/services/accounts/accountOperations"
```

Add this spy near the other test-level spies:

```ts
const resolveDefaultTokenQuickCreateResolutionSpy = vi.spyOn(
  accountOperations,
  "resolveDefaultTokenQuickCreateResolution",
)
```

Reset it in `beforeEach`:

```ts
resolveDefaultTokenQuickCreateResolutionSpy.mockReset()
```

Then add this test near the current default-key creation tests:

```ts
it("opens a generic constrained Add Token dialog when default token policy requires selection", async () => {
  fetchAccountTokensMock.mockResolvedValueOnce([])
  resolveDefaultTokenQuickCreateResolutionSpy.mockResolvedValueOnce({
    kind: "selection_required",
    allowedGroups: ["default", "vip"],
  })

  const user = userEvent.setup()

  render(
    <CopyKeyDialog
      isOpen={true}
      onClose={() => {}}
      account={{
        ...ACCOUNT,
        siteType: SITE_TYPES.NEW_API,
      }}
    />,
  )

  await user.click(
    await screen.findByRole("button", {
      name: "ui:dialog.copyKey.createKey",
    }),
  )

  await screen.findByText("messages:sub2api.createRequiresGroupSelection")
  expect(resolveDefaultTokenQuickCreateResolutionSpy).toHaveBeenCalledWith(
    expect.objectContaining({ siteType: SITE_TYPES.NEW_API }),
  )
  expect(createApiTokenMock).not.toHaveBeenCalled()
})
```

This test deliberately uses a non-Sub2API account. It fails until product code asks the generic resolver instead of checking the site type first.

- [ ] **Step 2: Add a failing full-token-data test for Copy Key**

In the same file, add:

```ts
it("creates a default key with the full policy-resolved token payload", async () => {
  const policyTokenData = {
    name: "Policy Resolved Copy Key",
    remain_quota: 777,
    expired_time: -1,
    unlimited_quota: false,
    model_limits_enabled: false,
    model_limits: "",
    allow_ips: "",
    group: "vip",
  }

  fetchAccountTokensMock.mockResolvedValueOnce([]).mockResolvedValueOnce([TOKEN])
  resolveDefaultTokenQuickCreateResolutionSpy.mockResolvedValueOnce({
    kind: "ready",
    tokenData: policyTokenData,
  })
  createApiTokenMock.mockResolvedValueOnce(true)

  const user = userEvent.setup()

  render(<CopyKeyDialog isOpen={true} onClose={() => {}} account={ACCOUNT} />)

  await user.click(
    await screen.findByRole("button", {
      name: "ui:dialog.copyKey.createKey",
    }),
  )

  await waitFor(() => {
    expect(createApiTokenMock).toHaveBeenCalledWith(
      expect.any(Object),
      policyTokenData,
    )
  })
})
```

- [ ] **Step 3: Run Copy Key tests and verify the new tests fail**

Run:

```powershell
pnpm vitest run tests/features/AccountManagement/components/CopyKeyDialog.test.tsx tests/features/AccountManagement/components/CopyKeyDialog.sub2api.test.tsx
```

Expected: FAIL because the hook still imports `resolveSub2ApiQuickCreateResolution(...)`, keeps Sub2API state names, and only resolves policy inside the Sub2API site-type branch.

- [ ] **Step 4: Replace the Sub2API wrapper import in the hook**

In `src/features/AccountManagement/components/CopyKeyDialog/hooks/useCopyKeyDialog.ts`, replace:

```ts
import { resolveSub2ApiQuickCreateResolution } from "~/services/accounts/accountOperations"
```

with:

```ts
import { resolveDefaultTokenQuickCreateResolution } from "~/services/accounts/accountOperations"
```

- [ ] **Step 5: Rename hook state and clear helper**

In `useCopyKeyDialog.ts`, replace the state:

```ts
const [sub2apiCreateAllowedGroups, setSub2apiCreateAllowedGroups] = useState<
  string[] | null
>(null)
```

with:

```ts
const [
  defaultTokenCreateAllowedGroups,
  setDefaultTokenCreateAllowedGroups,
] = useState<string[] | null>(null)
```

Replace `clearSub2ApiCreateAllowedGroups`:

```ts
const clearDefaultTokenCreateAllowedGroups = useCallback(() => {
  setDefaultTokenCreateAllowedGroups(null)
}, [])
```

Update all hook references:

```text
clearSub2ApiCreateAllowedGroups -> clearDefaultTokenCreateAllowedGroups
sub2apiCreateAllowedGroups -> defaultTokenCreateAllowedGroups
setSub2apiCreateAllowedGroups -> setDefaultTokenCreateAllowedGroups
```

- [ ] **Step 6: Replace Copy Key default create decision logic**

In `createDefaultKey`, replace the Sub2API-only block:

```ts
const tokenRequest = generateDefaultTokenRequest()
if (account.siteType === "sub2api") {
  const resolution = await resolveSub2ApiQuickCreateResolution(account)
  if (resolution.kind === "blocked") {
    setCreateError(resolution.message)
    return
  }

  if (resolution.kind === "selection_required") {
    setSub2apiCreateAllowedGroups(resolution.allowedGroups)
    return
  }

  tokenRequest.group = resolution.group
}
```

with:

```ts
const resolution = await resolveDefaultTokenQuickCreateResolution(account)
if (resolution.kind === "blocked") {
  setCreateError(resolution.message)
  return
}

if (resolution.kind === "selection_required") {
  setDefaultTokenCreateAllowedGroups(resolution.allowedGroups)
  return
}

const tokenRequest = resolution.tokenData
```

Keep the existing `createToken(...)`, `refreshTokensAfterCreate(...)`, catch, and finally behavior unchanged.

- [ ] **Step 7: Return generic hook fields**

Update the hook return object:

```ts
defaultTokenCreateAllowedGroups,
clearDefaultTokenCreateAllowedGroups,
```

Remove the old returned names:

```ts
sub2apiCreateAllowedGroups,
clearSub2ApiCreateAllowedGroups,
```

- [ ] **Step 8: Rename Copy Key component bridge variables**

In `src/features/AccountManagement/components/CopyKeyDialog/index.tsx`, update the hook destructuring:

```ts
defaultTokenCreateAllowedGroups,
clearDefaultTokenCreateAllowedGroups,
```

Then update the handlers:

```ts
const handleOpenAddTokenDialog = () => {
  clearDefaultTokenCreateAllowedGroups()
  setIsAddTokenDialogOpen(true)
}
const handleCloseAddTokenDialog = () => {
  clearDefaultTokenCreateAllowedGroups()
  setIsAddTokenDialogOpen(false)
}
const handleAddTokenSuccess = (createdToken?: ApiToken) => {
  clearDefaultTokenCreateAllowedGroups()
  return refreshTokensAfterCreate(createdToken)
}
```

Update the close effect dependency and body:

```ts
if (!isOpen || !account) {
  clearDefaultTokenCreateAllowedGroups()
  setIsAddTokenDialogOpen(false)
}
```

Replace `sub2apiQuickCreatePrefill` with:

```ts
const defaultTokenQuickCreatePrefill =
  defaultTokenCreateAllowedGroups &&
  defaultTokenCreateAllowedGroups.length > 0
    ? {
        modelId: "",
        defaultName: DEFAULT_AUTO_PROVISION_TOKEN_NAME,
        allowedGroups: defaultTokenCreateAllowedGroups,
      }
    : undefined
```

Pass `defaultTokenQuickCreatePrefill` to `AddTokenDialog`.

- [ ] **Step 9: Run Copy Key tests and verify they pass**

Run:

```powershell
pnpm vitest run tests/features/AccountManagement/components/CopyKeyDialog.test.tsx tests/features/AccountManagement/components/CopyKeyDialog.sub2api.test.tsx
```

Expected: PASS.

- [ ] **Step 10: Commit the Copy Key migration**

Run:

```powershell
git add src/features/AccountManagement/components/CopyKeyDialog/hooks/useCopyKeyDialog.ts src/features/AccountManagement/components/CopyKeyDialog/index.tsx tests/features/AccountManagement/components/CopyKeyDialog.test.tsx tests/features/AccountManagement/components/CopyKeyDialog.sub2api.test.tsx
git commit -m "refactor(copy-key): use generic token quick-create policy"
```

---

### Task 3: Migrate Kilo Export To Generic Quick-Create Decisions

**Files:**
- Modify: `src/components/KiloCodeExportDialog.tsx`
- Modify: `tests/components/KiloCodeExportDialog.test.tsx`

- [ ] **Step 1: Update the account operations mock to expose the generic resolver**

In `tests/components/KiloCodeExportDialog.test.tsx`, replace:

```ts
const mockResolveSub2ApiQuickCreateResolution = vi.fn()
```

with:

```ts
const mockResolveDefaultTokenQuickCreateResolution = vi.fn()
```

Replace the module mock:

```ts
vi.mock("~/services/accounts/accountOperations", () => ({
  ensureAccountApiToken: (...args: unknown[]) =>
    mockEnsureAccountApiToken(...args),
  resolveDefaultTokenQuickCreateResolution: (...args: unknown[]) =>
    mockResolveDefaultTokenQuickCreateResolution(...args),
}))
```

Update `beforeEach` to reset the generic mock.

- [ ] **Step 2: Add a failing test for full token payload propagation**

Update the existing ready-state Sub2API Kilo test to use:

```ts
const policyTokenData = {
  name: DEFAULT_AUTO_PROVISION_TOKEN_NAME,
  remain_quota: 45678,
  expired_time: -1,
  unlimited_quota: false,
  model_limits_enabled: false,
  model_limits: "",
  allow_ips: "",
  group: "vip",
}

mockResolveDefaultTokenQuickCreateResolution.mockResolvedValueOnce({
  kind: "ready",
  tokenData: policyTokenData,
})
```

Then assert:

```ts
expect(mockResolveDefaultTokenQuickCreateResolution).toHaveBeenCalledWith(
  expect.objectContaining({ id: "b", siteType: "sub2api" }),
)
expect(mockEnsureAccountApiToken).toHaveBeenCalledWith(
  expect.objectContaining({ id: "b", site_type: "sub2api" }),
  expect.objectContaining({ id: "b", siteType: "sub2api" }),
  expect.objectContaining({
    toastId: "kilocode-create-token-b",
    defaultTokenData: policyTokenData,
  }),
)
```

Remove assertions that expect `sub2apiGroup`.

- [ ] **Step 3: Update Kilo selection and blocked tests to mock the generic resolver**

Replace all test setup calls:

```ts
mockResolveSub2ApiQuickCreateResolution.mockResolvedValueOnce(...)
```

with:

```ts
mockResolveDefaultTokenQuickCreateResolution.mockResolvedValueOnce(...)
```

For selection-required tests, keep the existing expected Add Token dialog prefill:

```ts
expect(addTokenDialogPropsMock).toHaveBeenLastCalledWith(
  expect.objectContaining({
    isOpen: true,
    createPrefill: expect.objectContaining({
      defaultName: DEFAULT_AUTO_PROVISION_TOKEN_NAME,
      allowedGroups: ["default", "vip"],
    }),
  }),
)
```

- [ ] **Step 4: Run Kilo tests and verify they fail**

Run:

```powershell
pnpm vitest run tests/components/KiloCodeExportDialog.test.tsx
```

Expected: FAIL because production still imports the Sub2API wrapper and passes `sub2apiGroup`.

- [ ] **Step 5: Replace the Kilo resolver import**

In `src/components/KiloCodeExportDialog.tsx`, replace:

```ts
resolveSub2ApiQuickCreateResolution,
```

with:

```ts
resolveDefaultTokenQuickCreateResolution,
```

- [ ] **Step 6: Rename Kilo create context**

Add this type near the component-local state types:

```ts
type DefaultTokenCreateContext = {
  siteId: string
  allowedGroups: string[]
}
```

Replace:

```ts
const [sub2apiCreateContext, setSub2apiCreateContext] = useState<{
  siteId: string
  allowedGroups: string[]
} | null>(null)
```

with:

```ts
const [defaultTokenCreateContext, setDefaultTokenCreateContext] =
  useState<DefaultTokenCreateContext | null>(null)
```

- [ ] **Step 7: Replace Kilo no-token creation logic**

In `createDefaultTokenForSite`, replace the Sub2API-specific conditional branch inside the `try` block. The replacement starts where the current code declares `let ensuredToken: ApiToken`, covers both the Sub2API wrapper path and the non-Sub2API `ensureAccountApiToken(account, site, toastId)` path, and ends before the existing success toast.

Use this replacement:

```ts
const resolution = await resolveDefaultTokenQuickCreateResolution(site)
if (resolution.kind === "blocked") {
  const userMessage = resolution.message?.trim()
    ? resolution.message
    : "Token creation was blocked. Please check site policy or try again."

  toast.error(userMessage, { id: toastId })
  setTokenInventories((prev) => ({
    ...prev,
    [siteId]: {
      status: "error",
      tokens: prev[siteId]?.tokens ?? [],
      errorMessage: userMessage,
    },
  }))
  return
}

if (resolution.kind === "selection_required") {
  setDefaultTokenCreateContext({
    siteId,
    allowedGroups: resolution.allowedGroups,
  })
  setTokenInventories((prev) => ({
    ...prev,
    [siteId]: {
      status: "loaded",
      tokens: prev[siteId]?.tokens ?? [],
      errorMessage: undefined,
    },
  }))
  return
}

const ensuredToken = await ensureAccountApiToken(account, site, {
  toastId,
  defaultTokenData: resolution.tokenData,
})
```

Keep the existing success toast, `loadTokensForSite(siteId, { preferNewest: true })`, selected-token update, catch, and finally behavior.

- [ ] **Step 8: Rename Kilo Add Token dialog helpers**

Replace:

```ts
handleCloseSub2ApiCreateDialog
handleSub2ApiCreateSuccess
sub2apiQuickCreateSite
sub2apiQuickCreatePrefill
sub2apiCreateContext
```

with:

```ts
handleCloseDefaultTokenCreateDialog
handleDefaultTokenCreateSuccess
defaultTokenQuickCreateSite
defaultTokenQuickCreatePrefill
defaultTokenCreateContext
```

The prefill builder should be:

```ts
const defaultTokenQuickCreatePrefill =
  defaultTokenCreateContext &&
  defaultTokenCreateContext.allowedGroups.length > 0
    ? {
        modelId: "",
        defaultName: DEFAULT_AUTO_PROVISION_TOKEN_NAME,
        allowedGroups: defaultTokenCreateContext.allowedGroups,
      }
    : undefined
```

Use these generic names in the rendered `AddTokenDialog`.

- [ ] **Step 9: Run Kilo tests and verify they pass**

Run:

```powershell
pnpm vitest run tests/components/KiloCodeExportDialog.test.tsx
```

Expected: PASS.

- [ ] **Step 10: Commit the Kilo migration**

Run:

```powershell
git add src/components/KiloCodeExportDialog.tsx tests/components/KiloCodeExportDialog.test.tsx
git commit -m "refactor(kilo): use generic token quick-create policy"
```

---

### Task 4: Rename Channel Dialog Quick-Create State To Generic Product Semantics

**Files:**
- Modify: `src/components/dialogs/ChannelDialog/context/ChannelDialogContext.tsx`
- Modify: `src/components/dialogs/ChannelDialog/components/ChannelDialogContainer.tsx`
- Modify: `tests/components/UseChannelDialog.duplicateChannelWarning.test.tsx`

- [ ] **Step 1: Update Channel Dialog context tests to generic names**

In `tests/components/UseChannelDialog.duplicateChannelWarning.test.tsx`, replace assertions and calls:

```text
sub2apiTokenDialog -> defaultTokenQuickCreateDialog
openSub2ApiTokenDialog -> openDefaultTokenQuickCreateDialog
closeSub2ApiTokenDialog -> closeDefaultTokenQuickCreateDialog
handleSub2ApiTokenSuccess -> handleDefaultTokenQuickCreateSuccess
```

For example, replace:

```ts
expect(result.current.context.sub2apiTokenDialog).toMatchObject({
  isOpen: true,
  allowedGroups: ["default", "vip"],
})
```

with:

```ts
expect(result.current.context.defaultTokenQuickCreateDialog).toMatchObject({
  isOpen: true,
  allowedGroups: ["default", "vip"],
})
```

Replace direct helper calls:

```ts
result.current.context.openSub2ApiTokenDialog({
  account,
  allowedGroups: ["default"],
})
await result.current.context.handleSub2ApiTokenSuccess(createdToken)
```

with:

```ts
result.current.context.openDefaultTokenQuickCreateDialog({
  account,
  allowedGroups: ["default"],
})
await result.current.context.handleDefaultTokenQuickCreateSuccess(createdToken)
```

- [ ] **Step 2: Run Channel tests and verify they fail on old context names**

Run:

```powershell
pnpm vitest run tests/components/UseChannelDialog.duplicateChannelWarning.test.tsx
```

Expected: FAIL because the context still exports Sub2API-named state and methods.

- [ ] **Step 3: Rename context types and state**

In `src/components/dialogs/ChannelDialog/context/ChannelDialogContext.tsx`, replace:

```ts
interface Sub2ApiTokenDialogState {
```

with:

```ts
interface DefaultTokenQuickCreateDialogState {
```

Replace context fields:

```ts
sub2apiTokenDialog: Sub2ApiTokenDialogState
openSub2ApiTokenDialog: (config: {
  account: DisplaySiteData
  allowedGroups: string[]
  notice?: string
  onSuccess?: (createdToken?: ApiToken) => void | Promise<void>
}) => void
closeSub2ApiTokenDialog: () => void
handleSub2ApiTokenSuccess: (createdToken?: ApiToken) => Promise<void>
```

with:

```ts
defaultTokenQuickCreateDialog: DefaultTokenQuickCreateDialogState
openDefaultTokenQuickCreateDialog: (config: {
  account: DisplaySiteData
  allowedGroups: string[]
  notice?: string
  onSuccess?: (createdToken?: ApiToken) => void | Promise<void>
}) => void
closeDefaultTokenQuickCreateDialog: () => void
handleDefaultTokenQuickCreateSuccess: (
  createdToken?: ApiToken,
) => Promise<void>
```

- [ ] **Step 4: Rename provider implementation variables**

Replace state and refs:

```text
sub2apiTokenDialog -> defaultTokenQuickCreateDialog
setSub2apiTokenDialog -> setDefaultTokenQuickCreateDialog
sub2apiTokenDialogSessionIdRef -> defaultTokenQuickCreateDialogSessionIdRef
sub2apiTokenOnSuccessRef -> defaultTokenQuickCreateOnSuccessRef
```

Rename callbacks:

```text
openSub2ApiTokenDialog -> openDefaultTokenQuickCreateDialog
closeSub2ApiTokenDialog -> closeDefaultTokenQuickCreateDialog
handleSub2ApiTokenSuccess -> handleDefaultTokenQuickCreateSuccess
```

The renamed success callback should preserve the existing stale-session guard:

```ts
const handleDefaultTokenQuickCreateSuccess = useCallback(
  async (createdToken?: ApiToken) => {
    const sessionIdAtInvocation = defaultTokenQuickCreateDialog.sessionId
    if (!defaultTokenQuickCreateDialog.isOpen) {
      return
    }

    if (
      defaultTokenQuickCreateDialogSessionIdRef.current !==
      sessionIdAtInvocation
    ) {
      return
    }

    const callback = defaultTokenQuickCreateOnSuccessRef.current
    closeDefaultTokenQuickCreateDialog()
    await callback?.(createdToken)
  },
  [
    closeDefaultTokenQuickCreateDialog,
    defaultTokenQuickCreateDialog.isOpen,
    defaultTokenQuickCreateDialog.sessionId,
  ],
)
```

- [ ] **Step 5: Rename container bridge variables**

In `src/components/dialogs/ChannelDialog/components/ChannelDialogContainer.tsx`, destructure:

```ts
defaultTokenQuickCreateDialog,
closeDefaultTokenQuickCreateDialog,
handleDefaultTokenQuickCreateSuccess,
```

Build the prefill with:

```ts
const defaultTokenQuickCreatePrefill =
  defaultTokenQuickCreateDialog.account &&
  defaultTokenQuickCreateDialog.allowedGroups.length > 0
    ? {
        modelId: "",
        defaultName: DEFAULT_AUTO_PROVISION_TOKEN_NAME,
        group: defaultTokenQuickCreateDialog.allowedGroups.includes("default")
          ? "default"
          : defaultTokenQuickCreateDialog.allowedGroups[0] ?? "default",
        allowedGroups: defaultTokenQuickCreateDialog.allowedGroups,
      }
    : undefined
```

Render `AddTokenDialog` from `defaultTokenQuickCreateDialog` and call the renamed close/success handlers.

- [ ] **Step 6: Update hook imports/destructuring for renamed context API**

In `src/components/dialogs/ChannelDialog/hooks/useChannelDialog.ts`, replace:

```ts
const { openDialog, openSub2ApiTokenDialog, requestDuplicateChannelWarning } =
  useChannelDialogContext()
```

with:

```ts
const {
  openDialog,
  openDefaultTokenQuickCreateDialog,
  requestDuplicateChannelWarning,
} = useChannelDialogContext()
```

Replace all calls to `openSub2ApiTokenDialog` with calls to `openDefaultTokenQuickCreateDialog`.

- [ ] **Step 7: Run Channel tests and verify context rename passes**

Run:

```powershell
pnpm vitest run tests/components/UseChannelDialog.duplicateChannelWarning.test.tsx
```

Expected: PASS. If this fails, fix only naming mistakes in this task; do not migrate resolver behavior until Task 5.

- [ ] **Step 8: Commit the Channel context rename**

Run:

```powershell
git add src/components/dialogs/ChannelDialog/context/ChannelDialogContext.tsx src/components/dialogs/ChannelDialog/components/ChannelDialogContainer.tsx src/components/dialogs/ChannelDialog/hooks/useChannelDialog.ts tests/components/UseChannelDialog.duplicateChannelWarning.test.tsx
git commit -m "refactor(channel): generalize quick-create dialog state"
```

---

### Task 5: Migrate Channel Dialog No-Token Flow To Generic Decisions

**Files:**
- Modify: `src/components/dialogs/ChannelDialog/hooks/useChannelDialog.ts`
- Modify: `tests/components/UseChannelDialog.duplicateChannelWarning.test.tsx`

- [ ] **Step 1: Change Channel tests to spy on the generic resolver**

In `tests/components/UseChannelDialog.duplicateChannelWarning.test.tsx`, replace:

```ts
const resolveSub2ApiQuickCreateResolutionSpy = vi.spyOn(
  accountOperations,
  "resolveSub2ApiQuickCreateResolution",
)
```

with:

```ts
const resolveDefaultTokenQuickCreateResolutionSpy = vi.spyOn(
  accountOperations,
  "resolveDefaultTokenQuickCreateResolution",
)
```

Replace all reset/setup/assertion references to the new spy name.

- [ ] **Step 2: Update no-token selection-required assertions**

Where tests currently mock:

```ts
resolveSub2ApiQuickCreateResolutionSpy.mockResolvedValueOnce({
  kind: "selection_required",
  allowedGroups: ["default", "vip"],
})
```

replace with:

```ts
resolveDefaultTokenQuickCreateResolutionSpy.mockResolvedValueOnce({
  kind: "selection_required",
  allowedGroups: ["default", "vip"],
})
```

Keep assertions that the generic dialog state opens:

```ts
expect(result.current.context.defaultTokenQuickCreateDialog).toMatchObject({
  isOpen: true,
  allowedGroups: ["default", "vip"],
  notice: "messages:sub2api.createRequiresGroupSelection",
})
expect(ensureAccountApiTokenSpy).not.toHaveBeenCalled()
```

- [ ] **Step 3: Add a failing ready-state payload propagation test**

Add this test near the current no-token ensure tests:

```ts
it("ensures a token with full generic quick-create token data", async () => {
  const policyTokenData = {
    name: "Channel Policy Token",
    remain_quota: 65432,
    expired_time: -1,
    unlimited_quota: false,
    model_limits_enabled: false,
    model_limits: "",
    allow_ips: "",
    group: "ops",
  }
  const createdToken = buildApiToken({ id: 30, key: "sk-created" })

  const mockService: Partial<ManagedSiteService> = {
    messagesKey: "newapi",
    getConfig: vi.fn(async () => ({
      baseUrl: "https://managed.example.com",
      adminToken: "admin-token",
      userId: "1",
    })),
    prepareChannelFormData: vi.fn(),
    searchChannel: vi.fn(),
  }
  getManagedSiteServiceSpy.mockResolvedValue(mockService as ManagedSiteService)
  getAccountByIdSpy.mockResolvedValue(buildSiteAccount({ site_type: "new-api" }))
  mockFetchAccountTokens.mockResolvedValueOnce([])
  resolveDefaultTokenQuickCreateResolutionSpy.mockResolvedValueOnce({
    kind: "ready",
    tokenData: policyTokenData,
  })
  ensureAccountApiTokenSpy.mockResolvedValueOnce(createdToken)
  mockResolveApiTokenKey.mockResolvedValueOnce(createdToken)

  const { result } = renderHook(() => ({
    dialog: useChannelDialog(),
    context: useChannelDialogContext(),
  }))

  await act(async () => {
    await result.current.dialog.openWithAccount(
      buildDisplaySiteData({ siteType: "new-api" }),
      null,
    )
  })

  expect(resolveDefaultTokenQuickCreateResolutionSpy).toHaveBeenCalledWith(
    expect.objectContaining({ siteType: "new-api" }),
  )
  expect(ensureAccountApiTokenSpy).toHaveBeenCalledWith(
    expect.objectContaining({ site_type: "new-api" }),
    expect.objectContaining({ siteType: "new-api" }),
    expect.objectContaining({
      toastId: "toast-id",
      defaultTokenData: policyTokenData,
    }),
  )
})
```

- [ ] **Step 4: Rename the exported dialog helper test calls**

Replace direct helper calls that invoke the old Sub2API helper:

```ts
await result.current.dialog.openSub2ApiTokenCreationDialog(
  buildDisplaySiteData({ siteType: "sub2api" }),
)
```

with:

```ts
await result.current.dialog.openDefaultTokenQuickCreateDialogForAccount(
  buildDisplaySiteData({ siteType: "sub2api" }),
)
```

Keep the existing expected behaviors:

- returns `false` when tokens already exist;
- returns `false` and shows the blocked policy message through `toast.error`;
- opens the generic quick-create dialog on `selection_required`;
- opens the dialog with a resolved single group when `ready.tokenData.group` is non-empty;
- preserves caller `onSuccess`.

- [ ] **Step 5: Run Channel tests and verify they fail**

Run:

```powershell
pnpm vitest run tests/components/UseChannelDialog.duplicateChannelWarning.test.tsx
```

Expected: FAIL because production still imports the Sub2API wrapper and uses `sub2apiGroup`.

- [ ] **Step 6: Replace the Channel resolver import**

In `src/components/dialogs/ChannelDialog/hooks/useChannelDialog.ts`, replace:

```ts
import {
  ensureAccountApiToken,
  resolveSub2ApiQuickCreateResolution,
} from "~/services/accounts/accountOperations"
```

with:

```ts
import {
  ensureAccountApiToken,
  resolveDefaultTokenQuickCreateResolution,
} from "~/services/accounts/accountOperations"
```

Remove the `SITE_TYPES` import if it becomes unused.

- [ ] **Step 7: Rename the exported helper and use generic decisions**

Rename:

```ts
openSub2ApiTokenCreationDialog
```

to:

```ts
openDefaultTokenQuickCreateDialogForAccount
```

Replace its resolver block with:

```ts
const resolution = await resolveDefaultTokenQuickCreateResolution(account)
if (resolution.kind === "blocked") {
  toast.error(resolution.message)
  return false
}

if (resolution.kind === "ready") {
  const selectedGroup = resolution.tokenData.group?.trim()
  if (!selectedGroup) {
    return false
  }

  openDefaultTokenQuickCreateDialog({
    account,
    allowedGroups: [selectedGroup],
    notice: options?.notice,
    onSuccess: options?.onSuccess,
  })
  return true
}

openDefaultTokenQuickCreateDialog({
  account,
  allowedGroups: resolution.allowedGroups,
  notice:
    options?.notice ?? t("messages:sub2api.createRequiresGroupSelection"),
  onSuccess: options?.onSuccess,
})

return true
```

This helper still opens a dialog. It should not auto-create a token for ready policies without a group because that would be a different product action.

- [ ] **Step 8: Replace `openWithAccount(...)` no-token branch**

In `openWithAccount(...)`, replace the entire no-token branch that currently checks `displaySiteData.siteType === SITE_TYPES.SUB2API` and calls `resolveSub2ApiQuickCreateResolution(...)`. The replacement starts immediately after the existing inventory fetch assigns `apiToken = existingTokenList.at(-1) ?? null`, stays inside the surrounding `if (!apiToken) { ... }`, and ends before the existing `if (!shouldContinue()) { return cancelOpen() }` check.

Use this replacement:

```ts
const resolution =
  await resolveDefaultTokenQuickCreateResolution(displaySiteData)
if (!shouldContinue()) {
  return cancelOpen()
}

if (resolution.kind === "blocked") {
  toast.error(resolution.message, { id: toastId })
  return { opened: false }
}

if (resolution.kind === "selection_required") {
  if (!shouldContinue()) {
    return cancelOpen()
  }
  toast.dismiss(toastId)
  openDefaultTokenQuickCreateDialog({
    account: displaySiteData,
    allowedGroups: resolution.allowedGroups,
    notice: t("messages:sub2api.createRequiresGroupSelection"),
    onSuccess: async (createdToken?: ApiToken) => {
      if (!shouldContinue()) {
        return
      }

      if (createdToken) {
        await openWithAccount(displaySiteData!, createdToken, onSuccess, options)
        return
      }

      if (!shouldContinue()) {
        return
      }

      const refetchedTokens =
        accountKeyManagement && accountApiRequest
          ? await accountKeyManagement.fetchTokens(accountApiRequest)
          : null
      if (!shouldContinue()) {
        return
      }
      const recoveredToken = Array.isArray(refetchedTokens)
        ? selectSingleNewApiTokenByIdDiff({
            existingTokenIds,
            tokens: refetchedTokens,
          })
        : null

      if (!recoveredToken) {
        toast.error(t("messages:accountOperations.createTokenFailed"))
        return
      }

      await openWithAccount(displaySiteData!, recoveredToken, onSuccess, options)
    },
  })
  return { opened: false, deferred: true }
}

apiToken = await ensureAccountApiToken(siteAccount, displaySiteData, {
  toastId,
  defaultTokenData: resolution.tokenData,
})
```

Keep all `shouldContinue()` checks around async boundaries. Keep duplicate-channel and managed-site behavior outside this block unchanged.

- [ ] **Step 9: Run Channel tests and verify they pass**

Run:

```powershell
pnpm vitest run tests/components/UseChannelDialog.duplicateChannelWarning.test.tsx
```

Expected: PASS.

- [ ] **Step 10: Commit the Channel behavior migration**

Run:

```powershell
git add src/components/dialogs/ChannelDialog/hooks/useChannelDialog.ts tests/components/UseChannelDialog.duplicateChannelWarning.test.tsx
git commit -m "refactor(channel): use generic token quick-create policy"
```

---

### Task 6: Cleanup Searches, Related Tests, And Publish Gate

**Files:**
- Modify only files that cleanup searches prove still contain unexpected quick-create specialization.

- [ ] **Step 1: Run wrapper import cleanup search**

Run:

```powershell
rg "resolveSub2ApiQuickCreateResolution" src tests
```

Expected allowed matches:

```text
src/services/accounts/accountOperations.ts
tests/services/accountOperations.ensureAccountApiToken.test.ts
```

If `CopyKeyDialog`, `KiloCodeExportDialog`, `ChannelDialog`, or their tests still appear, replace those imports/mocks with `resolveDefaultTokenQuickCreateResolution(...)`.

- [ ] **Step 2: Run shared ensure option cleanup search**

Run:

```powershell
rg "sub2apiGroup|explicitGroup|defaultTokenData" src tests
```

Expected:

- `defaultTokenData` appears in generic consumers and service tests.
- `explicitGroup` appears in resolver/service policy paths and compatibility tests.
- `sub2apiGroup` appears only in `src/services/accounts/accountOperations.ts` and compatibility tests, if retained.

If product consumers still pass `sub2apiGroup`, change them to `defaultTokenData: resolution.tokenData`.

- [ ] **Step 3: Run Copy Key and Kilo naming cleanup search**

Run:

```powershell
rg "sub2apiCreateAllowedGroups|sub2apiCreateContext|sub2apiQuickCreate" src tests
```

Expected: no matches.

If matches remain in Copy Key or Kilo, rename them to the generic names from Tasks 2 and 3.

- [ ] **Step 4: Run Channel dialog naming cleanup search**

Run:

```powershell
rg "sub2apiTokenDialog|openSub2ApiTokenDialog|closeSub2ApiTokenDialog|handleSub2ApiTokenSuccess" src tests
```

Expected: no matches.

If matches remain in Channel Dialog source or tests, rename them to the generic context API from Task 4.

- [ ] **Step 5: Run Sub2API site-type branch audit**

Run:

```powershell
rg "siteType === [\"']sub2api[\"']|siteType === SITE_TYPES.SUB2API" src/features src/components src/services/accounts
```

Expected allowed matches include:

- Account Dialog post-save site policy.
- Repair Missing Keys manual recovery flow.
- Model Key explicit group/model flow.
- Service-level wrapper compatibility in `accountOperations.ts`.

Unexpected matches include Copy Key default create, Kilo no-token create, and Channel Dialog no-token create. Remove unexpected matches by routing through generic quick-create decisions.

- [ ] **Step 6: Run focused tests**

Run:

```powershell
pnpm vitest run tests/services/accountOperations.ensureAccountApiToken.test.ts tests/features/AccountManagement/components/CopyKeyDialog.test.tsx tests/features/AccountManagement/components/CopyKeyDialog.sub2api.test.tsx tests/components/KiloCodeExportDialog.test.tsx tests/components/UseChannelDialog.duplicateChannelWarning.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Run Add Token bridge tests if the prefill contract changed**

Run this if `AddTokenDialog` props, prefill shape, or `useTokenData` behavior changed:

```powershell
pnpm vitest run tests/entrypoints/options/pages/KeyManagement/AddTokenDialog.prefill.test.tsx tests/entrypoints/options/pages/KeyManagement/useTokenData.test.tsx
```

Expected: PASS.

If no Add Token files changed and the `createPrefill` shape remains `{ modelId, defaultName, group?, allowedGroups }`, record this as not run because the bridge contract was unchanged.

- [ ] **Step 8: Run related validation**

Run:

```powershell
pnpm vitest related --run src/services/accounts/accountOperations.ts src/features/AccountManagement/components/CopyKeyDialog/hooks/useCopyKeyDialog.ts src/features/AccountManagement/components/CopyKeyDialog/index.tsx src/components/KiloCodeExportDialog.tsx src/components/dialogs/ChannelDialog/hooks/useChannelDialog.ts src/components/dialogs/ChannelDialog/context/ChannelDialogContext.tsx src/components/dialogs/ChannelDialog/components/ChannelDialogContainer.tsx
```

Expected: PASS.

- [ ] **Step 9: Run the commit gate**

Run:

```powershell
pnpm run validate:staged
```

Expected: PASS.

- [ ] **Step 10: Run the push gate**

Run:

```powershell
pnpm run validate:push
```

Expected: PASS.

This push gate is required before PR or remote handoff because the implementation changes shared account operations, cross-feature dialog wiring, and TypeScript service contracts.

- [ ] **Step 11: Commit cleanup fixes if any were needed**

If cleanup searches required final edits, run:

```powershell
git add src tests
git commit -m "refactor(accounts): remove specialized quick-create consumers"
```

If no final edits were needed after the prior task commits, do not create an empty commit.

---

## Final Verification Checklist

- [ ] Copy Key imports `resolveDefaultTokenQuickCreateResolution(...)`.
- [ ] Copy Key has no `account.siteType === "sub2api"` quick-create gate.
- [ ] Copy Key stores `defaultTokenCreateAllowedGroups`, not `sub2apiCreateAllowedGroups`.
- [ ] Kilo imports `resolveDefaultTokenQuickCreateResolution(...)`.
- [ ] Kilo passes `defaultTokenData: resolution.tokenData` to `ensureAccountApiToken(...)`.
- [ ] Kilo stores `defaultTokenCreateContext`, not `sub2apiCreateContext`.
- [ ] Channel Dialog context exposes `defaultTokenQuickCreateDialog`.
- [ ] Channel Dialog hook uses generic quick-create decisions for no-token account import.
- [ ] Channel Dialog passes `defaultTokenData: resolution.tokenData` to `ensureAccountApiToken(...)`.
- [ ] No product consumer imports `resolveSub2ApiQuickCreateResolution(...)`.
- [ ] `sub2apiGroup` remains only as a documented compatibility alias and test coverage, if retained.
- [ ] Account Dialog post-save site policy remains semantically unchanged.
- [ ] Repair, Model Key, Verify API, Verify CLI, and managed-site providers remain outside this slice.
- [ ] Focused Vitest tests pass.
- [ ] Related Vitest validation passes.
- [ ] `pnpm run validate:staged` passes.
- [ ] `pnpm run validate:push` passes before PR or remote handoff.
