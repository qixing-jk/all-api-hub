# Kilo Code Provider Catalog Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Export human-readable Kilo Code 7.x providers with complete per-key model catalogs and one explicit global default while preserving the legacy single-model format.

**Architecture:** Introduce a pure V7 catalog-preparation boundary that owns provider display names, stable IDs, model normalization, and analytics counts. Feed its prepared output into a schema-only V7 builder and a discriminated output policy; both dialogs consume the same prepared facts, while target-local UI state keeps legacy model choices separate from V7 catalogs/defaults. Reuse existing model inventories and browser download flows, adding a bounded-result default-model control instead of rendering every model at once.

**Tech Stack:** TypeScript, React, Vitest, Testing Library, i18next, Playwright, WXT, pnpm.

**Design:** `docs/superpowers/specs/2026-07-17-kilo-code-provider-catalog-export-design.md`

---

## File and Responsibility Map

- Create `src/services/integrations/kiloCodeV7Catalog.ts`: V7 input contracts, provider display-name disambiguation, current-compatible provider IDs, code-point model ordering, and prepared catalog output.
- Modify `src/services/integrations/kiloCodeExport.ts`: isolate legacy selection input and make the V7 schema builder consume a prepared catalog plus explicit default selection.
- Modify `src/services/integrations/kiloCodeExportPolicy.ts`: discriminated V7/legacy inputs, `{ provider, model }` V7 copy fragment, normalized counts, pretty JSON, and 1 MiB file-size metadata.
- Create `src/components/KiloCodeDefaultModelSelect.tsx`: feature-local searchable/custom default-model control with at most 100 rendered results.
- Create `src/components/kiloCodeExportTestIds.ts`: stable selectors shared by component and Playwright coverage.
- Modify `src/features/ApiCredentialProfiles/components/KiloCodeProfileExportDialog.tsx`: full V7 catalog, custom/retry/remove flow, V7/legacy state isolation, and size-aware download.
- Modify `src/components/KiloCodeExportDialog.tsx`: per-provider V7 catalogs, global default provider/model, legacy single-model preservation, retry/remove flow, and normalized telemetry.
- Modify `src/components/KiloCodeExportGuidance.tsx`: copy/import guidance for the top-level V7 fragment and oversized-file recovery.
- Modify `src/locales/{en,es-419,ja,vi,zh-CN,zh-TW}/ui.json`: target-specific labels, recovery actions, bounded search, and size errors.
- Modify `docs/docs/{key-management,api-credential-profiles,supported-export-tools}.md`: Chinese source documentation.
- Modify related Vitest files under `tests/services`, `tests/components`, and `tests/features/ApiCredentialProfiles/components`.
- Modify `e2e/apiCredentialProfilesOptionsActions.spec.ts`: representative V7 catalog/name/default download contract and retained legacy regression.

## Task 1: Prepare V7 Provider Catalogs at One Pure Boundary

**Files:**

- Create: `src/services/integrations/kiloCodeV7Catalog.ts`
- Create: `tests/services/kiloCodeV7Catalog.test.ts`
- Modify: `src/services/integrations/kiloCodeExport.ts`

- [ ] **Step 1: Write failing catalog tests**

Create `tests/services/kiloCodeV7Catalog.test.ts` with reserved example data:

```ts
import { describe, expect, it } from "vitest"

import {
  prepareKiloCodeV7Catalog,
  type KiloCodeV7ProviderSelection,
} from "~/services/integrations/kiloCodeV7Catalog"

const baseSelection: KiloCodeV7ProviderSelection = {
  selectionId: "account-a:7",
  accountId: "account-a",
  siteName: "Example",
  baseUrl: "https://api.example.invalid",
  tokenId: 7,
  tokenName: "Default",
  tokenKey: "example-key",
  providerName: "Example - Default",
  discoveredModelIds: ["model-b", " model-a ", "model-b", ""],
}

describe("prepareKiloCodeV7Catalog", () => {
  it("prepares a readable provider with a normalized multi-model catalog", () => {
    const result = prepareKiloCodeV7Catalog([baseSelection])

    expect(result.providers).toEqual([
      expect.objectContaining({
        selectionId: "account-a:7",
        providerName: "Example - Default",
        providerId: expect.stringMatching(/^example-default-[a-f0-9]{8}$/),
        baseURL: "https://api.example.invalid/v1",
        tokenKey: "example-key",
        modelIds: ["model-a", "model-b"],
      }),
    ])
    expect(result.providerCount).toBe(1)
    expect(result.modelCount).toBe(2)
  })

  it("unions a manual model with discovered models until it is cleared", () => {
    const result = prepareKiloCodeV7Catalog([
      { ...baseSelection, manualModelId: " custom/model " },
    ])

    expect(result.providers[0]?.modelIds).toEqual([
      "custom/model",
      "model-a",
      "model-b",
    ])
  })

  it("uses code-point order instead of locale-sensitive ordering", () => {
    const result = prepareKiloCodeV7Catalog([
      {
        ...baseSelection,
        discoveredModelIds: ["ä-model", "Z-model", "a-model", "A-model"],
      },
    ])

    expect(result.providers[0]?.modelIds).toEqual([
      "A-model",
      "Z-model",
      "a-model",
      "ä-model",
    ])
  })

  it("disambiguates duplicate display names without merging credentials", () => {
    const result = prepareKiloCodeV7Catalog([
      baseSelection,
      {
        ...baseSelection,
        selectionId: "account-b:8",
        accountId: "account-b",
        baseUrl: "https://second.example.invalid",
        tokenId: 8,
      },
    ])

    expect(result.providers.map((provider) => provider.providerName)).toEqual([
      "Example - Default (api.example.invalid)",
      "Example - Default (second.example.invalid)",
    ])
    expect(new Set(result.providers.map((provider) => provider.providerId))).toHaveLength(2)
  })

  it("keeps the current provider ID stable across secret and catalog changes", () => {
    const first = prepareKiloCodeV7Catalog([baseSelection])
    const second = prepareKiloCodeV7Catalog([
      {
        ...baseSelection,
        tokenKey: "rotated-example-key",
        discoveredModelIds: ["different-model"],
      },
    ])

    expect(second.providers[0]?.providerId).toBe(first.providers[0]?.providerId)
  })

  it("rejects duplicate opaque selection IDs", () => {
    expect(() =>
      prepareKiloCodeV7Catalog([
        baseSelection,
        { ...baseSelection, accountId: "account-b" },
      ]),
    ).toThrow("Kilo Code selection IDs must be unique")
  })
})
```

