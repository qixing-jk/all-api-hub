# Shared Key Resource Card Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give AIHubMix and future provider-native key inventories one consistent, capability-driven card presentation while preserving every safe provider-native field and action.

**Architecture:** Add an adapter-owned stored-secret availability contract, project legacy account tokens into a provider-neutral presentation model, and render that model with shared card primitives. The shared card owns visual hierarchy and detail states; adapters and presenters own facts and action eligibility. AIHubMix becomes the first legacy-token consumer, while the later OpenRouter PR consumes the same primitives for native resources without moving OpenRouter API, editor, or mutation logic into this branch.

**Tech Stack:** TypeScript, React, Vitest, Testing Library, i18next, Tailwind CSS, WXT

---

## Worktree and baseline

- Worktree: `G:\Development_Data\WorkSpaces\ensoai\all-api-hub\key-resource-card-ui`
- Branch: `feat/key-resource-card-presentation`
- Base: `main` at `2511c10f7`
- Design spec: `docs/superpowers/specs/2026-08-03-key-resource-card-presentation-design.md`
- Design commit in this worktree: `8022a93fe`
- Baseline validation: seven Key Management test files, 52 tests passing.
- Delivery order: merge this shared-UI PR first; rebase the OpenRouter native key-management branch onto it; then replace the OpenRouter-specific card with these shared primitives.

## Scope boundaries

This plan owns:

- the stored-secret availability declaration on account key-management adapters;
- provider-neutral key-card types and reusable rendering primitives;
- the legacy `ApiToken` presentation projection;
- the AIHubMix stored-key action reduction;
- batch-selection eligibility derived from the same capability policy;
- synchronized app localization for newly visible labels.

This plan does not own:

- OpenRouter API calls, resource controllers, editors, CRUD, detail fetches, or mutation-result handling;
- a provider-neutral create-response secret dialog, which remains in the OpenRouter plan because `main` has no shared implementation to migrate yet;
- changes to `keyProductCapabilities.ts`, whose broader `resolveSecret` contract is consumed outside Key Management;
- redesigns of create-key forms or changes to provider protocols.

## Target file map

Create:

- `src/features/KeyManagement/presentation/keyResourceCard.ts`
- `src/features/KeyManagement/presentation/legacyKeyResourceCard.ts`
- `src/features/KeyManagement/components/KeyResourceCard.tsx`
- `tests/features/KeyManagement/presentation/legacyKeyResourceCard.test.ts`
- `tests/features/KeyManagement/components/KeyResourceCard.test.tsx`
- `tests/services/apiAdapters/keyManagement.secretAvailability.test.ts`

Modify:

- `src/services/apiAdapters/contracts/keyManagement.ts`
- `src/services/apiAdapters/aihubmix/keyManagement.ts`
- `src/features/KeyManagement/components/TokenListItem/index.tsx`
- `src/features/KeyManagement/components/TokenListItem/TokenHeader.tsx`
- `src/features/KeyManagement/components/TokenList.tsx`
- `tests/features/KeyManagement/components/TokenListItem.test.tsx`
- `tests/features/KeyManagement/components/TokenHeader.analytics.test.tsx`
- `tests/entrypoints/options/pages/KeyManagement/TokenList.batchExport.test.tsx`
- `src/locales/en/keyManagement.json`
- `src/locales/zh-CN/keyManagement.json`
- `src/locales/zh-TW/keyManagement.json`
- `src/locales/ja/keyManagement.json`
- `src/locales/vi/keyManagement.json`
- `src/locales/es-419/keyManagement.json`
- `src/locales/pt-BR/keyManagement.json`

## Task 1: Declare stored-secret availability at the adapter boundary

**Files:**

- Create: `tests/services/apiAdapters/keyManagement.secretAvailability.test.ts`
- Modify: `src/services/apiAdapters/contracts/keyManagement.ts`
- Modify: `src/services/apiAdapters/aihubmix/keyManagement.ts`

- [ ] **Step 1: Add the failing contract tests**

Create the test file with the following cases:

```ts
import { describe, expect, it } from "vitest"

import { aihubmixKeyManagement } from "~/services/apiAdapters/aihubmix/keyManagement"
import {
  INVENTORY_SECRET_AVAILABILITIES,
  getInventorySecretAvailability,
  type KeyManagementCapability,
} from "~/services/apiAdapters/contracts/keyManagement"

describe("key-management inventory secret availability", () => {
  it("defaults compatible adapters to recoverable stored secrets", () => {
    const capability = {} as KeyManagementCapability

    expect(getInventorySecretAvailability(capability)).toBe(
      INVENTORY_SECRET_AVAILABILITIES.Recoverable,
    )
  })

  it("declares AIHubMix inventory secrets as create-response-only", () => {
    expect(getInventorySecretAvailability(aihubmixKeyManagement)).toBe(
      INVENTORY_SECRET_AVAILABILITIES.CreateResponseOnly,
    )
  })
})
```

