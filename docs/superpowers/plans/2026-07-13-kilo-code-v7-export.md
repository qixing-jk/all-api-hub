# Kilo Code 7.x Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a standards-compliant Kilo Code 7.x settings export as the default while preserving the existing Roo Code / Kilo Code 5.x legacy export.

**Architecture:** Keep the legacy `providerProfiles` builders unchanged, add a separate pure Kilo 7.x builder, and place target-specific filenames/copy payloads behind a shared output policy. Both existing dialogs select the target locally and reuse their current key/model loading; analytics records only a controlled target enum.

**Tech Stack:** TypeScript, React, i18next, Vitest, Testing Library, Playwright, WXT, pnpm.

---

## File and Responsibility Map

- Modify `src/services/integrations/kiloCodeExport.ts`: legacy contract, Kilo 7.x contract, stable provider IDs, and target constants.
- Create `src/services/integrations/kiloCodeExportPolicy.ts`: target-specific output descriptor used by both dialogs.
- Modify `tests/services/kiloCodeExport.test.ts`: pure schema and validation coverage.
- Create `tests/services/kiloCodeExportPolicy.test.ts`: filenames, copy payloads, and legacy preservation.
- Modify `src/services/productAnalytics/contracts.ts`: controlled Kilo export-target constants/type and event schema.
- Modify `src/services/productAnalytics/actions.ts`: action-insight type and snake-case serialization.
- Modify `tests/services/productAnalytics/actions.test.ts`: privacy-safe target serialization.
- Modify `src/features/ApiCredentialProfiles/components/KiloCodeProfileExportDialog.tsx`: default target selector and shared output policy.
- Modify `tests/features/ApiCredentialProfiles/components/KiloCodeProfileExportDialog.test.tsx`: target switching, output, loading, and analytics behavior.
- Modify `src/components/KiloCodeExportDialog.tsx`: multi-account target selector and shared output policy.
- Modify `tests/components/KiloCodeExportDialog.test.tsx`: resolved-secret output and target switching.
- Modify `src/locales/{en,es-419,ja,vi,zh-CN,zh-TW}/ui.json`: target labels, target-specific actions/help, and local errors.
- Modify `src/locales/{en,es-419,ja,vi,zh-CN,zh-TW}/keyManagement.json`: action wording that no longer implies only one Kilo format.
- Modify `docs/docs/key-management.md`, `docs/docs/api-credential-profiles.md`, and `docs/docs/supported-export-tools.md`: Chinese source documentation for Kilo 7.x and legacy selection.
- Modify `e2e/apiCredentialProfilesOptionsActions.spec.ts`: representative Kilo 7.x download contract plus retained legacy regression.

## Task 1: Add the Pure Kilo Code 7.x Builder

**Files:**

- Modify: `src/services/integrations/kiloCodeExport.ts`
- Modify: `tests/services/kiloCodeExport.test.ts`

- [ ] **Step 1: Add failing tests for the official Kilo 7.x payload**

Add imports for `buildKiloCodeV7SettingsFile` and `KILO_CODE_EXPORT_TARGETS`, then add a test using reserved examples:

```ts
it("builds an importable Kilo Code 7.x settings file", () => {
  const result = buildKiloCodeV7SettingsFile({
    selections: [
      {
        accountId: "account-a",
        siteName: "Example",
        baseUrl: "https://api.example.invalid",
        tokenId: 7,
        tokenName: "Default",
        tokenKey: "example-key",
        modelId: "example-model",
      },
    ],
    now: () => new Date("2026-07-13T00:00:00.000Z"),
  })

  const [providerId] = Object.keys(result.provider)
  expect(result).toEqual({
    _meta: {
      version: 1,
      exportedAt: "2026-07-13T00:00:00.000Z",
    },
    provider: {
      [providerId!]: {
        npm: "@ai-sdk/openai-compatible",
        models: {
          "example-model": { name: "example-model" },
        },
        options: {
          apiKey: "example-key",
          baseURL: "https://api.example.invalid/v1",
        },
      },
    },
    model: `${providerId}/example-model`,
  })
})
```