- [ ] **Step 2: Run the catalog test and verify RED**

Run:

```powershell
pnpm vitest related tests/services/kiloCodeV7Catalog.test.ts --run
```

Expected: FAIL because `kiloCodeV7Catalog.ts` does not exist.

- [ ] **Step 3: Add the target-specific catalog contracts and preparation function**

Create `src/services/integrations/kiloCodeV7Catalog.ts` with these public shapes:

```ts
import { coerceBaseUrlToPathSuffix } from "~/utils/core/url"

export interface KiloCodeRuntimeKeyExportInput {
  accountId: string
  siteName: string
  baseUrl: string
  tokenId: number
  tokenName: string
  tokenKey: string
}

export interface KiloCodeLegacySelection
  extends KiloCodeRuntimeKeyExportInput {
  legacyModelId?: string
}

export interface KiloCodeV7ProviderSelection
  extends KiloCodeRuntimeKeyExportInput {
  selectionId: string
  providerName?: string
  discoveredModelIds: string[]
  manualModelId?: string
}

export interface KiloCodeDefaultModelSelection {
  selectionId: string
  modelId: string
}

export interface PreparedKiloCodeV7Provider {
  selectionId: string
  providerId: string
  providerName: string
  baseURL: string
  tokenKey: string
  modelIds: string[]
}

export interface PreparedKiloCodeV7Catalog {
  providers: PreparedKiloCodeV7Provider[]
  providerCount: number
  modelCount: number
}
```

Implement deterministic normalization without `localeCompare`:

```ts
function compareCodePoints(left: string, right: string) {
  if (left === right) return 0
  return left < right ? -1 : 1
}

function normalizeModelIds(selection: KiloCodeV7ProviderSelection) {
  return Array.from(
    new Set(
      [...selection.discoveredModelIds, selection.manualModelId]
        .filter((value): value is string => typeof value === "string")
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  ).sort(compareCodePoints)
}
```

Move the current slug/hash/provider-ID logic from `kiloCodeExport.ts` into this file byte-for-byte. Reuse the existing domain/ordinal profile-name disambiguation rules, extending them to prefer `providerName?.trim()` before the current `<site> - <token>` fallback. Validate unique selection IDs, non-blank keys, HTTP/HTTPS URLs, non-empty model catalogs, settings-safe unique provider IDs, and return normalized counts.

- [ ] **Step 4: Replace the shared tuple with an explicit legacy selection**

In `src/services/integrations/kiloCodeExport.ts`, remove `KiloCodeExportTuple` and import/re-export the target-specific contracts. Change the legacy builder signature and field access:

```ts
import type { KiloCodeLegacySelection } from "~/services/integrations/kiloCodeV7Catalog"

interface BuildKiloCodeApiConfigsOptions {
  selections: KiloCodeLegacySelection[]
  generateId?: (profileName: string) => string
}

const normalizedModelId = tuple.legacyModelId?.trim()
apiConfigs[name] = {
  id: idFactory(name),
  apiProvider: "openai",
  openAiBaseUrl: coerceBaseUrlToPathSuffix(tuple.baseUrl, "/v1"),
  openAiApiKey: tuple.tokenKey,
  ...(normalizedModelId ? { openAiModelId: normalizedModelId } : {}),
}
```

This preserves the existing low-level omission behavior for blank models. Both
dialogs continue to require a legacy model before enabling user export.

- [ ] **Step 5: Run catalog and legacy tests and verify GREEN**

Run:

```powershell
pnpm vitest related tests/services/kiloCodeV7Catalog.test.ts tests/services/kiloCodeExport.test.ts --run
```

Expected: PASS; existing legacy assertions remain unchanged after fixture field renames.

- [ ] **Step 6: Commit the preparation boundary**

```powershell
git add -- src/services/integrations/kiloCodeV7Catalog.ts src/services/integrations/kiloCodeExport.ts tests/services/kiloCodeV7Catalog.test.ts tests/services/kiloCodeExport.test.ts
git commit -m "refactor(kilocode): prepare provider catalogs"
```

## Task 2: Build Named Multi-model V7 Settings

**Files:**

- Modify: `src/services/integrations/kiloCodeExport.ts`
- Modify: `tests/services/kiloCodeExport.test.ts`

- [ ] **Step 1: Replace the one-model V7 test with failing prepared-catalog tests**

Add tests that use `prepareKiloCodeV7Catalog` and assert the exact output:

```ts
it("builds named multi-model providers with an explicit global default", () => {
  const catalog = prepareKiloCodeV7Catalog([
    {
      selectionId: "account-a:7",
      accountId: "account-a",
      siteName: "Example",
      baseUrl: "https://api.example.invalid",
      tokenId: 7,
      tokenName: "Default",
      tokenKey: "example-key",
      providerName: "Example - Default",
      discoveredModelIds: ["model-b", "model-a"],
    },
  ])

  const result = buildKiloCodeV7SettingsFile({
    catalog,
    defaultModel: { selectionId: "account-a:7", modelId: "model-b" },
    now: () => new Date("2026-07-17T00:00:00.000Z"),
  })
  const providerId = catalog.providers[0]!.providerId

  expect(result).toEqual({
    _meta: {
      version: 1,
      exportedAt: "2026-07-17T00:00:00.000Z",
    },
    provider: {
      [providerId]: {
        name: "Example - Default",
        npm: "@ai-sdk/openai-compatible",
        models: {
          "model-a": { name: "model-a" },
          "model-b": { name: "model-b" },
        },
        options: {
          apiKey: "example-key",
          baseURL: "https://api.example.invalid/v1",
        },
      },
    },
    model: `${providerId}/model-b`,
  })
})

it.each([
  [undefined, "Kilo Code default model is required"],
  [
    { selectionId: "missing", modelId: "model-a" },
    "Kilo Code default provider must be exported",
  ],
  [
    { selectionId: "account-a:7", modelId: "missing" },
    "Kilo Code default model must exist in its provider catalog",
  ],
])("rejects invalid default selections", (defaultModel, message) => {
  expect(() =>
    buildKiloCodeV7SettingsFile({ catalog, defaultModel: defaultModel as never }),
  ).toThrow(message)
})
```