- [ ] **Step 2: Run the test and confirm the new API is missing**

Run:

```powershell
pnpm test tests/services/apiAdapters/keyManagement.secretAvailability.test.ts
```

Expected: FAIL because the constants and resolver are not exported.

- [ ] **Step 3: Add the capability vocabulary and conservative compatibility default**

Add this runtime/type pair near `KeyManagementCapability`:

```ts
export const INVENTORY_SECRET_AVAILABILITIES = {
  Recoverable: "recoverable",
  CreateResponseOnly: "create-response-only",
  Unavailable: "unavailable",
} as const

export type InventorySecretAvailability =
  (typeof INVENTORY_SECRET_AVAILABILITIES)[keyof typeof INVENTORY_SECRET_AVAILABILITIES]
```

Add the optional adapter field:

```ts
inventorySecretAvailability?: InventorySecretAvailability
```

Add a resolver so existing adapters keep their current behavior without repetitive declarations:

```ts
export const getInventorySecretAvailability = (
  capability: Pick<KeyManagementCapability, "inventorySecretAvailability">,
): InventorySecretAvailability =>
  capability.inventorySecretAvailability ??
  INVENTORY_SECRET_AVAILABILITIES.Recoverable
```

Declare AIHubMix explicitly:

```ts
inventorySecretAvailability:
  INVENTORY_SECRET_AVAILABILITIES.CreateResponseOnly,
```

Keep `resolveTokenKey` unchanged. It remains useful for newly created in-memory values and preserves the public adapter contract; the presentation policy prevents impossible stored-row actions.

- [ ] **Step 4: Run the focused contract tests**

Run:

```powershell
pnpm test tests/services/apiAdapters/keyManagement.secretAvailability.test.ts tests/services/apiAdapters/keyManagement.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit the adapter contract**

```powershell
git add src/services/apiAdapters/contracts/keyManagement.ts src/services/apiAdapters/aihubmix/keyManagement.ts tests/services/apiAdapters/keyManagement.secretAvailability.test.ts
git commit -m "feat(keys): declare inventory secret availability"
```

## Task 2: Project legacy tokens into a provider-neutral presentation model

**Files:**

- Create: `src/features/KeyManagement/presentation/keyResourceCard.ts`
- Create: `src/features/KeyManagement/presentation/legacyKeyResourceCard.ts`
- Create: `tests/features/KeyManagement/presentation/legacyKeyResourceCard.test.ts`

- [ ] **Step 1: Add presenter tests for information hierarchy and action policy**

Use `createAccount`, `createToken`, and `buildDisplayAccountTokenRuntimeKey`. Cover these observable results:

```ts
const t = ((key: string) => key) as TFunction

it("keeps recoverable legacy actions and limits the summary to four facts", () => {
  const runtimeKey = buildDisplayAccountTokenRuntimeKey(
    createAccount({ siteType: SITE_TYPES.NEW_API }),
    createToken({
      group: "default",
      model_limits_enabled: true,
      model_limits: "model-a,model-b",
      allow_ips: "192.0.2.10",
    }),
  )

  const presentation = buildLegacyKeyResourceCardPresentation(runtimeKey, t)

  expect(presentation.summaryFacts.map(({ id }) => id)).toEqual([
    "remaining-quota",
    "used-quota",
    "expires-at",
  ])
  expect(presentation.detailFacts.map(({ id }) => id)).toEqual([
    "created-at",
    "quota-policy",
    "group",
    "models",
    "ip-limits",
  ])
  expect(presentation.actions).toMatchObject({
    copySecret: true,
    revealSecret: true,
    verifySecret: true,
    exportSecret: true,
    edit: true,
    delete: true,
    batchSelect: true,
  })
})

it("keeps AIHubMix metadata and mutations but removes stored-secret actions", () => {
  const runtimeKey = buildDisplayAccountTokenRuntimeKey(
    createAccount({ siteType: SITE_TYPES.AIHUBMIX }),
    createToken({ group: "vip", models: "model-a", allow_ips: "*" }),
  )

  const presentation = buildLegacyKeyResourceCardPresentation(runtimeKey, t)

  expect(presentation.detailFacts.map(({ id }) => id)).toEqual([
    "created-at",
    "quota-policy",
    "group",
    "models",
    "ip-limits",
  ])
  expect(presentation.secretAvailabilityMessage).toBe(
    "keyManagement:keyDetails.createResponseOnlySecret",
  )
  expect(presentation.actions).toEqual({
    copySecret: false,
    revealSecret: false,
    verifySecret: false,
    exportSecret: false,
    edit: true,
    delete: true,
    batchSelect: false,
  })
})