Also assert that `KILO_CODE_EXPORT_TARGETS.KiloV7 === "kilo-v7"` and `Legacy === "legacy"`.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
pnpm vitest related tests/services/kiloCodeExport.test.ts --run
```

Expected: FAIL because `buildKiloCodeV7SettingsFile` and `KILO_CODE_EXPORT_TARGETS` do not exist.

- [ ] **Step 3: Add target types and the minimal Kilo 7.x schema**

Add these public contracts without changing `buildKiloCodeApiConfigs` or `buildKiloCodeSettingsFile`:

```ts
export const KILO_CODE_EXPORT_TARGETS = {
  KiloV7: "kilo-v7",
  Legacy: "legacy",
} as const

export type KiloCodeExportTarget =
  (typeof KILO_CODE_EXPORT_TARGETS)[keyof typeof KILO_CODE_EXPORT_TARGETS]

interface KiloCodeV7Provider {
  npm: "@ai-sdk/openai-compatible"
  models: Record<string, { name: string }>
  options: {
    apiKey: string
    baseURL: string
  }
}

export interface KiloCodeV7SettingsFile {
  _meta: {
    version: 1
    exportedAt: string
  }
  provider: Record<string, KiloCodeV7Provider>
  model: string
}
```

Implement `buildKiloCodeV7SettingsFile` with an injected clock and a concise source comment pinned to upstream commit `3cb82a0907f888749435c1d208e56d8365747df2`. Use `coerceBaseUrlToPathSuffix` for `/v1` normalization.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run the Step 2 command.

Expected: PASS for the existing legacy tests and new Kilo 7.x happy path.

- [ ] **Step 5: Add failing stability, collision, and validation tests**

Add behavior-level tests that prove:

```ts
expect(firstProviderId).toBe(secondProviderId)
expect(new Set(providerIds).size).toBe(2)
expect(providerIds.every((id) => /^[a-z0-9][a-z0-9-]*$/.test(id))).toBe(true)
expect(() => buildKiloCodeV7SettingsFile({ selections: [], now })).toThrow(
  "Select at least one runtime key",
)
```

Use table cases for blank `tokenKey`, blank `modelId`, and invalid `baseUrl`. Add a duplicate-ID test through an optional `generateProviderId` dependency:

```ts
expect(() =>
  buildKiloCodeV7SettingsFile({
    selections: twoSelections,
    now,
    generateProviderId: () => "duplicate-provider",
  }),
).toThrow("Kilo Code provider IDs must be unique")
```

- [ ] **Step 6: Run the new edge tests and verify RED**

Run the Step 2 command.

Expected: FAIL on missing validation, unstable/invalid IDs, or silent duplicate overwrite.

- [ ] **Step 7: Implement stable provider IDs and boundary validation**

Add focused private helpers:

```ts
function slugifyProviderName(value: string): string {
  const slug = value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
  return slug || "provider"
}

function hashProviderIdentity(value: string): string {
  let hash = 2166136261
  for (const character of value) {
    hash ^= character.charCodeAt(0)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16).padStart(8, "0")
}
```

Build digest input from `accountId`, normalized base URL, `tokenId`, and trimmed `tokenName`; never include `tokenKey`. Validate all selections before constructing the provider record. Parse the normalized base URL with `new URL(...)` and require `http:` or `https:`.

- [ ] **Step 8: Run focused tests and type-check the file**

Run:

```powershell
pnpm vitest related tests/services/kiloCodeExport.test.ts --run
pnpm exec tsc --noEmit --pretty false
```

Expected: PASS with no TypeScript errors.

- [ ] **Step 9: Commit the pure builder slice**

```powershell
git add -- src/services/integrations/kiloCodeExport.ts tests/services/kiloCodeExport.test.ts
git commit -m "feat(kilocode): build v7 settings exports"
```

## Task 2: Centralize Target-specific Output Policy

**Files:**

- Create: `src/services/integrations/kiloCodeExportPolicy.ts`
- Create: `tests/services/kiloCodeExportPolicy.test.ts`
- Modify: `src/services/integrations/kiloCodeExport.ts`

- [ ] **Step 1: Write failing policy tests**

Create tests for both targets:

```ts
it("describes Kilo 7.x download and copy output", () => {
  const output = buildKiloCodeExportOutput({
    target: KILO_CODE_EXPORT_TARGETS.KiloV7,
    selections,
    currentLegacyProfileName: "Example - Default",
    now,
  })

  expect(output.filename).toBe("kilo-settings.json")
  expect(output.downloadPayload).toMatchObject({ provider: expect.any(Object) })
  expect(output.copyPayload).toEqual(output.downloadPayload.provider)
})