- [ ] **Step 2: Run the builder test and verify RED**

Run:

```powershell
pnpm vitest related tests/services/kiloCodeExport.test.ts --run
```

Expected: FAIL because the builder still accepts raw one-model selections and omits `name`.

- [ ] **Step 3: Make the V7 builder schema-only**

Update the provider and builder contracts:

```ts
interface KiloCodeV7Provider {
  name: string
  npm: "@ai-sdk/openai-compatible"
  models: Record<string, { name: string }>
  options: {
    apiKey: string
    baseURL: string
  }
}

export function buildKiloCodeV7SettingsFile(options: {
  catalog: PreparedKiloCodeV7Catalog
  defaultModel: KiloCodeDefaultModelSelection
  now?: () => Date
}): KiloCodeV7SettingsFile {
  if (!options.catalog.providers.length) {
    throw new Error("Select at least one runtime key")
  }

  const defaultProvider = options.catalog.providers.find(
    (provider) => provider.selectionId === options.defaultModel?.selectionId,
  )
  if (!options.defaultModel) throw new Error("Kilo Code default model is required")
  if (!defaultProvider) throw new Error("Kilo Code default provider must be exported")
  if (!defaultProvider.modelIds.includes(options.defaultModel.modelId)) {
    throw new Error("Kilo Code default model must exist in its provider catalog")
  }

  return {
    _meta: {
      version: 1,
      exportedAt: (options.now ?? (() => new Date()))().toISOString(),
    },
    provider: Object.fromEntries(
      options.catalog.providers.map((provider) => [
        provider.providerId,
        {
          name: provider.providerName,
          npm: "@ai-sdk/openai-compatible" as const,
          models: Object.fromEntries(
            provider.modelIds.map((modelId) => [modelId, { name: modelId }]),
          ),
          options: { apiKey: provider.tokenKey, baseURL: provider.baseURL },
        },
      ]),
    ),
    model: `${defaultProvider.providerId}/${options.defaultModel.modelId}`,
  }
}
```

Expand the upstream source comment to mention provider `name`, multi-model `models`, and top-level default `model`.

- [ ] **Step 4: Run focused tests and compile**

Run:

```powershell
pnpm vitest related tests/services/kiloCodeExport.test.ts tests/services/kiloCodeV7Catalog.test.ts --run
pnpm compile
```

Expected: PASS.

- [ ] **Step 5: Commit the V7 schema change**

```powershell
git add -- src/services/integrations/kiloCodeExport.ts tests/services/kiloCodeExport.test.ts
git commit -m "feat(kilocode): export named model catalogs"
```

## Task 3: Discriminate Output Policy and Enforce the File-size Contract

**Files:**

- Modify: `src/services/integrations/kiloCodeExportPolicy.ts`
- Modify: `tests/services/kiloCodeExportPolicy.test.ts`

- [ ] **Step 1: Write failing V7 copy/count/size tests**

Replace the shared options fixture with target-specific inputs and add:

```ts
it("copies the complete V7 top-level fragment and reports normalized counts", () => {
  const output = buildKiloCodeExportOutput({
    target: KILO_CODE_EXPORT_TARGETS.KiloV7,
    selections: [v7Selection],
    defaultModel: { selectionId: v7Selection.selectionId, modelId: "model-b" },
    now,
  })

  expect(output.copyPayload).toEqual({
    provider: output.downloadPayload.provider,
    model: output.downloadPayload.model,
  })
  expect(output.itemCount).toBe(1)
  expect(output.modelCount).toBe(2)
  expect(output.downloadJson).toBe(JSON.stringify(output.downloadPayload, null, 2))
  expect(output.downloadByteLength).toBe(
    new TextEncoder().encode(output.downloadJson).byteLength,
  )
  expect(output.isDownloadTooLarge).toBe(false)
})

it("accepts exactly 1 MiB and rejects 1 MiB plus one byte", () => {
  expect(isKiloCodeSettingsFileTooLarge(1_048_576)).toBe(false)
  expect(isKiloCodeSettingsFileTooLarge(1_048_577)).toBe(true)
})

it("keeps the legacy copy payload and model count unchanged", () => {
  const output = buildKiloCodeExportOutput({
    target: KILO_CODE_EXPORT_TARGETS.Legacy,
    selections: [legacySelection],
    currentLegacyProfileName: "Example - Default",
  })

  expect(output.copyPayload).toEqual(
    output.downloadPayload.providerProfiles.apiConfigs,
  )
  expect(output.modelCount).toBe(1)
})
```

- [ ] **Step 2: Run policy tests and verify RED**

Run:

```powershell
pnpm vitest related tests/services/kiloCodeExportPolicy.test.ts --run
```

Expected: FAIL on missing discriminated inputs, V7 copy envelope, counts, and size metadata.

- [ ] **Step 3: Add discriminated policy inputs and output metadata**

Implement:

```ts
export const KILO_CODE_SETTINGS_MAX_IMPORT_BYTES = 1_048_576

export function isKiloCodeSettingsFileTooLarge(byteLength: number) {
  return byteLength > KILO_CODE_SETTINGS_MAX_IMPORT_BYTES
}

interface BuildKiloCodeV7ExportOutputOptions {
  target: typeof KILO_CODE_EXPORT_TARGETS.KiloV7
  selections: KiloCodeV7ProviderSelection[]
  defaultModel: KiloCodeDefaultModelSelection
  now?: () => Date
}

interface BuildKiloCodeLegacyExportOutputOptions {
  target: typeof KILO_CODE_EXPORT_TARGETS.Legacy
  selections: KiloCodeLegacySelection[]
  currentLegacyProfileName: string
}

type BuildKiloCodeExportOutputOptions =
  | BuildKiloCodeV7ExportOutputOptions
  | BuildKiloCodeLegacyExportOutputOptions

interface KiloCodeExportOutputBase {
  filename: KiloCodeExportFilename
  downloadJson: string
  downloadByteLength: number
  isDownloadTooLarge: boolean
  itemCount: number
  modelCount: number
}

interface KiloCodeV7ExportOutput extends KiloCodeExportOutputBase {
  target: typeof KILO_CODE_EXPORT_TARGETS.KiloV7
  copyPayload: Pick<KiloCodeV7SettingsFile, "provider" | "model">
  downloadPayload: KiloCodeV7SettingsFile
}

interface KiloCodeLegacyExportOutput extends KiloCodeExportOutputBase {
  target: typeof KILO_CODE_EXPORT_TARGETS.Legacy
  copyPayload: KiloCodeSettingsFile["providerProfiles"]["apiConfigs"]
  downloadPayload: KiloCodeSettingsFile
}

export type KiloCodeExportOutput =
  | KiloCodeV7ExportOutput
  | KiloCodeLegacyExportOutput

export function buildKiloCodeExportOutput(
  options: BuildKiloCodeV7ExportOutputOptions,
): KiloCodeV7ExportOutput
export function buildKiloCodeExportOutput(
  options: BuildKiloCodeLegacyExportOutputOptions,
): KiloCodeLegacyExportOutput
```