it("omits blank optional metadata without dropping required safe facts", () => {
  const presentation = buildLegacyKeyResourceCardPresentation(
    buildDisplayAccountTokenRuntimeKey(
      createAccount({ siteType: SITE_TYPES.AIHUBMIX }),
      createToken({ group: "", models: "", allow_ips: "" }),
    ),
    t,
  )

  expect(presentation.detailFacts.map(({ id }) => id)).toEqual([
    "created-at",
    "quota-policy",
  ])
})
```

- [ ] **Step 2: Run the presenter test and confirm the modules are missing**

Run:

```powershell
pnpm test tests/features/KeyManagement/presentation/legacyKeyResourceCard.test.ts
```

Expected: FAIL because the presentation modules do not exist.

- [ ] **Step 3: Define semantic presentation types**

In `keyResourceCard.ts`, export these stable view contracts:

```ts
export type KeyResourceFact = {
  id: string
  label: string
  value: string
}

export type KeyResourceActionPolicy = {
  copySecret: boolean
  revealSecret: boolean
  verifySecret: boolean
  exportSecret: boolean
  edit: boolean
  delete: boolean
  batchSelect: boolean
}

export type KeyResourceCardPresentation = {
  id: string
  title: string
  accountLabel: string
  status: "active" | "inactive" | "unknown"
  statusLabel: string
  secretAvailability: InventorySecretAvailability
  maskedLabel?: string
  secretAvailabilityMessage?: string
  summaryFacts: KeyResourceFact[]
  detailFacts: KeyResourceFact[]
  actions: KeyResourceActionPolicy
}

export type KeyResourceDetailState =
  | { status: "ready"; facts: KeyResourceFact[] }
  | { status: "loading" }
  | { status: "error"; message: string; onRetry?: () => void }
```

Import `InventorySecretAvailability` from the adapter contract rather than duplicating its string literals. Keep facts semantic and provider-neutral. Components receive strings and never inspect `siteType`, provider names, `ApiToken`, or API response shapes.

- [ ] **Step 4: Implement the legacy presenter**

In `legacyKeyResourceCard.ts`:

- look up `getSiteTypeCapabilities(runtimeKey.siteType).keyManagement`;
- resolve secret availability with `getInventorySecretAvailability`;
- treat only `Recoverable` as eligible for stored-secret actions;
- intersect that result with the existing runtime-key capabilities;
- map status through the existing `keyManagement` status keys;
- build the three comparison facts—remaining quota, used quota, and expiration—using `formatQuota` and `formatKeyTime`; status remains in the header;
- include creation time and quota policy as required safe detail facts;
- append last-used time when meaningful, plus note, group, model restrictions, and IP restrictions only when nonblank;
- use `model_limits` when `model_limits_enabled` is true, otherwise use `models`;
- preserve a safe masked inventory value as `maskedLabel`, but never treat it as a usable secret;
- provide a localized `secretAvailabilityMessage` for create-response-only or unavailable inventory secrets so the default key row explains why secret actions are absent;
- export `isKeyResourceBatchSelectable(runtimeKey)` from the same policy source for `TokenList`.

The core action calculation should have this shape:

```ts
const secretAvailability = getInventorySecretAvailability(keyManagement)
const canRecoverStoredSecret =
  secretAvailability === INVENTORY_SECRET_AVAILABILITIES.Recoverable

const actions: KeyResourceActionPolicy = {
  copySecret: canRecoverStoredSecret && runtimeKey.capabilities.copy,
  revealSecret: canRecoverStoredSecret && runtimeKey.capabilities.copy,
  verifySecret: canRecoverStoredSecret && runtimeKey.capabilities.verify,
  exportSecret: canRecoverStoredSecret && runtimeKey.capabilities.export,
  edit: runtimeKey.capabilities.updateToken,
  delete: runtimeKey.capabilities.deleteToken,
  batchSelect:
    canRecoverStoredSecret &&
    runtimeKey.capabilities.export &&
    runtimeKey.capabilities.verify,
}
```

If `keyManagement` is unexpectedly absent for an account-token runtime key, use `Unavailable`; do not silently grant secret actions.

- [ ] **Step 5: Run presenter and related formatter tests**

Run:

```powershell
pnpm test tests/features/KeyManagement/presentation/legacyKeyResourceCard.test.ts tests/features/KeyManagement/components/TokenDetails.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit the presentation projection**