it("preserves the legacy filename and payload", () => {
  const output = buildKiloCodeExportOutput({
    target: KILO_CODE_EXPORT_TARGETS.Legacy,
    selections,
    currentLegacyProfileName: "Example - Default",
    now,
  })

  expect(output.filename).toBe("kilo-code-settings.json")
  expect(output.downloadPayload).toEqual({
    providerProfiles: {
      currentApiConfigName: "Example - Default",
      apiConfigs: output.copyPayload,
    },
  })
})
```

- [ ] **Step 2: Run the policy tests and verify RED**

Run:

```powershell
pnpm vitest related tests/services/kiloCodeExportPolicy.test.ts --run
```

Expected: FAIL because the policy module does not exist.

- [ ] **Step 3: Implement the discriminated output descriptor**

Create:

```ts
export interface BuildKiloCodeExportOutputOptions {
  target: KiloCodeExportTarget
  selections: KiloCodeExportTuple[]
  currentLegacyProfileName: string
  now?: () => Date
}

export interface KiloCodeExportOutput {
  filename: "kilo-settings.json" | "kilo-code-settings.json"
  copyPayload: Record<string, unknown>
  downloadPayload: KiloCodeV7SettingsFile | ReturnType<typeof buildKiloCodeSettingsFile>
  itemCount: number
}
```

`buildKiloCodeExportOutput` dispatches to the existing legacy builders or the new Kilo 7.x builder. It throws when the legacy target has no valid `currentLegacyProfileName`; it does not translate errors or access browser globals.

Export the legacy settings return type from `kiloCodeExport.ts` instead of duplicating its shape.

- [ ] **Step 4: Run policy and builder tests**

Run:

```powershell
pnpm vitest related tests/services/kiloCodeExport.test.ts tests/services/kiloCodeExportPolicy.test.ts --run
```

Expected: PASS.

- [ ] **Step 5: Commit the output-policy slice**

```powershell
git add -- src/services/integrations/kiloCodeExport.ts src/services/integrations/kiloCodeExportPolicy.ts tests/services/kiloCodeExportPolicy.test.ts
git commit -m "refactor(kilocode): centralize export target output"
```

## Task 3: Add Privacy-safe Export-target Analytics

**Files:**

- Modify: `src/services/productAnalytics/contracts.ts`
- Modify: `src/services/productAnalytics/actions.ts`
- Modify: `tests/services/productAnalytics/actions.test.ts`

- [ ] **Step 1: Write a failing analytics serialization test**

Add a completion case:

```ts
tracker.complete(PRODUCT_ANALYTICS_RESULTS.Success, {
  insights: {
    kiloCodeExportTarget: PRODUCT_ANALYTICS_KILO_CODE_EXPORT_TARGETS.KiloV7,
    itemCount: 2,
  },
})

expect(mockTrackProductAnalyticsEvent).toHaveBeenCalledWith(
  PRODUCT_ANALYTICS_EVENT_NAMES.ActionCompleted,
  expect.objectContaining({
    kilo_code_export_target: "kilo-v7",
    item_count: 2,
  }),
)
```

- [ ] **Step 2: Run the analytics test and verify RED**

Run:

```powershell
pnpm vitest related tests/services/productAnalytics/actions.test.ts --run
```

Expected: FAIL because the target contract and serialized field do not exist.

- [ ] **Step 3: Add the controlled contract and serializer**

In `contracts.ts` add:

```ts
export const PRODUCT_ANALYTICS_KILO_CODE_EXPORT_TARGETS = {
  KiloV7: "kilo-v7",
  Legacy: "legacy",
} as const