For V7, call `prepareKiloCodeV7Catalog`, build the payload, and use `{ provider, model }` for copy. For legacy, retain API-config copy behavior. Serialize exactly once with `JSON.stringify(payload, null, 2)` and compute bytes with `new TextEncoder().encode(downloadJson).byteLength`. Add a concise source comment beside the 1 MiB constant pointing to Kilo's pinned `settings-io.ts` `MAX_IMPORT_SIZE`.

- [ ] **Step 4: Run policy, builder, and privacy-adjacent tests**

Run:

```powershell
pnpm vitest related tests/services/kiloCodeExportPolicy.test.ts tests/services/kiloCodeExport.test.ts tests/services/productAnalytics/actions.test.ts tests/services/productAnalytics/privacy.test.ts --run
```

Expected: PASS; no new identifiers enter analytics.

- [ ] **Step 5: Commit the output policy**

```powershell
git add -- src/services/integrations/kiloCodeExportPolicy.ts tests/services/kiloCodeExportPolicy.test.ts
git commit -m "feat(kilocode): describe catalog export output"
```

## Task 4: Add the Bounded Default-model Control and Selection Helpers

**Files:**

- Create: `src/components/KiloCodeDefaultModelSelect.tsx`
- Create: `src/components/kiloCodeExportTestIds.ts`
- Create: `src/services/integrations/kiloCodeV7Selection.ts`
- Create: `tests/components/KiloCodeDefaultModelSelect.test.tsx`
- Create: `tests/services/kiloCodeV7Selection.test.ts`

- [ ] **Step 1: Write failing default-selection reconciliation tests**

Create `tests/services/kiloCodeV7Selection.test.ts`:

```ts
import { describe, expect, it } from "vitest"

import {
  reconcileKiloCodeV7DefaultSelection,
} from "~/services/integrations/kiloCodeV7Selection"

const catalog: PreparedKiloCodeV7Catalog = {
  providers: [
    {
      selectionId: "provider-a",
      providerId: "provider-a-12345678",
      providerName: "Provider A",
      baseURL: "https://api.example.invalid/v1",
      tokenKey: "example-key",
      modelIds: ["model-a", "model-b"],
    },
  ],
  providerCount: 1,
  modelCount: 2,
}

const catalogWithCustom: PreparedKiloCodeV7Catalog = {
  ...catalog,
  providers: [
    {
      ...catalog.providers[0]!,
      modelIds: ["custom/model", "model-a", "model-b"],
    },
  ],
  modelCount: 3,
}

it("selects the first provider and model when the current default is invalid", () => {
  expect(
    reconcileKiloCodeV7DefaultSelection(catalog, {
      selectionId: "removed",
      modelId: "removed/model",
    }),
  ).toEqual({ selectionId: "provider-a", modelId: "model-a" })
})

it("preserves a valid custom default", () => {
  expect(
    reconcileKiloCodeV7DefaultSelection(catalogWithCustom, {
      selectionId: "provider-a",
      modelId: "custom/model",
    }),
  ).toEqual({ selectionId: "provider-a", modelId: "custom/model" })
})

it("repairs the default after a manual model is removed and re-prepared", () => {
  expect(
    reconcileKiloCodeV7DefaultSelection(catalog, {
      selectionId: "provider-a",
      modelId: "custom/model",
    }),
  ).toEqual({ selectionId: "provider-a", modelId: "model-a" })
})
```

- [ ] **Step 2: Write failing bounded-render component tests**

Create `tests/components/KiloCodeDefaultModelSelect.test.tsx`:

```tsx
it("renders at most 100 rows and searches the complete 5,000-model catalog", async () => {
  const user = userEvent.setup()
  const models = Array.from({ length: 5_000 }, (_, index) =>
    `example-model-${index.toString().padStart(4, "0")}`,
  )

  render(
    <KiloCodeDefaultModelSelect
      value="example-model-4999"
      modelIds={models}
      onChange={vi.fn()}
      allowCustomValue
    />,
  )

  await user.click(screen.getByRole("combobox"))
  expect(screen.getAllByTestId(KILO_CODE_EXPORT_TEST_IDS.modelOption)).toHaveLength(100)

  await user.type(
    screen.getByTestId(KILO_CODE_EXPORT_TEST_IDS.defaultModelSearch),
    "4999",
  )
  expect(screen.getByRole("option", { name: "example-model-4999" })).toBeVisible()
})
```

Also cover a selected custom value, the “first 100 of N” hint, and exact model IDs containing `/`.

- [ ] **Step 3: Run both tests and verify RED**

Run:

```powershell
pnpm vitest related tests/services/kiloCodeV7Selection.test.ts tests/components/KiloCodeDefaultModelSelect.test.tsx --run
```

Expected: FAIL because the helper, component, and test IDs do not exist.

- [ ] **Step 4: Implement pure default reconciliation**

Create `src/services/integrations/kiloCodeV7Selection.ts`:

```ts
export function reconcileKiloCodeV7DefaultSelection(
  catalog: PreparedKiloCodeV7Catalog,
  current?: KiloCodeDefaultModelSelection,
): KiloCodeDefaultModelSelection | undefined {
  const currentProvider = catalog.providers.find(
    (provider) => provider.selectionId === current?.selectionId,
  )
  if (currentProvider?.modelIds.includes(current!.modelId)) return current

  const provider = currentProvider ?? catalog.providers[0]
  const modelId = provider?.modelIds[0]
  return provider && modelId
    ? { selectionId: provider.selectionId, modelId }
    : undefined
}
```