```powershell
git add src/features/KeyManagement/presentation/keyResourceCard.ts src/features/KeyManagement/presentation/legacyKeyResourceCard.ts tests/features/KeyManagement/presentation/legacyKeyResourceCard.test.ts
git commit -m "feat(keys): project legacy key resource presentation"
```

## Task 3: Add the reusable key-resource card primitives

**Files:**

- Create: `src/features/KeyManagement/components/KeyResourceCard.tsx`
- Create: `tests/features/KeyManagement/components/KeyResourceCard.test.tsx`

- [ ] **Step 1: Add shared-component tests**

Render the component with a fixed presentation object and cover:

Import `useState` from React for the controlled-expansion harness.

```tsx
it("renders the common hierarchy and expands safe details", async () => {
  const user = userEvent.setup()
  function Harness() {
    const [isExpanded, setIsExpanded] = useState(false)
    return (
      <KeyResourceCard
        presentation={presentation}
        secret={<code>sk-example</code>}
        actions={<button type="button">Edit</button>}
        details={{ status: "ready", facts: presentation.detailFacts }}
        isDetailsExpanded={isExpanded}
        onDetailsExpandedChange={setIsExpanded}
      />
    )
  }
  render(<Harness />)

  expect(screen.getByRole("heading", { name: "Example key" })).toBeVisible()
  expect(screen.getByText("Account example")).toBeVisible()
  expect(screen.getByText("Remaining quota")).toBeVisible()
  expect(screen.queryByText("IP limits")).toBeNull()

  await user.click(screen.getByRole("button", { name: "View details" }))

  expect(screen.getByText("IP limits")).toBeVisible()
  expect(screen.getByText("192.0.2.10")).toBeVisible()
})

it("announces loading and supports detail retry", async () => {
  const user = userEvent.setup()
  const onRetry = vi.fn()
  const { rerender } = render(
    <KeyResourceCard
      presentation={presentation}
      details={{ status: "loading" }}
      isDetailsExpanded={true}
      onDetailsExpandedChange={vi.fn()}
    />,
  )

  expect(screen.getByRole("status")).toHaveTextContent("Loading details")

  rerender(
    <KeyResourceCard
      presentation={presentation}
      details={{
        status: "error",
        message: "Details unavailable",
        onRetry,
      }}
      isDetailsExpanded={true}
      onDetailsExpandedChange={vi.fn()}
    />,
  )
  await user.click(screen.getByRole("button", { name: "Retry" }))
  expect(onRetry).toHaveBeenCalledOnce()
})

it("omits the selection control when no selection callback is supplied", () => {
  render(
    <KeyResourceCard
      presentation={presentation}
      isDetailsExpanded={false}
      onDetailsExpandedChange={vi.fn()}
    />,
  )

  expect(screen.queryByRole("checkbox")).toBeNull()
})

it("renders an explicit empty detail state", () => {
  render(
    <KeyResourceCard
      presentation={{
        ...presentation,
        secretAvailabilityMessage: undefined,
      }}
      details={{ status: "ready", facts: [] }}
      isDetailsExpanded={true}
      onDetailsExpandedChange={vi.fn()}
    />,
  )

  expect(screen.getByText("No additional details")).toBeVisible()
})
```

The fixture must use reserved example data such as `example.invalid`, `192.0.2.10`, and non-secret sample keys.

- [ ] **Step 2: Run the test and confirm the component is missing**

Run:

```powershell
pnpm test tests/features/KeyManagement/components/KeyResourceCard.test.tsx
```

Expected: FAIL because `KeyResourceCard` does not exist.

- [ ] **Step 3: Implement shared card primitives using existing UI components**

Export from `KeyResourceCard.tsx`:

- `KeyResourceCard`: outer `Card`, optional checkbox, responsive content stack, summary fact grid, controlled expandable detail region;
- `KeyResourceCardHeader`: title, account label, semantic status badge, optional provider badges, and caller-supplied action slots;
- `KeyResourceFactList`: reusable wrapping label/value grid;
- `KeyResourceSecretDisplay`: optional secret text plus caller-supplied reveal/copy controls.