export type ProductAnalyticsKiloCodeExportTarget =
  (typeof PRODUCT_ANALYTICS_KILO_CODE_EXPORT_TARGETS)[keyof typeof PRODUCT_ANALYTICS_KILO_CODE_EXPORT_TARGETS]
```

Add optional `kilo_code_export_target` to the typed action-completion payload. In `actions.ts`, add `kiloCodeExportTarget?: ProductAnalyticsKiloCodeExportTarget` to `ProductAnalyticsActionInsights` and serialize only that controlled value as `kilo_code_export_target`.

- [ ] **Step 4: Run analytics tests and compile**

Run:

```powershell
pnpm vitest related tests/services/productAnalytics/actions.test.ts --run
pnpm compile
```

Expected: PASS; no arbitrary strings, URLs, models, or keys enter the event.

- [ ] **Step 5: Commit analytics support**

```powershell
git add -- src/services/productAnalytics/contracts.ts src/services/productAnalytics/actions.ts tests/services/productAnalytics/actions.test.ts
git commit -m "feat(analytics): classify Kilo export targets"
```

## Task 4: Upgrade the API Credential Profile Dialog

**Files:**

- Modify: `src/features/ApiCredentialProfiles/components/KiloCodeProfileExportDialog.tsx`
- Modify: `tests/features/ApiCredentialProfiles/components/KiloCodeProfileExportDialog.test.tsx`

- [ ] **Step 1: Replace builder mocks with the shared policy mock and add a failing default-target test**

Mock `buildKiloCodeExportOutput` to return target-specific descriptors. Assert:

```ts
expect(screen.getByRole("combobox", { name: "ui:dialog.kiloCode.labels.exportTarget" })).toHaveValue("kilo-v7")
expect(mockBuildKiloCodeExportOutput).toHaveBeenCalledWith(
  expect.objectContaining({ target: "kilo-v7" }),
)
```

Click Download and assert the anchor filename is `kilo-settings.json` and the parsed Blob matches the policy's Kilo 7 payload.

- [ ] **Step 2: Run the component test and verify RED**

Run:

```powershell
pnpm vitest related tests/features/ApiCredentialProfiles/components/KiloCodeProfileExportDialog.test.tsx --run
```

Expected: FAIL because there is no target selector and the dialog calls legacy builders directly.

- [ ] **Step 3: Add local target state and policy-driven actions**

Initialize target state on open:

```ts
const [exportTarget, setExportTarget] = useState<KiloCodeExportTarget>(
  KILO_CODE_EXPORT_TARGETS.KiloV7,
)
```

Reset it to Kilo 7.x when the dialog opens. Render a `FormField` plus `SearchableSelect` with exactly two options. Build one `KiloCodeExportTuple`, then use `buildKiloCodeExportOutput` in copy/download handlers so secrets remain resolved only through existing profile data.

Add `kiloCodeExportTarget` to success and failure insights, mapping from the shared target to the matching analytics constant.

- [ ] **Step 4: Add a failing target-switch test**

Switch the combobox to `legacy`, then assert:

```ts
expect(mockBuildKiloCodeExportOutput).toHaveBeenLastCalledWith(
  expect.objectContaining({ target: "legacy" }),
)
expect(fetchOpenAICompatibleModelIds).toHaveBeenCalledTimes(1)
```

Copy and download should use legacy policy payloads and `kilo-code-settings.json`. Analytics must contain the legacy target.

- [ ] **Step 5: Run tests, implement any minimal state/error corrections, and verify GREEN**

Run the Step 2 command.

Expected: PASS, including existing no-model and copy/download failure coverage.

- [ ] **Step 6: Commit the profile-dialog slice**

```powershell
git add -- src/features/ApiCredentialProfiles/components/KiloCodeProfileExportDialog.tsx tests/features/ApiCredentialProfiles/components/KiloCodeProfileExportDialog.test.tsx
git commit -m "feat(kilocode): select profile export format"
```

## Task 5: Upgrade the Multi-account Dialog

**Files:**

- Modify: `src/components/KiloCodeExportDialog.tsx`
- Modify: `tests/components/KiloCodeExportDialog.test.tsx`

- [ ] **Step 1: Add a failing default-target download test**

Mock `buildKiloCodeExportOutput` and keep `buildResolvedExportSelections` observable through the existing token-secret mocks. Assert the target selector defaults to `kilo-v7`, the downloaded filename is `kilo-settings.json`, and the policy receives resolved—not masked—keys.

- [ ] **Step 2: Run the component test and verify RED**

Run:

```powershell
pnpm vitest related tests/components/KiloCodeExportDialog.test.tsx --run
```

Expected: FAIL because the dialog still creates only a legacy payload.

- [ ] **Step 3: Route copy and download through the shared policy**

Add the same local target type/default and selector used by the profile dialog. Preserve `profileNames` and `currentApiConfigName` solely for legacy output. In each action:

```ts
const output = buildKiloCodeExportOutput({
  target: exportTarget,
  selections: resolvedSelections,
  currentLegacyProfileName: effectiveCurrentApiConfigName,
})
```

Copy `output.copyPayload`; download `output.downloadPayload` with `output.filename`. Include the controlled analytics target on success and failure. Do not move token loading, key resolution, model selection, or quick-create behavior.

- [ ] **Step 4: Add target-switch and no-refetch assertions**

Switch to legacy and verify legacy copy/download payloads. Assert target switching does not call token inventory/model loading functions again and does not invoke secret resolution until the user copies or downloads.

- [ ] **Step 5: Run related dialog tests and compile**

Run:

```powershell
pnpm vitest related tests/components/KiloCodeExportDialog.test.tsx tests/features/ApiCredentialProfiles/components/KiloCodeProfileExportDialog.test.tsx --run
pnpm compile
```

Expected: PASS.

- [ ] **Step 6: Commit the multi-account dialog slice**

```powershell
git add -- src/components/KiloCodeExportDialog.tsx tests/components/KiloCodeExportDialog.test.tsx
git commit -m "feat(kilocode): select account export format"
```

## Task 6: Synchronize Locales and Chinese Documentation

**Files:**

- Modify: `src/locales/en/ui.json`
- Modify: `src/locales/es-419/ui.json`
- Modify: `src/locales/ja/ui.json`
- Modify: `src/locales/vi/ui.json`
- Modify: `src/locales/zh-CN/ui.json`
- Modify: `src/locales/zh-TW/ui.json`
- Modify: `src/locales/en/keyManagement.json`
- Modify: `src/locales/es-419/keyManagement.json`
- Modify: `src/locales/ja/keyManagement.json`
- Modify: `src/locales/vi/keyManagement.json`
- Modify: `src/locales/zh-CN/keyManagement.json`
- Modify: `src/locales/zh-TW/keyManagement.json`
- Modify: `docs/docs/key-management.md`
- Modify: `docs/docs/api-credential-profiles.md`
- Modify: `docs/docs/supported-export-tools.md`

- [ ] **Step 1: Add the complete locale key family in all six locales**

Under `ui:dialog.kiloCode`, add shape-identical keys:

```json
{
  "actions": {
    "copyKiloV7Provider": "Copy provider config",
    "copyLegacyApiConfigs": "Copy legacy apiConfigs",
    "downloadKiloV7Settings": "Download Kilo 7.x settings",
    "downloadLegacySettings": "Download legacy settings"
  },
  "labels": {
    "exportTarget": "Export target"
  },
  "targets": {
    "kiloV7": "Kilo Code 7.x",
    "legacy": "Roo Code / Kilo Code 5.x (legacy)"
  },
  "help": {
    "kiloV7Title": "Kilo Code 7.x import",
    "kiloV7Description": "In Kilo Code, open About Kilo Code, choose Import, review the imported draft, then save it.",
    "legacyTitle": "Legacy import",
    "legacyDescription": "Use this format with Roo Code or Kilo Code 5.x. It is not the native Kilo Code 7.x settings format."
  }
}
```

Translate naturally in each locale rather than copying English. Update the existing export action label so it remains target-neutral. Remove or rewrite the old unconditional incremental-import claim.

- [ ] **Step 2: Run extraction consistency and inspect the locale diff**

Run:

```powershell
pnpm run i18n:extract:ci
git diff -- src/locales
```

Expected: extraction reports no unexpected updates; all six locale trees have the same new key shape and no existing required key disappears.

- [ ] **Step 3: Update Chinese source documentation**

Document that Kilo 7.x is the default, imports `kilo-settings.json` through About Kilo Code -> Import, and that the selector retains Roo Code / Kilo 5.x legacy output. Do not manually edit `docs/docs/en/**` or `docs/docs/ja/**` generated documentation.

- [ ] **Step 4: Run related component tests with real translations**

Run:

```powershell
pnpm vitest related tests/components/KiloCodeExportDialog.test.tsx tests/features/ApiCredentialProfiles/components/KiloCodeProfileExportDialog.test.tsx --run
```

Expected: PASS with no missing translation warnings.

- [ ] **Step 5: Commit locale and documentation parity**

```powershell
git add -- src/locales/en/ui.json src/locales/es-419/ui.json src/locales/ja/ui.json src/locales/vi/ui.json src/locales/zh-CN/ui.json src/locales/zh-TW/ui.json src/locales/en/keyManagement.json src/locales/es-419/keyManagement.json src/locales/ja/keyManagement.json src/locales/vi/keyManagement.json src/locales/zh-CN/keyManagement.json src/locales/zh-TW/keyManagement.json docs/docs/key-management.md docs/docs/api-credential-profiles.md docs/docs/supported-export-tools.md
git commit -m "docs(kilocode): explain v7 and legacy exports"
```

## Task 7: Lock the Browser-level Download Contract

**Files:**

- Modify: `e2e/apiCredentialProfilesOptionsActions.spec.ts`

- [ ] **Step 1: Update the primary E2E assertion to Kilo 7.x**

Parse the downloaded file and assert the public contract:

```ts
expect(download.suggestedFilename()).toBe("kilo-settings.json")
expect(settings._meta?.version).toBe(1)

const providerEntries = Object.entries(settings.provider ?? {})
expect(providerEntries).toHaveLength(1)
const [providerId, provider] = providerEntries[0]!
expect(provider).toMatchObject({
  npm: "@ai-sdk/openai-compatible",
  options: {
    apiKey: "sk-kilo-export-profile",
    baseURL: "https://kilo-export.example.com/v1",
  },
})
expect(Object.keys(provider.models ?? {})).toContain("gpt-kilo-export")
expect(settings.model).toBe(`${providerId}/gpt-kilo-export`)
```

Use the existing test fixture's reserved/example values; do not add real service data.

- [ ] **Step 2: Add one legacy-switch regression in the same browser flow**

Reopen the dialog, select the legacy target through its accessible name, download again, and retain the existing focused assertions for `providerProfiles.currentApiConfigName` and the matching `apiConfigs` entry. Do not add a second state matrix.

- [ ] **Step 3: Run the focused Playwright scenario**

Run:

```powershell
pnpm playwright test e2e/apiCredentialProfilesOptionsActions.spec.ts --grep "downloads Kilo Code settings"
```

Expected: PASS for both Kilo 7.x and legacy downloads in the representative workflow.

- [ ] **Step 4: Commit the E2E contract**

```powershell
git add -- e2e/apiCredentialProfilesOptionsActions.spec.ts
git commit -m "test(e2e): cover Kilo v7 settings export"
```

## Task 8: Final Validation and Runtime Handoff

**Files:**

- Review all task-scoped files above.

- [ ] **Step 1: Run all focused unit/component tests**

```powershell
pnpm vitest related src/services/integrations/kiloCodeExport.ts src/services/integrations/kiloCodeExportPolicy.ts src/services/productAnalytics/contracts.ts src/services/productAnalytics/actions.ts src/features/ApiCredentialProfiles/components/KiloCodeProfileExportDialog.tsx src/components/KiloCodeExportDialog.tsx --run
```

Expected: PASS.

- [ ] **Step 2: Run i18n and staged validation**

Stage only task-scoped files, then run:

```powershell
pnpm run i18n:extract:ci
pnpm run validate:staged
```

Expected: PASS. Reinspect `git diff --cached` afterward because hooks may format staged files.

- [ ] **Step 3: Run the push gate**

```powershell
pnpm run validate:push
```

Expected: PASS, including compile and knip.

- [ ] **Step 4: Inspect the final repository state**

```powershell
git status --porcelain
git diff --check HEAD~7..HEAD
git log --oneline -8
```

Expected: no uncommitted task changes, no whitespace errors, and only the planned commits/files.

- [ ] **Step 5: Perform or explicitly defer real Kilo 7.x runtime verification**

If Kilo Code 7.x is available, import the generated `kilo-settings.json` through About Kilo Code -> Import, review/save the draft, and make one request with the exported OpenAI-compatible model.

If it is unavailable, record exactly: `Automated schema and browser download validation passed; real Kilo Code 7.x import and model request remain manual verification.` Do not claim runtime compatibility was exercised.

- [ ] **Step 6: Final commit only if validation reformatted task files**

If Step 2 changed task-scoped files, inspect and commit only those changes:

```powershell
git add -- src/services/integrations/kiloCodeExport.ts src/services/integrations/kiloCodeExportPolicy.ts tests/services/kiloCodeExport.test.ts tests/services/kiloCodeExportPolicy.test.ts src/services/productAnalytics/contracts.ts src/services/productAnalytics/actions.ts tests/services/productAnalytics/actions.test.ts src/features/ApiCredentialProfiles/components/KiloCodeProfileExportDialog.tsx tests/features/ApiCredentialProfiles/components/KiloCodeProfileExportDialog.test.tsx src/components/KiloCodeExportDialog.tsx tests/components/KiloCodeExportDialog.test.tsx src/locales/en/ui.json src/locales/es-419/ui.json src/locales/ja/ui.json src/locales/vi/ui.json src/locales/zh-CN/ui.json src/locales/zh-TW/ui.json src/locales/en/keyManagement.json src/locales/es-419/keyManagement.json src/locales/ja/keyManagement.json src/locales/vi/keyManagement.json src/locales/zh-CN/keyManagement.json src/locales/zh-TW/keyManagement.json docs/docs/key-management.md docs/docs/api-credential-profiles.md docs/docs/supported-export-tools.md e2e/apiCredentialProfilesOptionsActions.spec.ts
git commit -m "style(kilocode): apply validated formatting"
```

If validation changed nothing, do not create an empty commit.

## Spec Traceability Checklist

- Default Kilo 7.x plus explicit legacy selector: Tasks 4 and 5.
- Official `_meta` / `provider` / `model` contract: Tasks 1 and 7.
- Stable, unique, non-secret provider IDs: Task 1.
- Shared target output policy: Task 2.
- Plaintext-key warning retained: Tasks 4 and 5 preserve the existing alert; Task 6 updates only target guidance.
- Controlled, privacy-safe telemetry: Task 3 and dialog assertions in Tasks 4-5.
- Six-locale parity and Chinese source docs: Task 6.
- Unit, component, browser, i18n, staged, compile, knip, and runtime verification: Tasks 1-8.
- No direct Kilo storage/CLI/deep-link integration and no invented model limits: enforced by Tasks 1-2 and the final diff review.