Manual-model state remains dialog-owned. Remove actions clear that state, rebuild
the catalog through `prepareKiloCodeV7Catalog`, and pass the previous default to
this same reconciliation function.

- [ ] **Step 5: Implement the bounded feature-local model selector**

Add stable IDs:

```ts
export const KILO_CODE_EXPORT_TEST_IDS = {
  defaultProvider: "kilo-code-default-provider",
  defaultModel: "kilo-code-default-model",
  defaultModelSearch: "kilo-code-default-model-search",
  modelOption: "kilo-code-model-option",
  removeManualModel: "kilo-code-remove-manual-model",
} as const
```

Build `KiloCodeDefaultModelSelect` from existing `Popover`, `Command`, `CommandInput`, `CommandList`, and `CommandItem` primitives. Keep the full catalog in memory, filter by code-point-stable input matching, and render at most:

```ts
const MAX_RENDERED_KILO_CODE_MODELS = 100

const matchingModels = modelIds.filter((modelId) =>
  modelId.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()),
)
const renderedModels = matchingModels.slice(0, MAX_RENDERED_KILO_CODE_MODELS)
```

Ensure the selected value replaces the last bounded result when it falls outside
the first 100, so the DOM never exceeds 100 model option rows. Offer the trimmed
custom search value when absent, expose `role="combobox"`, preserve keyboard
navigation through Command primitives, and show translated bounded-result copy.
Import this feature-local component directly from both dialogs; do not add it to
the shared UI barrel.

- [ ] **Step 6: Run focused tests and verify GREEN**

Run:

```powershell
pnpm vitest related tests/services/kiloCodeV7Selection.test.ts tests/components/KiloCodeDefaultModelSelect.test.tsx --run
```

Expected: PASS with no more than 100 option rows for 5,000 inputs.

- [ ] **Step 7: Commit the selection UI foundation**

```powershell
git add -- src/components/KiloCodeDefaultModelSelect.tsx src/components/kiloCodeExportTestIds.ts src/services/integrations/kiloCodeV7Selection.ts tests/components/KiloCodeDefaultModelSelect.test.tsx tests/services/kiloCodeV7Selection.test.ts
git commit -m "feat(kilocode): select bounded default models"
```

## Task 5: Upgrade the Single-profile Export Dialog

**Files:**

- Modify: `src/features/ApiCredentialProfiles/components/KiloCodeProfileExportDialog.tsx`
- Modify: `tests/features/ApiCredentialProfiles/components/KiloCodeProfileExportDialog.test.tsx`

- [ ] **Step 1: Add failing V7 catalog and readable-name tests**

Extend the component test's policy mock to inspect target-specific inputs. Assert that V7 sends the full discovered catalog and profile display name:

```tsx
expect(mockBuildKiloCodeExportOutput).toHaveBeenCalledWith({
  target: KILO_CODE_EXPORT_TARGETS.KiloV7,
  selections: [
    expect.objectContaining({
      selectionId: `profile:${profile.id}`,
      providerName: profile.name,
      discoveredModelIds: ["model-a", "model-b"],
      manualModelId: undefined,
    }),
  ],
  defaultModel: {
    selectionId: `profile:${profile.id}`,
    modelId: "model-a",
  },
})
```

Add tests for:

- target label is Default model for V7 and Model ID for legacy;
- entering a custom V7 default unions it into `manualModelId`;
- retry after discovery failure preserves the manual model;
- Remove manual model clears it and repairs the default;
- switching targets preserves separate V7 and legacy choices without refetching;
- V7 copy serializes `{ provider, model }`;
- V7 telemetry uses `output.modelCount`;
- an oversized download is blocked and single-profile recovery mentions copy/manual merge.

- [ ] **Step 2: Run the profile component test and verify RED**

Run:

```powershell
pnpm vitest related tests/features/ApiCredentialProfiles/components/KiloCodeProfileExportDialog.test.tsx --run
```

Expected: FAIL because the dialog still sends one shared tuple/model and lacks retry/remove/size behavior.

- [ ] **Step 3: Separate target-local state and extract a retryable loader**

Replace `modelId`/`modelOptions` with:

```ts
const selectionId = `profile:${profile.id}`
const [legacyModelId, setLegacyModelId] = useState("")
const [v7DefaultModelId, setV7DefaultModelId] = useState("")
const [v7ManualModelId, setV7ManualModelId] = useState("")
const [modelIds, setModelIds] = useState<string[]>([])
const [modelStatus, setModelStatus] = useState<ModelLoadStatus>(
  KILO_CODE_INVENTORY_STATUSES.Idle,
)
```

Use one `loadModels` callback for initial load and retry. On success, update `modelIds`, default both target-local choices only when absent, and never clear `v7ManualModelId`. On failure, set Error while preserving prior models/manual state.

- [ ] **Step 4: Build target-specific policy inputs**

Construct separate inputs:

```ts
const runtimeKey = {
  accountId: profile.id,
  siteName: profile.name,
  baseUrl: profile.baseUrl,
  tokenId: 0,
  tokenName: t("common:labels.apiKey"),
  tokenKey: profile.apiKey,
}

const v7Selection: KiloCodeV7ProviderSelection = {
  ...runtimeKey,
  selectionId,
  providerName: profile.name,
  discoveredModelIds: modelIds,
  ...(v7ManualModelId.trim()
    ? { manualModelId: v7ManualModelId.trim() }
    : {}),
}

const legacySelection: KiloCodeLegacySelection = {
  ...runtimeKey,
  legacyModelId,
}
```

Build the output only inside action handlers using the selected target. Use `output.downloadJson` for the Blob, `output.modelCount` for completion analytics, and block when `output.isDownloadTooLarge`.

- [ ] **Step 5: Render target-specific default/recovery controls**

For V7, render `KiloCodeDefaultModelSelect` with the discovered catalog and custom values. For Error/empty state render Retry plus a manual model input. Whenever `v7ManualModelId` is non-blank, render the value and an explicit Remove action; clearing it reconciles the default against discovered models.

For legacy, retain the existing `SearchableSelect` bound to `legacyModelId`. Do not share state between controls.

- [ ] **Step 6: Run related profile tests and compile**