Use the existing `Card`, `CardContent`, `Checkbox`, `Badge`, `IconButton`, `Button`, `Spinner`, and `Tooltip` components. Use a Lucide information/details icon inside an `IconButton`; give it a localized `aria-label`, `aria-expanded`, `aria-controls`, and tooltip. Keep actions as React slots so the card cannot infer provider behavior.

The top-level API should remain usable by both legacy and native resources:

```ts
export type KeyResourceCardProps = {
  presentation: KeyResourceCardPresentation
  secret?: ReactNode
  actions?: ReactNode
  details?: KeyResourceDetailState
  isDetailsExpanded: boolean
  onDetailsExpandedChange: (isExpanded: boolean) => void
  isSelected?: boolean
  onSelectionChange?: (checked: boolean) => void
  selectionLabel?: string
  testId?: string
}
```

Render the key row first, including `secretAvailabilityMessage` inline beside a safe masked value when present, followed by the summary facts. Render secondary ready details only after controlled expansion. The component invokes `onDetailsExpandedChange` but never owns the expansion state, so OpenRouter can start its cancellable detail read on expansion and transition from loading to ready or error without losing state.

- [ ] **Step 4: Run component tests and an accessibility-focused regression set**

Run:

```powershell
pnpm test tests/features/KeyManagement/components/KeyResourceCard.test.tsx tests/components/Tooltip.test.tsx tests/components/IconButton.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit the shared UI**

```powershell
git add src/features/KeyManagement/components/KeyResourceCard.tsx tests/features/KeyManagement/components/KeyResourceCard.test.tsx
git commit -m "feat(keys): add shared key resource card"
```

## Task 4: Render legacy tokens through the shared card and reduce AIHubMix actions

**Files:**

- Modify: `src/features/KeyManagement/components/TokenListItem/index.tsx`
- Modify: `src/features/KeyManagement/components/TokenListItem/TokenHeader.tsx`
- Modify: `tests/features/KeyManagement/components/TokenListItem.test.tsx`
- Modify: `tests/features/KeyManagement/components/TokenHeader.analytics.test.tsx`

- [ ] **Step 1: Add failing integration tests for both provider policies**

Update `TokenListItem.test.tsx` so its helper accepts `siteType`, models, and IP limits. Assert the shared hierarchy rather than Tailwind classes:

```tsx
it("shows legacy summary facts and expands provider metadata", async () => {
  const user = userEvent.setup()
  renderTokenListItem({
    siteType: SITE_TYPES.AIHUBMIX,
    tokenGroup: "vip",
    tokenModels: "model-a",
    tokenAllowIps: "192.0.2.10",
  })

  expect(screen.getByText("keyManagement:keyDetails.remainingQuota")).toBeVisible()
  expect(screen.queryByText("192.0.2.10")).toBeNull()

  await user.click(
    screen.getByRole("button", { name: "keyManagement:actions.details" }),
  )

  expect(screen.getByText("vip")).toBeVisible()
  expect(screen.getByText("model-a")).toBeVisible()
  expect(screen.getByText("192.0.2.10")).toBeVisible()
})
```

In `TokenHeader.analytics.test.tsx`, add one recoverable account case and one AIHubMix case. For AIHubMix, assert absence of:

- `common:actions.copyKey`;
- `keyManagement:actions.verifyApi`;
- `keyManagement:actions.verifyCliSupport`;
- profile, Cherry, CC Switch, Kilo, CLIProxy, Claude Code Router, and managed-site import entrypoints.

Also assert that edit and delete remain present. For the recoverable account, assert existing copy, verify, export, edit, and delete actions remain present. This prevents “common UI” from becoming a lowest-common-denominator UI.

- [ ] **Step 2: Run the two tests and confirm the old rendering violates the new behavior**

Run:

```powershell
pnpm test tests/features/KeyManagement/components/TokenListItem.test.tsx tests/features/KeyManagement/components/TokenHeader.analytics.test.tsx
```

Expected: FAIL because legacy rows do not use the presentation model and AIHubMix still exposes secret-dependent actions.

- [ ] **Step 3: Make `TokenListItem` the legacy composition boundary**

Inside `TokenListItem`:

- build an `AccountTokenRuntimeKey` with `buildDisplayAccountTokenRuntimeKey(account, token)`;
- build `presentation` with `buildLegacyKeyResourceCardPresentation(runtimeKey, t)`;
- replace the local `Card`/`CardContent` markup with `KeyResourceCard`;
- own `isDetailsExpanded` locally for legacy rows and pass it through the shared controlled API;
- pass selection props only when `presentation.actions.batchSelect` is true;
- pass interactive `KeyDisplay` only when `copySecret` or `revealSecret` is true; otherwise pass the safe `maskedLabel` as static code text when present;
- pass the presentation facts as `details={{ status: "ready", facts: presentation.detailFacts }}`;
- preserve `getKeyManagementTokenRowTestId(token.id)`;
- pass `presentation.actions` into `TokenHeader`.

Do not show masked key text for AIHubMix as though it were an actionable secret. If the backend supplies a safe masked label, render it as static identifying text with no reveal/copy controls, with the site-owned limitation inline in the same default key row. The expanded card still shows creation time, quota policy, last-used time when meaningful, note, group, models, IP limits, edit, and delete.

- [ ] **Step 4: Make `TokenHeader` capability-driven without rewriting its workflows**

Add this prop:

```ts
actionPolicy: KeyResourceActionPolicy
```

Keep every existing callback, dialog, analytics action, and error path. Change only entrypoint visibility and dialog mounting:

- `copySecret`: copy button;
- `verifySecret`: API verification and CLI-support verification;
- `exportSecret`: save-to-profile, Cherry, CC Switch, Kilo, CLIProxy, Claude Code Router, managed-site import/status, and their dialogs;
- `edit`: edit button;
- `delete`: delete button.

Render supported controls in the existing order. Omit unsupported controls entirely rather than disabling them. Wrap the existing title/account/status content with `KeyResourceCardHeader` so the visual hierarchy is shared without moving legacy orchestration into the generic component.

When `exportSecret` is false, do not start managed-site status work and do not mount export/import dialogs. This prevents hidden actions from retaining avoidable secret-dependent side effects.

- [ ] **Step 5: Run focused legacy rendering tests**

Run:

```powershell
pnpm test tests/features/KeyManagement/components/TokenListItem.test.tsx tests/features/KeyManagement/components/TokenHeader.analytics.test.tsx tests/entrypoints/options/pages/KeyManagement/TokenHeader.saveToApiProfiles.test.tsx tests/features/KeyManagement/components/TokenDetails.test.tsx tests/entrypoints/options/pages/KeyManagement/KeyDisplay.identity.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit the legacy migration**