Run:

```powershell
pnpm vitest related tests/features/ApiCredentialProfiles/components/KiloCodeProfileExportDialog.test.tsx tests/services/kiloCodeExportPolicy.test.ts --run
pnpm compile
```

Expected: PASS.

- [ ] **Step 7: Commit the single-profile flow**

```powershell
git add -- src/features/ApiCredentialProfiles/components/KiloCodeProfileExportDialog.tsx tests/features/ApiCredentialProfiles/components/KiloCodeProfileExportDialog.test.tsx
git commit -m "feat(kilocode): export profile model catalogs"
```

## Task 6: Upgrade the Multi-account Export Dialog

**Files:**

- Modify: `src/components/KiloCodeExportDialog.tsx`
- Modify: `tests/components/KiloCodeExportDialog.test.tsx`

- [ ] **Step 1: Add failing global-default and catalog tests**

Add behavior-level component tests for:

```tsx
expect(screen.getByRole("combobox", { name: "Default provider" })).toHaveValue(
  "site-a:7",
)
expect(screen.getByRole("combobox", { name: "Default model" })).toHaveValue(
  "model-a",
)

expect(mockBuildKiloCodeExportOutput).toHaveBeenCalledWith(
  expect.objectContaining({
    target: KILO_CODE_EXPORT_TARGETS.KiloV7,
    selections: expect.arrayContaining([
      expect.objectContaining({
        selectionId: "site-a:7",
        providerName: "Example - Default",
        discoveredModelIds: ["model-a", "model-b"],
      }),
    ]),
    defaultModel: { selectionId: "site-a:7", modelId: "model-a" },
  }),
)
```

Also cover:

- selecting a different default provider scopes the model control to that provider;
- duplicate provider names show disambiguated labels from prepared catalog facts;
- removing the current provider/model repairs the default deterministically;
- discovery error/empty exposes Retry and manual recovery per provider;
- retry success unions the manual model until Remove is clicked;
- a non-default provider's manual model can be removed;
- switching to legacy restores per-token single-model controls and does not refetch;
- V7 completion analytics uses prepared/output provider/model counts while `selectedCount` remains selected sites;
- oversized multi-account download advises fewer providers or manual copy/merge.

- [ ] **Step 2: Run the multi-account test and verify RED**

Run:

```powershell
pnpm vitest related tests/components/KiloCodeExportDialog.test.tsx --run
```

Expected: FAIL because the dialog still binds one model ID to every target and has no global default controls.

- [ ] **Step 3: Rename legacy state and add V7-local state**

Replace shared state with:

```ts
const [legacyModelIdByToken, setLegacyModelIdByToken] = useState<
  Record<string, string>
>({})
const [v7ManualModelIdByToken, setV7ManualModelIdByToken] = useState<
  Record<string, string>
>({})
const [v7DefaultModel, setV7DefaultModel] = useState<
  KiloCodeDefaultModelSelection | undefined
>()
```

Reset all three only when the dialog closes. Model loads default `legacyModelIdByToken` when absent but do not write V7 manual/default state directly.

- [ ] **Step 4: Build unresolved V7/legacy inputs once**

Map selected sites/tokens into target-specific input arrays. V7 input uses:

```ts
{
  ...runtimeKey,
  selectionId: tokenSelectionKey,
  providerName: `${getSiteDisplayName(site)} - ${getTokenLabel(token, tokenFallback)}`,
  discoveredModelIds: modelInventories[tokenSelectionKey]?.modelIds ?? [],
  manualModelId: v7ManualModelIdByToken[tokenSelectionKey],
}
```

Legacy uses `legacyModelIdByToken[tokenSelectionKey]`. Prepare the unresolved V7 catalog with masked/current token values only for UI facts; continue resolving real secrets immediately before copy/download and rebuild the same prepared catalog with resolved keys. Never log either payload.

- [ ] **Step 5: Reconcile and render the global default controls**

Use an effect driven by the prepared V7 catalog:

```ts
useEffect(() => {
  setV7DefaultModel((current) =>
    reconcileKiloCodeV7DefaultSelection(preparedV7Catalog, current),
  )
}, [preparedV7Catalog])
```

Render a Default provider `SearchableSelect` from prepared providers and a `KiloCodeDefaultModelSelect` scoped to the selected provider. Updating the provider immediately reconciles to its first model. Use opaque selection IDs, never delimiter-parsed provider/model values.

- [ ] **Step 6: Render target-specific provider model controls**

When V7 is selected, provider rows show status/count, Retry on Error/empty, manual recovery input, and a visible Remove manual model action whenever a manual value exists. When legacy is selected, retain the current per-token model select bound to `legacyModelIdByToken`.

Compute `canExport` separately:

```ts
const canExportV7 =
  preparedV7Catalog.providers.length > 0 &&
  preparedV7Catalog.providers.every((provider) => provider.modelIds.length > 0) &&
  Boolean(v7DefaultModel)

const canExportLegacy =
  legacySelections.length > 0 &&
  legacySelections.every((selection) => selection.legacyModelId?.trim())
```

- [ ] **Step 7: Route copy/download and analytics through the discriminated policy**

For V7 pass resolved selections and `v7DefaultModel`; for legacy pass resolved legacy selections and current profile name. Use `output.downloadJson`, block oversized downloads, copy `output.copyPayload`, and complete analytics with:

```ts
{
  selectedCount: selectedSiteIds.length,
  itemCount: output.itemCount,
  modelCount: output.modelCount,
  kiloCodeExportTarget: getKiloCodeExportAnalyticsTarget(exportTarget),
}
```

- [ ] **Step 8: Run related tests and compile**

Run:

```powershell
pnpm vitest related tests/components/KiloCodeExportDialog.test.tsx tests/services/kiloCodeV7Selection.test.ts tests/services/kiloCodeExportPolicy.test.ts --run
pnpm compile
```

Expected: PASS; switching targets performs no additional model loads or secret resolution.

- [ ] **Step 9: Commit the multi-account flow**

```powershell
git add -- src/components/KiloCodeExportDialog.tsx tests/components/KiloCodeExportDialog.test.tsx
git commit -m "feat(kilocode): export account model catalogs"
```

## Task 7: Synchronize Guidance, Locales, and User Documentation

**Files:**

- Modify: `src/components/KiloCodeExportGuidance.tsx`
- Modify: `tests/test-utils/kiloCodeExportGuidance.ts`
- Modify: `tests/components/KiloCodeExportDialog.test.tsx`
- Modify: `tests/features/ApiCredentialProfiles/components/KiloCodeProfileExportDialog.test.tsx`
- Modify: `src/locales/{en,es-419,ja,vi,zh-CN,zh-TW}/ui.json`
- Modify: `docs/docs/key-management.md`
- Modify: `docs/docs/api-credential-profiles.md`
- Modify: `docs/docs/supported-export-tools.md`

- [ ] **Step 1: Add failing copy/guidance assertions**

Update guidance helpers and component assertions to require:

- V7 copy contains both top-level `provider` and `model`;
- imported providers show readable names;
- the default provider/model is selected separately from the exported catalog;
- legacy still copies `providerProfiles.apiConfigs`;
- oversized single-profile guidance says copy/manual merge;
- oversized multi-account guidance offers fewer providers or copy/manual merge.

Run:

```powershell
pnpm vitest related tests/components/KiloCodeExportDialog.test.tsx tests/features/ApiCredentialProfiles/components/KiloCodeProfileExportDialog.test.tsx --run
```

Expected: FAIL on missing translation keys/copy.

- [ ] **Step 2: Add synchronized app-locale keys**

Add the same shape to every `ui.json` locale under `dialog.kiloCode`, including:

```json
{
  "labels": {
    "defaultProvider": "Default provider",
    "defaultModel": "Default model",
    "legacyModelId": "Model ID"
  },
  "actions": {
    "retryModels": "Retry model discovery",
    "removeManualModel": "Remove manual model"
  },
  "messages": {
    "modelSearchLimited": "Showing the first {{visible}} of {{count}} models. Keep typing to narrow the list.",
    "v7ProviderModelsRequired": "Enter a model ID, retry discovery, or deselect this provider.",
    "settingsFileTooLargeSingle": "This file is too large for Kilo Code import. Copy the configuration and merge it manually.",
    "settingsFileTooLargeMultiple": "This file is too large for Kilo Code import. Select fewer providers, or copy the configuration and merge it manually."
  }
}
```

Translate naturally in Chinese, Traditional Chinese, Japanese, Spanish, Vietnamese, and English. Do not use `defaultValue` to hide missing locale entries.

Use these exact localized values for the new keys (merge them into the existing
`dialog.kiloCode` shape rather than creating a parallel object):

```jsonc
// zh-CN
{
  "defaultProvider": "默认供应商",
  "defaultModel": "默认模型",
  "legacyModelId": "模型 ID",
  "retryModels": "重试获取模型",
  "removeManualModel": "移除手动模型",
  "modelSearchLimited": "仅显示前 {{visible}} 个（共 {{count}} 个）模型，请继续输入以缩小范围。",
  "v7ProviderModelsRequired": "请输入模型 ID、重试获取模型，或取消选择此供应商。",
  "settingsFileTooLargeSingle": "此文件超过 Kilo Code 的导入大小限制。请复制配置并手动合并。",
  "settingsFileTooLargeMultiple": "此文件超过 Kilo Code 的导入大小限制。请选择更少的供应商，或复制配置并手动合并。"
}

// zh-TW
{
  "defaultProvider": "預設供應商",
  "defaultModel": "預設模型",
  "legacyModelId": "模型 ID",
  "retryModels": "重試取得模型",
  "removeManualModel": "移除手動模型",
  "modelSearchLimited": "僅顯示前 {{visible}} 個（共 {{count}} 個）模型，請繼續輸入以縮小範圍。",
  "v7ProviderModelsRequired": "請輸入模型 ID、重試取得模型，或取消選取此供應商。",
  "settingsFileTooLargeSingle": "此檔案超過 Kilo Code 的匯入大小限制。請複製設定並手動合併。",
  "settingsFileTooLargeMultiple": "此檔案超過 Kilo Code 的匯入大小限制。請選取較少的供應商，或複製設定並手動合併。"
}

// ja
{
  "defaultProvider": "既定のプロバイダー",
  "defaultModel": "既定のモデル",
  "legacyModelId": "モデル ID",
  "retryModels": "モデル検出を再試行",
  "removeManualModel": "手動モデルを削除",
  "modelSearchLimited": "{{count}} 件中、最初の {{visible}} 件を表示しています。入力を続けて絞り込んでください。",
  "v7ProviderModelsRequired": "モデル ID を入力するか、モデル検出を再試行するか、このプロバイダーの選択を解除してください。",
  "settingsFileTooLargeSingle": "このファイルは Kilo Code のインポート上限を超えています。設定をコピーして手動で統合してください。",
  "settingsFileTooLargeMultiple": "このファイルは Kilo Code のインポート上限を超えています。プロバイダーを減らすか、設定をコピーして手動で統合してください。"
}

// es-419
{
  "defaultProvider": "Proveedor predeterminado",
  "defaultModel": "Modelo predeterminado",
  "legacyModelId": "ID del modelo",
  "retryModels": "Reintentar detección de modelos",
  "removeManualModel": "Quitar modelo manual",
  "modelSearchLimited": "Se muestran los primeros {{visible}} de {{count}} modelos. Sigue escribiendo para reducir la lista.",
  "v7ProviderModelsRequired": "Ingresa un ID de modelo, reintenta la detección o deselecciona este proveedor.",
  "settingsFileTooLargeSingle": "Este archivo supera el límite de importación de Kilo Code. Copia la configuración y combínala manualmente.",
  "settingsFileTooLargeMultiple": "Este archivo supera el límite de importación de Kilo Code. Selecciona menos proveedores o copia la configuración y combínala manualmente."
}

// vi
{
  "defaultProvider": "Nhà cung cấp mặc định",
  "defaultModel": "Mô hình mặc định",
  "legacyModelId": "ID mô hình",
  "retryModels": "Thử tìm mô hình lại",
  "removeManualModel": "Xóa mô hình nhập thủ công",
  "modelSearchLimited": "Chỉ hiển thị {{visible}} mô hình đầu tiên trong tổng số {{count}}. Hãy tiếp tục nhập để thu hẹp danh sách.",
  "v7ProviderModelsRequired": "Hãy nhập ID mô hình, thử tìm mô hình lại hoặc bỏ chọn nhà cung cấp này.",
  "settingsFileTooLargeSingle": "Tệp này vượt quá giới hạn nhập của Kilo Code. Hãy sao chép cấu hình và hợp nhất thủ công.",
  "settingsFileTooLargeMultiple": "Tệp này vượt quá giới hạn nhập của Kilo Code. Hãy chọn ít nhà cung cấp hơn hoặc sao chép cấu hình và hợp nhất thủ công."
}
```