```powershell
git add src/features/KeyManagement/components/TokenListItem/index.tsx src/features/KeyManagement/components/TokenListItem/TokenHeader.tsx tests/features/KeyManagement/components/TokenListItem.test.tsx tests/features/KeyManagement/components/TokenHeader.analytics.test.tsx
git commit -m "refactor(keys): render legacy tokens with shared cards"
```

## Task 5: Make batch actions use the same eligibility policy

**Files:**

- Modify: `src/features/KeyManagement/components/TokenList.tsx`
- Modify: `tests/entrypoints/options/pages/KeyManagement/TokenList.batchExport.test.tsx`

- [ ] **Step 1: Add mixed-provider and AIHubMix-only batch tests**

First change the mocked `TokenListItem` to render its checkbox only when `onSelectionChange` is defined. Then add these behaviors:

```tsx
it("excludes create-response-only keys from selection in a mixed inventory", async () => {
  const recoverableAccount = createAccount({
    id: "recoverable-account",
    siteType: SITE_TYPES.NEW_API,
  })
  const createOnlyAccount = createAccount({
    id: "create-only-account",
    siteType: SITE_TYPES.AIHUBMIX,
  })

  renderTokenList({
    selectedAccount: KEY_MANAGEMENT_ALL_ACCOUNTS_VALUE,
    displayData: [recoverableAccount, createOnlyAccount] as any,
    tokens: [
      createToken({
        id: 1,
        name: "Recoverable key",
        accountId: recoverableAccount.id,
        accountName: recoverableAccount.name,
      }),
      createToken({
        id: 2,
        name: "Create-only key",
        accountId: createOnlyAccount.id,
        accountName: createOnlyAccount.name,
      }),
    ] as any,
  })

  expect(await screen.findByRole("checkbox", { name: "Recoverable key" })).toBeVisible()
  expect(screen.queryByRole("checkbox", { name: "Create-only key" })).toBeNull()
})

it("hides the batch toolbar for an AIHubMix-only inventory", async () => {
  const account = createAccount({ siteType: SITE_TYPES.AIHUBMIX })
  renderTokenList({
    selectedAccount: account.id,
    displayData: [account] as any,
    tokens: [createToken({ accountId: account.id })] as any,
  })

  expect(await screen.findByText(/Token/)).toBeVisible()
  expect(
    screen.queryByRole("checkbox", {
      name: "keyManagement:batchManagedSiteExport.selection.visible",
    }),
  ).toBeNull()
  expect(
    screen.queryByRole("button", {
      name: /keyManagement:batchManagedSiteExport.actions.open/,
    }),
  ).toBeNull()
})
```

Use explicit token names in the final test instead of a broad `/Token/` query if the factory default is not unique.

- [ ] **Step 2: Run the batch test and confirm AIHubMix is still selectable**

Run:

```powershell
pnpm test tests/entrypoints/options/pages/KeyManagement/TokenList.batchExport.test.tsx
```

Expected: FAIL because all account-token runtime keys are currently selectable.

- [ ] **Step 3: Filter batch eligibility before selection state is derived**

In `TokenList.tsx`:

- derive visible account-token runtime keys as today;
- filter them through `isKeyResourceBatchSelectable` before computing visible selection IDs;
- keep service credentials eligible under their existing `hasUsableAccountRuntimeKeySecret` rule;
- prune `selectedEntryIds` against the eligible ID set after refresh/provider changes;
- pass `onSelectionChange` to a row only when that row is eligible;
- render group selection only when the group contains at least one eligible row;
- render the batch toolbar only when at least one visible eligible row exists;
- build all batch/export dialog payloads from selected eligible entries, never from the unfiltered inventory.

Do not modify `isSelectableAccountRuntimeKey` globally. It also participates in non-Key-Management flows; the new rule is a product-action policy local to this feature.

- [ ] **Step 4: Run batch, grouping, and empty-state regressions**

Run:

```powershell
pnpm test tests/entrypoints/options/pages/KeyManagement/TokenList.batchExport.test.tsx tests/entrypoints/options/pages/KeyManagement/TokenList.grouping.test.tsx tests/entrypoints/options/pages/KeyManagement/TokenList.emptyStates.test.tsx
```

Expected: PASS, including mixed inventories, group selection, selection pruning, and existing service credentials.

- [ ] **Step 5: Commit batch eligibility**

```powershell
git add src/features/KeyManagement/components/TokenList.tsx tests/entrypoints/options/pages/KeyManagement/TokenList.batchExport.test.tsx
git commit -m "fix(keys): exclude create-only keys from batch actions"
```

## Task 6: Localize the new hierarchy and complete validation

**Files:**

- Modify: all six `src/locales/*/keyManagement.json` files listed in the target file map
- Modify only if the extractor requires it: `i18next.config.ts`

- [ ] **Step 1: Add the same keys to every supported app locale**

Add these keys with natural translations in `en`, `zh-CN`, `zh-TW`, `ja`, `vi`, `es-419`, and `pt-BR`:

```json
{
  "actions": {
    "details": "View details"
  },
  "keyDetails": {
    "createResponseOnlySecret": "The full key is available only when it is created.",
    "ipLimits": "IP limits",
    "lastUsedTime": "Last used",
    "limitedQuota": "Limited",
    "models": "Models",
    "note": "Note",
    "quotaPolicy": "Quota policy"
  },
  "details": {
    "empty": "No additional details",
    "loading": "Loading details",
    "unavailable": "Details unavailable"
  }
}
```

Merge these members into the existing objects; do not replace sibling translations. Reuse `common:actions.retry` for the retry button and existing status/quota/time keys where they already express the same concept.

- [ ] **Step 2: Run extraction integrity**

Run:

```powershell
pnpm run i18n:extract:ci
```

Expected: PASS with no locale file rewrites. If extraction changes files, inspect every deletion and fix the source usage or extractor configuration before proceeding.

- [ ] **Step 3: Run all affected tests together**

Run:

```powershell
pnpm test tests/services/apiAdapters/keyManagement.secretAvailability.test.ts tests/services/apiAdapters/keyManagement.test.ts tests/features/KeyManagement/presentation/legacyKeyResourceCard.test.ts tests/features/KeyManagement/components/KeyResourceCard.test.tsx tests/features/KeyManagement/components/TokenListItem.test.tsx tests/features/KeyManagement/components/TokenDetails.test.tsx tests/features/KeyManagement/components/TokenHeader.analytics.test.tsx tests/entrypoints/options/pages/KeyManagement/TokenHeader.saveToApiProfiles.test.tsx tests/entrypoints/options/pages/KeyManagement/TokenList.batchExport.test.tsx tests/entrypoints/options/pages/KeyManagement/TokenList.grouping.test.tsx tests/entrypoints/options/pages/KeyManagement/TokenList.emptyStates.test.tsx tests/entrypoints/options/pages/KeyManagement/KeyDisplay.identity.test.tsx
```

Expected: PASS.

- [ ] **Step 4: Run TypeScript and inspect maintainability**

Run:

```powershell
pnpm compile
git diff --check
git diff main...HEAD --stat
git diff main...HEAD
```

Expected: compile and diff checks PASS. During diff review, confirm:

- no provider name or `siteType` branch appears in `KeyResourceCard.tsx`;
- one presenter owns legacy fact/action projection;
- one policy owns both row action visibility and batch eligibility;
- no secret-dependent AIHubMix dialog is mounted from a stored row;
- the shared card retains loading, error, ready, empty-detail, responsive, and keyboard-accessible behavior;
- no OpenRouter controller/editor/API code was copied into this branch.

- [ ] **Step 5: Stage only task files and run the commit-equivalent gate**

```powershell
git status --porcelain=v1
git add src/services/apiAdapters/contracts/keyManagement.ts src/services/apiAdapters/aihubmix/keyManagement.ts src/features/KeyManagement/presentation/keyResourceCard.ts src/features/KeyManagement/presentation/legacyKeyResourceCard.ts src/features/KeyManagement/components/KeyResourceCard.tsx src/features/KeyManagement/components/TokenListItem/index.tsx src/features/KeyManagement/components/TokenListItem/TokenHeader.tsx src/features/KeyManagement/components/TokenList.tsx tests/services/apiAdapters/keyManagement.secretAvailability.test.ts tests/features/KeyManagement/presentation/legacyKeyResourceCard.test.ts tests/features/KeyManagement/components/KeyResourceCard.test.tsx tests/features/KeyManagement/components/TokenListItem.test.tsx tests/features/KeyManagement/components/TokenHeader.analytics.test.tsx tests/entrypoints/options/pages/KeyManagement/TokenList.batchExport.test.tsx src/locales/en/keyManagement.json src/locales/zh-CN/keyManagement.json src/locales/zh-TW/keyManagement.json src/locales/ja/keyManagement.json src/locales/vi/keyManagement.json src/locales/es-419/keyManagement.json src/locales/pt-BR/keyManagement.json
pnpm run validate:staged
git diff --cached --check
git diff --cached --stat
```

Expected: PASS. If earlier task commits left only locale changes unstaged, the staged gate should validate those locale changes and their referencing TSX files as required by the repo hook; do not stage unrelated files to widen the gate.

- [ ] **Step 6: Commit localization or hook-produced task changes**

```powershell
git commit -m "feat(keys): localize shared key resource details"
```

If all locale changes were necessarily committed with their consuming component in an earlier task, skip this commit instead of creating an empty commit.

- [ ] **Step 7: Run the branch-level push gate**

Run:

```powershell
pnpm run validate:push
git status --porcelain=v1
```

Expected: `validate:push` PASS and the worktree is clean.

## Release-readiness decisions

- **Telemetry:** none added. This work does not introduce a new user action; it reuses existing action telemetry for actions that remain possible and removes impossible AIHubMix entrypoints. The details expansion is low-value local presentation state and must not carry provider metadata or key data into analytics.
- **Settings search/deep links:** no change. The Key Management route and settings anchors are unchanged.
- **E2E:** no new Playwright test in this prerequisite PR. Presentation/action policy and mixed-inventory selection are deterministic React/TypeScript behavior covered more precisely with Vitest and Testing Library. The later OpenRouter PR must update its existing Key Management E2E path to exercise the shared card in the real extension runtime.
- **Maintainability:** reuse the current adapter registry, runtime-key model, formatters, UI primitives, and legacy workflows. Extract only the semantic presentation and visual shell; leave provider CRUD/orchestration in provider or legacy containers.

## Acceptance checklist

- [ ] AIHubMix and a recoverable legacy provider render the same card hierarchy.
- [ ] AIHubMix shows name, account, status, quota summary, safe masked label, secret-availability explanation, and every applicable creation/last-use/note/group/model/IP/quota-policy detail.
- [ ] AIHubMix stored rows expose edit/delete but no reveal, copy, verification, export/import, managed-site import, or batch selection.
- [ ] Recoverable providers retain their existing native actions.
- [ ] Unsupported actions are absent rather than disabled.
- [ ] Summary contains no more than four facts; details are icon-triggered and accessible.
- [ ] Detail loading, error/retry, ready, and empty-detail states are supported by the shared component.
- [ ] Mixed inventories select only eligible rows; AIHubMix-only inventories show no batch toolbar.
- [ ] All seven app locales have matching key shapes.
- [ ] Focused tests, extraction integrity, compile, staged validation, and push validation pass.
- [ ] No OpenRouter-specific API/editor/controller code enters the shared-UI PR.