- [ ] **Step 3: Update target guidance and Chinese source docs**

Explain that Kilo 7.x:

- imports readable provider names;
- includes the full model catalog reported for each key;
- uses one explicit default provider/model;
- copies a mergeable `{ provider, model }` top-level fragment;
- may still show an empty API-key editor field because Kilo stores imported inline keys separately from editor auth state, while runtime use remains valid.

Keep legacy wording explicitly single-model and do not manually edit generated `docs/docs/en/**` or `docs/docs/ja/**` pages.

- [ ] **Step 4: Run locale extraction and related tests**

Run:

```powershell
pnpm run i18n:extract:ci
pnpm vitest related tests/components/KiloCodeExportDialog.test.tsx tests/features/ApiCredentialProfiles/components/KiloCodeProfileExportDialog.test.tsx --run
```

Expected: PASS with no locale shape drift or extracted updates.

- [ ] **Step 5: Commit localized guidance**

```powershell
git add -- src/components/KiloCodeExportGuidance.tsx tests/test-utils/kiloCodeExportGuidance.ts tests/components/KiloCodeExportDialog.test.tsx tests/features/ApiCredentialProfiles/components/KiloCodeProfileExportDialog.test.tsx src/locales/en/ui.json src/locales/es-419/ui.json src/locales/ja/ui.json src/locales/vi/ui.json src/locales/zh-CN/ui.json src/locales/zh-TW/ui.json docs/docs/key-management.md docs/docs/api-credential-profiles.md docs/docs/supported-export-tools.md
git commit -m "docs(kilocode): explain provider catalog exports"
```

## Task 8: Update Browser Coverage and Run the Release Gates

**Files:**

- Modify: `e2e/apiCredentialProfilesOptionsActions.spec.ts`

- [ ] **Step 1: Make the existing V7 download E2E fail on the richer contract**

Update the existing `downloads Kilo Code settings for an API credential profile` scenario so the mocked `/models` response contains at least two IDs. Assert:

```ts
expect(Object.values(v7Settings.provider)[0]).toMatchObject({
  name: "Example Profile",
  models: {
    "example-model-a": { name: "example-model-a" },
    "example-model-b": { name: "example-model-b" },
  },
})
expect(v7Settings.model).toMatch(/\/example-model-a$/)
```

Retain the existing legacy filename and single `openAiModelId` assertion in the same scenario.

- [ ] **Step 2: Run the focused E2E and verify RED**

Run:

```powershell
pnpm playwright test e2e/apiCredentialProfilesOptionsActions.spec.ts --grep "downloads Kilo Code settings"
```

Expected: FAIL because the current payload omits provider `name` and the second model.

- [ ] **Step 3: Use the feature-local stable selectors from Task 4**

Import `KILO_CODE_EXPORT_TEST_IDS.defaultModel` when Playwright must select the
default. Do not add another selector, and do not locate workflow-critical
controls by translated copy, CSS class, or position. Keep visible text
assertions only for outcomes.

- [ ] **Step 4: Run the E2E and verify GREEN**

Run the Step 2 command.

Expected: PASS for V7 multi-model/name/default and legacy single-model download.

- [ ] **Step 5: Run the focused unit/component suite**

Run:

```powershell
pnpm vitest related tests/services/kiloCodeV7Catalog.test.ts tests/services/kiloCodeExport.test.ts tests/services/kiloCodeExportPolicy.test.ts tests/services/kiloCodeV7Selection.test.ts tests/components/KiloCodeDefaultModelSelect.test.tsx tests/components/KiloCodeExportDialog.test.tsx tests/features/ApiCredentialProfiles/components/KiloCodeProfileExportDialog.test.tsx --run
```

Expected: PASS with zero failed files/tests.

- [ ] **Step 6: Run extraction, commit-equivalent, and push-equivalent validation**

Run:

```powershell
pnpm run i18n:extract:ci
pnpm run validate:staged
pnpm run validate:push
```

Before `validate:staged`, stage only the task-scoped files that remain after the prior commits. Expected: all commands PASS; `validate:push` covers compile and `knip` for the new exports/files.

- [ ] **Step 7: Inspect final scope and runtime-verification status**

Run:

```powershell
git status --short
git diff origin/main...HEAD --stat
git diff origin/main...HEAD --check
rg -n "\[DEBUG-|console\.log|TODO|FIXME" src/services/integrations src/components/KiloCodeExportDialog.tsx src/components/KiloCodeDefaultModelSelect.tsx src/features/ApiCredentialProfiles/components/KiloCodeProfileExportDialog.tsx
```

Expected: only task commits/files, no debug instrumentation, no whitespace errors, and no unrelated changes.

If a real Kilo Code environment is available, import the generated file and verify readable provider name, multiple switchable models, and the selected default. If unavailable, report the manual runtime check as residual risk rather than claiming end-to-end verification.

- [ ] **Step 8: Commit the E2E slice if it was not included earlier**

```powershell
git add -- e2e/apiCredentialProfilesOptionsActions.spec.ts
git commit -m "test(kilocode): cover provider catalog downloads"
```

Skip this commit only if the files are already clean because their changes were committed with the owning implementation slice.

## Implementation Review Gates

After each implementation task:

1. Review spec compliance against `docs/superpowers/specs/2026-07-17-kilo-code-provider-catalog-export-design.md`.
2. Review code quality, especially duplicate normalization, target-state leakage, oversized component growth, and accidental legacy behavior changes.
3. Do not proceed while material findings remain unresolved.

Before final handoff, explicitly report:

- telemetry decision: reuse existing actions; normalized V7 model counts;
- E2E decision: update the existing single-profile browser download scenario;
- maintainability decision: shared V7 preparation/selection boundaries, no duplicate dialog normalization;
- runtime verification: completed in real Kilo Code or listed as an unverified manual step.
