# Internal Unified API Guidance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add state-aware in-extension guidance that explains the supported unified API path: All API Hub prepares account/API-credential sources, while the configured managed site provides the external runtime endpoint.

**Architecture:** Add a small UI-facing guidance feature under `src/features/UnifiedApiGuidance/` that derives guidance status and action targets from local counts, managed-site preferences, and model-sync support. Render that model in Overview and account-oriented surfaces, then tighten nearby copy in API Credential Profiles, Key Management, Managed Site Channels, Managed Site Model Sync, and account-detection failure recovery without changing import, export, channel, model-sync, or account lifecycle behavior.

**Tech Stack:** TypeScript, React, WXT options UI, i18next locale JSON, existing `MENU_ITEM_IDS`/settings anchors/navigation helpers, product analytics privacy sanitizer, Vitest, React Testing Library, `pnpm run i18n:extract:ci`, `pnpm run validate:staged`.

**Spec:** `docs/superpowers/specs/2026-06-22-internal-unified-api-guidance-design.md`

---

## Scope Split

This plan implements the first cohesive UI guidance slice. It intentionally does not add channel-count background loading, API credential profile batch import, managed-site CRUD redesign, model-sync internals, a runtime API proxy, or a first-run wizard.

Channel-count awareness remains out of this slice unless the channel page already has the loaded channel array in memory. API credential profile import remains individual-profile import through the existing profile row actions.

Telemetry decision: add a controlled action event for guidance CTA clicks. It records fixed enums for guidance status and action kind, existing `surface_id`, existing `target_page_id`, route-param presence, and sanitized managed-site type.

Settings search decision: none. This plan uses existing destinations and anchors only.

E2E decision: no Playwright E2E. The navigation and rendering risk is covered by helper/component tests and existing options-page routing tests.

---

## File Structure

- Create `src/features/UnifiedApiGuidance/model.ts`
  - Owns guidance status/source/action constants, target building, and `buildUnifiedApiGuidanceModel(...)`.
- Create `src/features/UnifiedApiGuidance/tracking.ts`
  - Sends the privacy-safe guidance click analytics event.
- Create `src/features/UnifiedApiGuidance/UnifiedApiGuidanceCard.tsx`
  - Renders the reusable guidance card with primary, secondary, and optional actions.
- Create `src/features/UnifiedApiGuidance/index.ts`
  - Barrel export for model, card, and tracking helpers.
- Create `tests/features/UnifiedApiGuidance/unifiedApiGuidanceModel.test.ts`
  - Tests the state model and navigation targets.
- Create `tests/features/UnifiedApiGuidance/UnifiedApiGuidanceCard.test.tsx`
  - Tests rendering boundaries and action callbacks.
- Modify `src/services/productAnalytics/events.ts`
  - Adds guidance status/action-kind enum constants and payload fields.
- Modify `src/services/productAnalytics/privacy.ts`
  - Allows the new controlled guidance analytics fields.
- Modify `tests/services/productAnalytics/privacy.test.ts`
  - Verifies guidance analytics keeps only controlled enums.
- Modify `src/features/OptionsOverview/{ids.ts,types.ts,layout.ts,overviewSelectors.ts,OptionsOverview.tsx,testIds.ts}`
  - Adds the Overview guidance widget and model.
- Modify `src/features/OptionsOverview/components/{OptionsOverviewGrid.tsx,gridText.ts}`
  - Renders the widget in the existing grid.
- Modify Overview tests:
  - `tests/features/OptionsOverview/overviewSelectors.test.ts`
  - `tests/features/OptionsOverview/layout.test.ts`
  - `tests/entrypoints/options/pages/OptionsOverview/OptionsOverview.test.tsx`
- Modify `src/features/AccountManagement/AccountManagement.tsx`
  - Adds account-source guidance near the header.
- Modify `src/features/AccountManagement/components/NewcomerSupportCard.tsx`
  - Clarifies that accounts can later become managed-site channel sources.
- Modify `src/features/AccountManagement/components/AccountDialog/AutoDetectErrorAlert.tsx`
  - Adds API Credential Profiles as the primary continuation for recognition failures.
- Modify Account Management tests:
  - `tests/features/AccountManagement/AccountManagement.analytics.test.tsx`
  - `tests/features/AccountManagement/components/NewcomerSupportCard.test.tsx`
  - `tests/features/AccountManagement/components/AccountDialogWarnings.test.tsx`
- Modify `src/features/ApiCredentialProfiles/ApiCredentialProfiles.tsx`
  - Adds lightweight-source guidance below the page header.
- Modify `tests/features/ApiCredentialProfiles/ApiCredentialProfilesListView.test.tsx` or add `tests/features/ApiCredentialProfiles/ApiCredentialProfiles.test.tsx`
  - Covers the visible source-path guidance.
- Modify `src/features/KeyManagement/components/Header.tsx`
  - Adds concise managed-site import vs direct-tool export guidance to the header description.
- Modify `src/features/KeyManagement/components/ManagedSiteTokenBatchExportDialog.tsx`
  - Tightens dialog description around managed-site channels as the gateway path.
- Modify Key Management tests:
  - `tests/entrypoints/options/pages/KeyManagement/TokenList.batchExport.test.tsx`
  - `tests/entrypoints/options/pages/KeyManagement/KeyManagement.emptyStateActions.test.tsx`
- Modify `src/features/ManagedSiteChannels/ManagedSiteChannels.tsx`
  - Updates header/config/empty copy and routes the empty state to Key Management.
- Modify `tests/entrypoints/options/pages/ManagedSiteChannels/ManagedSiteChannels.test.tsx`
  - Covers gateway copy and empty-state navigation.
- Modify `src/features/ManagedSiteModelSync/ManagedSiteModelSync.tsx`
  - Updates copy so model sync is optional maintenance after channels exist.
- Modify `tests/features/ManagedSiteModelSync/ManagedSiteModelSync.test.tsx`
  - Covers optional-maintenance copy.
- Modify locale JSON files in every app locale directory:
  - `src/locales/en/{optionsOverview,account,accountDialog,apiCredentialProfiles,keyManagement,managedSiteChannels,managedSiteModelSync}.json`
  - `src/locales/zh-CN/{optionsOverview,account,accountDialog,apiCredentialProfiles,keyManagement,managedSiteChannels,managedSiteModelSync}.json`
  - `src/locales/zh-TW/{optionsOverview,account,accountDialog,apiCredentialProfiles,keyManagement,managedSiteChannels,managedSiteModelSync}.json`
  - `src/locales/ja/{optionsOverview,account,accountDialog,apiCredentialProfiles,keyManagement,managedSiteChannels,managedSiteModelSync}.json`
  - `src/locales/vi/{optionsOverview,account,accountDialog,apiCredentialProfiles,keyManagement,managedSiteChannels,managedSiteModelSync}.json`

Do not modify:

- `src/services/apiService/**`
- `src/services/apiAdapters/**`
- `src/services/managedSites/providers/**`
- `src/services/models/modelSync/**`
- `e2e/**`
- settings search/deep-link target files
- README/docs outside this plan/spec directory

---

### Task 1: Add Unified API Guidance Model

**Files:**
- Create: `src/features/UnifiedApiGuidance/model.ts`
- Create: `src/features/UnifiedApiGuidance/index.ts`
- Create: `tests/features/UnifiedApiGuidance/unifiedApiGuidanceModel.test.ts`

- [ ] **Step 1: Write failing state-model tests**

Create `tests/features/UnifiedApiGuidance/unifiedApiGuidanceModel.test.ts`:

```ts
import { describe, expect, it } from "vitest"

import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { SETTINGS_ANCHORS } from "~/constants/settingsAnchors"
import { SITE_TYPES } from "~/constants/siteType"
import {
  buildUnifiedApiGuidanceModel,
  UNIFIED_API_GUIDANCE_ACTION_KINDS,
  UNIFIED_API_GUIDANCE_SOURCE_KINDS,
  UNIFIED_API_GUIDANCE_STATUSES,
} from "~/features/UnifiedApiGuidance"
import {
  DEFAULT_PREFERENCES,
  type UserPreferences,
} from "~/services/preferences/userPreferences"

const basePreferences: UserPreferences = {
  ...DEFAULT_PREFERENCES,
  lastUpdated: 1,
}

const configuredNewApiPreferences: UserPreferences = {
  ...basePreferences,
  newApi: {
    ...basePreferences.newApi,
    baseUrl: "https://managed.example.invalid",
    adminToken: "redacted-admin-token",
    userId: "1",
  },
}

describe("buildUnifiedApiGuidanceModel", () => {
  it("routes users with no sources to account and credential setup", () => {
    const model = buildUnifiedApiGuidanceModel({
      enabledAccountCount: 0,
      profileCount: 0,
      preferences: basePreferences,
      managedSiteType: SITE_TYPES.NEW_API,
    })

    expect(model.status).toBe(UNIFIED_API_GUIDANCE_STATUSES.NeedsSources)
    expect(model.sourceKind).toBe(UNIFIED_API_GUIDANCE_SOURCE_KINDS.None)
    expect(model.primaryAction.kind).toBe(
      UNIFIED_API_GUIDANCE_ACTION_KINDS.AddAccount,
    )
    expect(model.primaryAction.target).toEqual({
      menuItemId: MENU_ITEM_IDS.ACCOUNT,
    })
    expect(model.secondaryActions.map((action) => action.kind)).toContain(
      UNIFIED_API_GUIDANCE_ACTION_KINDS.AddApiCredential,
    )
  })

  it("routes existing sources without managed-site config to the managed-site selector", () => {
    const model = buildUnifiedApiGuidanceModel({
      enabledAccountCount: 2,
      profileCount: 1,
      preferences: basePreferences,
      managedSiteType: SITE_TYPES.NEW_API,
    })

    expect(model.status).toBe(UNIFIED_API_GUIDANCE_STATUSES.NeedsManagedSite)
    expect(model.sourceKind).toBe(UNIFIED_API_GUIDANCE_SOURCE_KINDS.Both)
    expect(model.primaryAction.kind).toBe(
      UNIFIED_API_GUIDANCE_ACTION_KINDS.ConfigureManagedSite,
    )
    expect(model.primaryAction.target).toEqual({
      menuItemId: MENU_ITEM_IDS.BASIC,
      params: {
        tab: "managedSite",
        anchor: SETTINGS_ANCHORS.MANAGED_SITE_SELECTOR,
        highlight: SETTINGS_ANCHORS.MANAGED_SITE_SELECTOR,
      },
    })
  })

  it("prefers account-token import when accounts and a managed site are ready", () => {
    const model = buildUnifiedApiGuidanceModel({
      enabledAccountCount: 1,
      profileCount: 1,
      preferences: configuredNewApiPreferences,
      managedSiteType: SITE_TYPES.NEW_API,
    })

    expect(model.status).toBe(UNIFIED_API_GUIDANCE_STATUSES.ReadyToImport)
    expect(model.primaryAction.kind).toBe(
      UNIFIED_API_GUIDANCE_ACTION_KINDS.ImportAccountTokens,
    )
    expect(model.primaryAction.target).toEqual({
      menuItemId: MENU_ITEM_IDS.KEYS,
    })
    expect(model.secondaryActions.map((action) => action.kind)).toContain(
      UNIFIED_API_GUIDANCE_ACTION_KINDS.OpenApiCredentialProfiles,
    )
    expect(model.optionalActions.map((action) => action.kind)).toContain(
      UNIFIED_API_GUIDANCE_ACTION_KINDS.OpenModelSync,
    )
  })

  it("routes profile-only sources to the API credential library", () => {
    const model = buildUnifiedApiGuidanceModel({
      enabledAccountCount: 0,
      profileCount: 3,
      preferences: configuredNewApiPreferences,
      managedSiteType: SITE_TYPES.NEW_API,
    })

    expect(model.sourceKind).toBe(UNIFIED_API_GUIDANCE_SOURCE_KINDS.Profile)
    expect(model.primaryAction.kind).toBe(
      UNIFIED_API_GUIDANCE_ACTION_KINDS.OpenApiCredentialProfiles,
    )
    expect(model.primaryAction.target).toEqual({
      menuItemId: MENU_ITEM_IDS.API_CREDENTIAL_PROFILES,
    })
    expect(model.secondaryActions.map((action) => action.kind)).toContain(
      UNIFIED_API_GUIDANCE_ACTION_KINDS.AddAccount,
    )
  })

  it("omits model sync when the managed site does not support it", () => {
    const model = buildUnifiedApiGuidanceModel({
      enabledAccountCount: 1,
      profileCount: 0,
      preferences: {
        ...basePreferences,
        axonHub: {
          baseUrl: "https://axon.example.invalid",
          email: "admin@example.invalid",
          password: "redacted-password",
        },
      },
      managedSiteType: SITE_TYPES.AXON_HUB,
    })

    expect(model.optionalActions.map((action) => action.kind)).not.toContain(
      UNIFIED_API_GUIDANCE_ACTION_KINDS.OpenModelSync,
    )
  })
})
```

- [ ] **Step 2: Run the state-model tests and verify they fail**

Run:

```powershell
pnpm vitest run tests/features/UnifiedApiGuidance/unifiedApiGuidanceModel.test.ts
```

Expected: FAIL because `~/features/UnifiedApiGuidance` does not exist.

- [ ] **Step 3: Add the guidance model**

Create `src/features/UnifiedApiGuidance/model.ts`:

```ts
import { BASIC_SETTINGS_ANCHOR_TO_TAB } from "~/constants/basicSettingsTabs"
import {
  MENU_ITEM_IDS,
  type OptionsMenuItemId,
} from "~/constants/optionsMenuIds"
import { SETTINGS_ANCHORS } from "~/constants/settingsAnchors"
import type { ManagedSiteType } from "~/constants/siteType"
import { hasValidManagedSiteConfig } from "~/services/managedSites/managedSiteService"
import { supportsManagedSiteModelSync } from "~/services/managedSites/utils/managedSite"
import type { UserPreferences } from "~/services/preferences/userPreferences"
import {
  PRODUCT_ANALYTICS_UNIFIED_API_GUIDANCE_ACTION_KINDS,
  PRODUCT_ANALYTICS_UNIFIED_API_GUIDANCE_STATUSES,
} from "~/services/productAnalytics/events"

export const UNIFIED_API_GUIDANCE_STATUSES = {
  NeedsSources: PRODUCT_ANALYTICS_UNIFIED_API_GUIDANCE_STATUSES.NeedsSources,
  NeedsManagedSite:
    PRODUCT_ANALYTICS_UNIFIED_API_GUIDANCE_STATUSES.NeedsManagedSite,
  ReadyToImport: PRODUCT_ANALYTICS_UNIFIED_API_GUIDANCE_STATUSES.ReadyToImport,
} as const

export const UNIFIED_API_GUIDANCE_SOURCE_KINDS = {
  None: "none",
  Account: "account",
  Profile: "profile",
  Both: "both",
} as const

export const UNIFIED_API_GUIDANCE_ACTION_KINDS = {
  AddAccount: PRODUCT_ANALYTICS_UNIFIED_API_GUIDANCE_ACTION_KINDS.AddAccount,
  AddApiCredential:
    PRODUCT_ANALYTICS_UNIFIED_API_GUIDANCE_ACTION_KINDS.AddApiCredential,
  ConfigureManagedSite:
    PRODUCT_ANALYTICS_UNIFIED_API_GUIDANCE_ACTION_KINDS.ConfigureManagedSite,
  ImportAccountTokens:
    PRODUCT_ANALYTICS_UNIFIED_API_GUIDANCE_ACTION_KINDS.ImportAccountTokens,
  OpenApiCredentialProfiles:
    PRODUCT_ANALYTICS_UNIFIED_API_GUIDANCE_ACTION_KINDS.OpenApiCredentialProfiles,
  ManageChannels:
    PRODUCT_ANALYTICS_UNIFIED_API_GUIDANCE_ACTION_KINDS.ManageChannels,
  OpenModelSync:
    PRODUCT_ANALYTICS_UNIFIED_API_GUIDANCE_ACTION_KINDS.OpenModelSync,
} as const

type ValueOf<T> = T[keyof T]

export type UnifiedApiGuidanceStatus = ValueOf<
  typeof UNIFIED_API_GUIDANCE_STATUSES
>
export type UnifiedApiGuidanceSourceKind = ValueOf<
  typeof UNIFIED_API_GUIDANCE_SOURCE_KINDS
>
export type UnifiedApiGuidanceActionKind = ValueOf<
  typeof UNIFIED_API_GUIDANCE_ACTION_KINDS
>

export interface UnifiedApiGuidanceNavigationTarget {
  menuItemId: OptionsMenuItemId
  params?: Record<string, string | undefined>
}

export interface UnifiedApiGuidanceAction {
  kind: UnifiedApiGuidanceActionKind
  labelKey: string
  target: UnifiedApiGuidanceNavigationTarget
}

export interface UnifiedApiGuidanceModel {
  status: UnifiedApiGuidanceStatus
  sourceKind: UnifiedApiGuidanceSourceKind
  managedSiteType?: ManagedSiteType
  headlineKey: string
  descriptionKey: string
  sourceSummaryKey: string
  boundaryNoteKey: string
  directToolExportNoteKey: string
  modelSyncNoteKey?: string
  primaryAction: UnifiedApiGuidanceAction
  secondaryActions: UnifiedApiGuidanceAction[]
  optionalActions: UnifiedApiGuidanceAction[]
}

interface BuildUnifiedApiGuidanceModelInput {
  enabledAccountCount: number
  profileCount: number
  preferences: UserPreferences | null | undefined
  managedSiteType: ManagedSiteType | undefined
}

const buildBasicSettingsTarget = (
  anchor: typeof SETTINGS_ANCHORS.MANAGED_SITE_SELECTOR,
): UnifiedApiGuidanceNavigationTarget => ({
  menuItemId: MENU_ITEM_IDS.BASIC,
  params: {
    tab: BASIC_SETTINGS_ANCHOR_TO_TAB[anchor],
    anchor,
    highlight: anchor,
  },
})

const accountAction = (): UnifiedApiGuidanceAction => ({
  kind: UNIFIED_API_GUIDANCE_ACTION_KINDS.AddAccount,
  labelKey: "unifiedApiGuidance.actions.addAccount",
  target: { menuItemId: MENU_ITEM_IDS.ACCOUNT },
})

const apiCredentialAction = (): UnifiedApiGuidanceAction => ({
  kind: UNIFIED_API_GUIDANCE_ACTION_KINDS.AddApiCredential,
  labelKey: "unifiedApiGuidance.actions.addApiCredential",
  target: { menuItemId: MENU_ITEM_IDS.API_CREDENTIAL_PROFILES },
})

const configureManagedSiteAction = (): UnifiedApiGuidanceAction => ({
  kind: UNIFIED_API_GUIDANCE_ACTION_KINDS.ConfigureManagedSite,
  labelKey: "unifiedApiGuidance.actions.configureManagedSite",
  target: buildBasicSettingsTarget(SETTINGS_ANCHORS.MANAGED_SITE_SELECTOR),
})

const importAccountTokensAction = (): UnifiedApiGuidanceAction => ({
  kind: UNIFIED_API_GUIDANCE_ACTION_KINDS.ImportAccountTokens,
  labelKey: "unifiedApiGuidance.actions.importAccountTokens",
  target: { menuItemId: MENU_ITEM_IDS.KEYS },
})

const openApiCredentialProfilesAction = (): UnifiedApiGuidanceAction => ({
  kind: UNIFIED_API_GUIDANCE_ACTION_KINDS.OpenApiCredentialProfiles,
  labelKey: "unifiedApiGuidance.actions.openApiCredentialProfiles",
  target: { menuItemId: MENU_ITEM_IDS.API_CREDENTIAL_PROFILES },
})

const manageChannelsAction = (): UnifiedApiGuidanceAction => ({
  kind: UNIFIED_API_GUIDANCE_ACTION_KINDS.ManageChannels,
  labelKey: "unifiedApiGuidance.actions.manageChannels",
  target: { menuItemId: MENU_ITEM_IDS.MANAGED_SITE_CHANNELS },
})

const openModelSyncAction = (): UnifiedApiGuidanceAction => ({
  kind: UNIFIED_API_GUIDANCE_ACTION_KINDS.OpenModelSync,
  labelKey: "unifiedApiGuidance.actions.openModelSync",
  target: { menuItemId: MENU_ITEM_IDS.MANAGED_SITE_MODEL_SYNC },
})

function resolveSourceKind(input: {
  enabledAccountCount: number
  profileCount: number
}): UnifiedApiGuidanceSourceKind {
  const hasAccounts = input.enabledAccountCount > 0
  const hasProfiles = input.profileCount > 0

  if (hasAccounts && hasProfiles) return UNIFIED_API_GUIDANCE_SOURCE_KINDS.Both
  if (hasAccounts) return UNIFIED_API_GUIDANCE_SOURCE_KINDS.Account
  if (hasProfiles) return UNIFIED_API_GUIDANCE_SOURCE_KINDS.Profile
  return UNIFIED_API_GUIDANCE_SOURCE_KINDS.None
}

function buildSourceSummaryKey(sourceKind: UnifiedApiGuidanceSourceKind) {
  return `unifiedApiGuidance.sources.${sourceKind}`
}

export function buildUnifiedApiGuidanceModel(
  input: BuildUnifiedApiGuidanceModelInput,
): UnifiedApiGuidanceModel {
  const sourceKind = resolveSourceKind(input)
  const hasSources = sourceKind !== UNIFIED_API_GUIDANCE_SOURCE_KINDS.None
  const managedSiteConfigured = hasValidManagedSiteConfig(
    input.preferences ?? null,
    input.managedSiteType,
  )
  const modelSyncSupported =
    !!input.managedSiteType &&
    supportsManagedSiteModelSync(input.managedSiteType)

  if (!hasSources) {
    return {
      status: UNIFIED_API_GUIDANCE_STATUSES.NeedsSources,
      sourceKind,
      managedSiteType: input.managedSiteType,
      headlineKey: "unifiedApiGuidance.headline",
      descriptionKey: "unifiedApiGuidance.description.needs_sources",
      sourceSummaryKey: buildSourceSummaryKey(sourceKind),
      boundaryNoteKey: "unifiedApiGuidance.boundaryNote",
      directToolExportNoteKey: "unifiedApiGuidance.directToolExportNote",
      primaryAction: accountAction(),
      secondaryActions: [apiCredentialAction()],
      optionalActions: [],
    }
  }

  if (!managedSiteConfigured) {
    return {
      status: UNIFIED_API_GUIDANCE_STATUSES.NeedsManagedSite,
      sourceKind,
      managedSiteType: input.managedSiteType,
      headlineKey: "unifiedApiGuidance.headline",
      descriptionKey: "unifiedApiGuidance.description.needs_managed_site",
      sourceSummaryKey: buildSourceSummaryKey(sourceKind),
      boundaryNoteKey: "unifiedApiGuidance.boundaryNote",
      directToolExportNoteKey: "unifiedApiGuidance.directToolExportNote",
      primaryAction: configureManagedSiteAction(),
      secondaryActions:
        sourceKind === UNIFIED_API_GUIDANCE_SOURCE_KINDS.Account
          ? [apiCredentialAction()]
          : [accountAction()],
      optionalActions: [],
    }
  }

  const usesAccountPrimary =
    sourceKind === UNIFIED_API_GUIDANCE_SOURCE_KINDS.Account ||
    sourceKind === UNIFIED_API_GUIDANCE_SOURCE_KINDS.Both

  return {
    status: UNIFIED_API_GUIDANCE_STATUSES.ReadyToImport,
    sourceKind,
    managedSiteType: input.managedSiteType,
    headlineKey: "unifiedApiGuidance.headline",
    descriptionKey: usesAccountPrimary
      ? "unifiedApiGuidance.description.ready_accounts"
      : "unifiedApiGuidance.description.ready_profiles",
    sourceSummaryKey: buildSourceSummaryKey(sourceKind),
    boundaryNoteKey: "unifiedApiGuidance.boundaryNote",
    directToolExportNoteKey: "unifiedApiGuidance.directToolExportNote",
    modelSyncNoteKey: modelSyncSupported
      ? "unifiedApiGuidance.modelSyncOptional"
      : undefined,
    primaryAction: usesAccountPrimary
      ? importAccountTokensAction()
      : openApiCredentialProfilesAction(),
    secondaryActions: [
      ...(usesAccountPrimary ? [openApiCredentialProfilesAction()] : [accountAction()]),
      manageChannelsAction(),
    ],
    optionalActions: modelSyncSupported ? [openModelSyncAction()] : [],
  }
}
```

Create `src/features/UnifiedApiGuidance/index.ts`:

```ts
export * from "./model"
```

- [ ] **Step 4: Run the state-model tests and verify they pass**

Run:

```powershell
pnpm vitest run tests/features/UnifiedApiGuidance/unifiedApiGuidanceModel.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit the guidance model**

Run:

```powershell
git add src/features/UnifiedApiGuidance/model.ts src/features/UnifiedApiGuidance/index.ts tests/features/UnifiedApiGuidance/unifiedApiGuidanceModel.test.ts
git commit -m "feat(options): add unified api guidance model"
```

---

### Task 2: Add Privacy-Safe Guidance Telemetry

**Files:**
- Modify: `src/services/productAnalytics/events.ts`
- Modify: `src/services/productAnalytics/privacy.ts`
- Create: `src/features/UnifiedApiGuidance/tracking.ts`
- Modify: `src/features/UnifiedApiGuidance/index.ts`
- Modify: `tests/services/productAnalytics/privacy.test.ts`

- [ ] **Step 1: Add a failing privacy sanitizer test**

In `tests/services/productAnalytics/privacy.test.ts`, add this test near the other `FeatureActionCompleted` sanitizer tests:

```ts
it("keeps unified API guidance click fields as controlled enums only", () => {
  const sanitized = sanitizeProductAnalyticsEvent(
    PRODUCT_ANALYTICS_EVENTS.FeatureActionCompleted,
    {
      feature_id: PRODUCT_ANALYTICS_FEATURE_IDS.OptionsOverview,
      action_id: PRODUCT_ANALYTICS_ACTION_IDS.OpenUnifiedApiGuidanceAction,
      surface_id: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsOverviewUnifiedApiGuidance,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
      result: PRODUCT_ANALYTICS_RESULTS.Success,
      target_kind: PRODUCT_ANALYTICS_TARGET_KINDS.OptionsPage,
      target_page_id: MENU_ITEM_IDS.KEYS,
      managed_site_type: PRODUCT_ANALYTICS_MANAGED_SITE_TYPES.NewApi,
      guidance_status:
        PRODUCT_ANALYTICS_UNIFIED_API_GUIDANCE_STATUSES.ReadyToImport,
      guidance_action_kind:
        PRODUCT_ANALYTICS_UNIFIED_API_GUIDANCE_ACTION_KINDS.ImportAccountTokens,
      rawStatus: "ready for production user",
      accountName: "Private account",
      apiKey: "sk-secret",
      sourceUrl: "https://private.example.invalid",
    },
  )

  expect(sanitized).toEqual({
    feature_id: PRODUCT_ANALYTICS_FEATURE_IDS.OptionsOverview,
    action_id: PRODUCT_ANALYTICS_ACTION_IDS.OpenUnifiedApiGuidanceAction,
    surface_id: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsOverviewUnifiedApiGuidance,
    entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    result: PRODUCT_ANALYTICS_RESULTS.Success,
    target_kind: PRODUCT_ANALYTICS_TARGET_KINDS.OptionsPage,
    target_page_id: MENU_ITEM_IDS.KEYS,
    managed_site_type: PRODUCT_ANALYTICS_MANAGED_SITE_TYPES.NewApi,
    guidance_status:
      PRODUCT_ANALYTICS_UNIFIED_API_GUIDANCE_STATUSES.ReadyToImport,
    guidance_action_kind:
      PRODUCT_ANALYTICS_UNIFIED_API_GUIDANCE_ACTION_KINDS.ImportAccountTokens,
  })
})

it("drops invalid unified API guidance telemetry values", () => {
  const sanitized = sanitizeProductAnalyticsEvent(
    PRODUCT_ANALYTICS_EVENTS.FeatureActionCompleted,
    {
      feature_id: PRODUCT_ANALYTICS_FEATURE_IDS.OptionsOverview,
      action_id: PRODUCT_ANALYTICS_ACTION_IDS.OpenUnifiedApiGuidanceAction,
      surface_id: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsOverviewUnifiedApiGuidance,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
      result: PRODUCT_ANALYTICS_RESULTS.Success,
      guidance_status: "ready_for_private_customer",
      guidance_action_kind: "open_production_key_named_alice",
    },
  )

  expect(sanitized).toEqual({
    feature_id: PRODUCT_ANALYTICS_FEATURE_IDS.OptionsOverview,
    action_id: PRODUCT_ANALYTICS_ACTION_IDS.OpenUnifiedApiGuidanceAction,
    surface_id: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsOverviewUnifiedApiGuidance,
    entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    result: PRODUCT_ANALYTICS_RESULTS.Success,
  })
})
```

Add these imports to the same test file:

```ts
import {
  PRODUCT_ANALYTICS_UNIFIED_API_GUIDANCE_ACTION_KINDS,
  PRODUCT_ANALYTICS_UNIFIED_API_GUIDANCE_STATUSES,
} from "~/services/productAnalytics/events"
```

- [ ] **Step 2: Run the privacy test and verify it fails**

Run:

```powershell
pnpm vitest run tests/services/productAnalytics/privacy.test.ts
```

Expected: FAIL because the new analytics constants and fields are not defined.

- [ ] **Step 3: Add controlled analytics constants and payload fields**

In `src/services/productAnalytics/events.ts`, add near the other analytics enum constants:

```ts
export const PRODUCT_ANALYTICS_UNIFIED_API_GUIDANCE_STATUSES = {
  NeedsSources: "needs_sources",
  NeedsManagedSite: "needs_managed_site",
  ReadyToImport: "ready_to_import",
} as const

export type ProductAnalyticsUnifiedApiGuidanceStatus =
  (typeof PRODUCT_ANALYTICS_UNIFIED_API_GUIDANCE_STATUSES)[keyof typeof PRODUCT_ANALYTICS_UNIFIED_API_GUIDANCE_STATUSES]

export const PRODUCT_ANALYTICS_UNIFIED_API_GUIDANCE_ACTION_KINDS = {
  AddAccount: "add_account",
  AddApiCredential: "add_api_credential",
  ConfigureManagedSite: "configure_managed_site",
  ImportAccountTokens: "import_account_tokens",
  OpenApiCredentialProfiles: "open_api_credential_profiles",
  ManageChannels: "manage_channels",
  OpenModelSync: "open_model_sync",
  SaveApiCredentialRecovery: "save_api_credential_recovery",
  RequestSiteSupport: "request_site_support",
} as const

export type ProductAnalyticsUnifiedApiGuidanceActionKind =
  (typeof PRODUCT_ANALYTICS_UNIFIED_API_GUIDANCE_ACTION_KINDS)[keyof typeof PRODUCT_ANALYTICS_UNIFIED_API_GUIDANCE_ACTION_KINDS]
```

In `PRODUCT_ANALYTICS_ACTION_IDS`, add:

```ts
OpenUnifiedApiGuidanceAction: "open_unified_api_guidance_action",
```

In `PRODUCT_ANALYTICS_SURFACE_IDS`, add:

```ts
OptionsOverviewUnifiedApiGuidance: "options_overview_unified_api_guidance",
OptionsAccountManagementUnifiedApiGuidance:
  "options_account_management_unified_api_guidance",
OptionsAccountDialogAutoDetectRecovery:
  "options_account_dialog_auto_detect_recovery",
```

In `ProductAnalyticsEventPayloadMap[PRODUCT_ANALYTICS_EVENTS.FeatureActionCompleted]`, add:

```ts
guidance_status?: ProductAnalyticsUnifiedApiGuidanceStatus
guidance_action_kind?: ProductAnalyticsUnifiedApiGuidanceActionKind
```

- [ ] **Step 4: Allow the new analytics fields in the privacy sanitizer**

In `src/services/productAnalytics/privacy.ts`, add the new constants to the import list:

```ts
PRODUCT_ANALYTICS_UNIFIED_API_GUIDANCE_ACTION_KINDS,
PRODUCT_ANALYTICS_UNIFIED_API_GUIDANCE_STATUSES,
```

In `EVENT_ALLOWED_KEYS[PRODUCT_ANALYTICS_EVENTS.FeatureActionCompleted]`, add:

```ts
"guidance_status",
"guidance_action_kind",
```

In `FIELD_ALLOWED_VALUES`, add:

```ts
guidance_status: Object.values(PRODUCT_ANALYTICS_UNIFIED_API_GUIDANCE_STATUSES),
guidance_action_kind: Object.values(
  PRODUCT_ANALYTICS_UNIFIED_API_GUIDANCE_ACTION_KINDS,
),
```

- [ ] **Step 5: Add the guidance click tracking helper**

Create `src/features/UnifiedApiGuidance/tracking.ts`:

```ts
import type { ProductAnalyticsSurfaceId } from "~/services/productAnalytics/events"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_EVENTS,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_TARGET_KINDS,
  trackProductAnalyticsEvent,
} from "~/services/productAnalytics/events"
import { resolveProductAnalyticsManagedSiteType } from "~/services/productAnalytics/managedSite"

import type {
  UnifiedApiGuidanceAction,
  UnifiedApiGuidanceModel,
} from "./model"

export function trackUnifiedApiGuidanceAction(params: {
  model: UnifiedApiGuidanceModel
  action: UnifiedApiGuidanceAction
  surfaceId: ProductAnalyticsSurfaceId
}) {
  const managedSiteType = resolveProductAnalyticsManagedSiteType(
    params.model.managedSiteType,
  )

  return trackProductAnalyticsEvent(
    PRODUCT_ANALYTICS_EVENTS.FeatureActionCompleted,
    {
      feature_id: PRODUCT_ANALYTICS_FEATURE_IDS.OptionsOverview,
      action_id: PRODUCT_ANALYTICS_ACTION_IDS.OpenUnifiedApiGuidanceAction,
      surface_id: params.surfaceId,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
      result: PRODUCT_ANALYTICS_RESULTS.Success,
      target_kind: PRODUCT_ANALYTICS_TARGET_KINDS.OptionsPage,
      target_page_id: params.action.target.menuItemId,
      route_params_present: Boolean(
        params.action.target.params &&
          Object.keys(params.action.target.params).length > 0,
      ),
      guidance_status: params.model.status,
      guidance_action_kind: params.action.kind,
      ...(managedSiteType ? { managed_site_type: managedSiteType } : {}),
    },
  )
}
```

Update `src/features/UnifiedApiGuidance/index.ts`:

```ts
export * from "./model"
export * from "./tracking"
```

- [ ] **Step 6: Run telemetry tests**

Run:

```powershell
pnpm vitest run tests/services/productAnalytics/privacy.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit telemetry support**

Run:

```powershell
git add src/services/productAnalytics/events.ts src/services/productAnalytics/privacy.ts src/features/UnifiedApiGuidance/tracking.ts src/features/UnifiedApiGuidance/index.ts tests/services/productAnalytics/privacy.test.ts
git commit -m "feat(analytics): track unified api guidance clicks"
```

---

### Task 3: Render The Overview Guidance Widget

**Files:**
- Create: `src/features/UnifiedApiGuidance/UnifiedApiGuidanceCard.tsx`
- Create: `tests/features/UnifiedApiGuidance/UnifiedApiGuidanceCard.test.tsx`
- Modify: `src/features/UnifiedApiGuidance/index.ts`
- Modify: `src/features/OptionsOverview/ids.ts`
- Modify: `src/features/OptionsOverview/testIds.ts`
- Modify: `src/features/OptionsOverview/types.ts`
- Modify: `src/features/OptionsOverview/layout.ts`
- Modify: `src/features/OptionsOverview/overviewSelectors.ts`
- Modify: `src/features/OptionsOverview/OptionsOverview.tsx`
- Modify: `src/features/OptionsOverview/components/OptionsOverviewGrid.tsx`
- Modify: `src/features/OptionsOverview/components/gridText.ts`
- Modify: `tests/features/OptionsOverview/overviewSelectors.test.ts`
- Modify: `tests/features/OptionsOverview/layout.test.ts`
- Modify: `tests/entrypoints/options/pages/OptionsOverview/OptionsOverview.test.tsx`

- [ ] **Step 1: Write failing card rendering tests**

Create `tests/features/UnifiedApiGuidance/UnifiedApiGuidanceCard.test.tsx`:

```tsx
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import {
  buildUnifiedApiGuidanceModel,
  UnifiedApiGuidanceCard,
  UNIFIED_API_GUIDANCE_ACTION_KINDS,
} from "~/features/UnifiedApiGuidance"
import {
  DEFAULT_PREFERENCES,
  type UserPreferences,
} from "~/services/preferences/userPreferences"
import { render, screen } from "~~/tests/test-utils/render"

const configuredPreferences: UserPreferences = {
  ...DEFAULT_PREFERENCES,
  lastUpdated: 1,
  newApi: {
    ...DEFAULT_PREFERENCES.newApi,
    baseUrl: "https://managed.example.invalid",
    adminToken: "redacted-admin-token",
    userId: "1",
  },
}

describe("UnifiedApiGuidanceCard", () => {
  it("renders boundary copy and complementary source actions", async () => {
    const onActionClick = vi.fn()
    const model = buildUnifiedApiGuidanceModel({
      enabledAccountCount: 1,
      profileCount: 1,
      preferences: configuredPreferences,
      managedSiteType: SITE_TYPES.NEW_API,
    })

    render(
      <UnifiedApiGuidanceCard
        model={model}
        namespace="optionsOverview"
        onActionClick={onActionClick}
      />,
      { withUserPreferencesProvider: false },
    )

    expect(screen.getByText("optionsOverview:unifiedApiGuidance.headline")).toBeVisible()
    expect(
      screen.getByText("optionsOverview:unifiedApiGuidance.boundaryNote"),
    ).toBeVisible()
    expect(
      screen.getByText("optionsOverview:unifiedApiGuidance.directToolExportNote"),
    ).toBeVisible()
    expect(
      screen.getByText("optionsOverview:unifiedApiGuidance.modelSyncOptional"),
    ).toBeVisible()

    await userEvent.click(
      screen.getByRole("button", {
        name: "optionsOverview:unifiedApiGuidance.actions.importAccountTokens",
      }),
    )

    expect(onActionClick).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: UNIFIED_API_GUIDANCE_ACTION_KINDS.ImportAccountTokens,
      }),
    )
  })

  it("does not render optional model sync when the model has no optional actions", () => {
    const model = buildUnifiedApiGuidanceModel({
      enabledAccountCount: 0,
      profileCount: 0,
      preferences: configuredPreferences,
      managedSiteType: SITE_TYPES.NEW_API,
    })

    render(
      <UnifiedApiGuidanceCard
        model={model}
        namespace="optionsOverview"
        onActionClick={vi.fn()}
      />,
      { withUserPreferencesProvider: false },
    )

    expect(
      screen.queryByText("optionsOverview:unifiedApiGuidance.modelSyncOptional"),
    ).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the card test and verify it fails**

Run:

```powershell
pnpm vitest run tests/features/UnifiedApiGuidance/UnifiedApiGuidanceCard.test.tsx
```

Expected: FAIL because `UnifiedApiGuidanceCard` is not exported.

- [ ] **Step 3: Add the reusable guidance card**

Create `src/features/UnifiedApiGuidance/UnifiedApiGuidanceCard.tsx`:

```tsx
import { ArrowRight, KeyRound, ServerCog } from "lucide-react"
import type { TFunction } from "i18next"
import { useTranslation } from "react-i18next"

import { Badge, Button, Card } from "~/components/ui"
import { cn } from "~/lib/utils"

import type {
  UnifiedApiGuidanceAction,
  UnifiedApiGuidanceModel,
} from "./model"

interface UnifiedApiGuidanceCardProps {
  model: UnifiedApiGuidanceModel
  namespace: "optionsOverview" | "account" | "apiCredentialProfiles"
  onActionClick: (action: UnifiedApiGuidanceAction) => void
  className?: string
}

const tKey = (namespace: string, key: string) => `${namespace}:${key}`

function getActionLabel(
  t: TFunction,
  namespace: UnifiedApiGuidanceCardProps["namespace"],
  action: UnifiedApiGuidanceAction,
) {
  return t(tKey(namespace, action.labelKey))
}

function renderActionButton(
  action: UnifiedApiGuidanceAction,
  t: TFunction,
  namespace: UnifiedApiGuidanceCardProps["namespace"],
  onActionClick: (action: UnifiedApiGuidanceAction) => void,
  variant: "default" | "outline",
) {
  return (
    <Button
      key={action.kind}
      type="button"
      size="sm"
      variant={variant}
      rightIcon={<ArrowRight className="h-4 w-4" />}
      onClick={() => onActionClick(action)}
    >
      {getActionLabel(t, namespace, action)}
    </Button>
  )
}

/**
 * Shared UI for the state-aware unified API guidance path.
 */
export function UnifiedApiGuidanceCard({
  model,
  namespace,
  onActionClick,
  className,
}: UnifiedApiGuidanceCardProps) {
  const { t } = useTranslation([namespace, "common"])

  return (
    <Card
      className={cn(
        "overflow-hidden border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-white/[0.03]",
        className,
      )}
    >
      <div className="grid gap-4 p-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="rounded-md bg-blue-50 p-1.5 text-blue-700 dark:bg-blue-950/40 dark:text-blue-200">
              <ServerCog className="h-4 w-4" />
            </div>
            <h3 className="text-sm font-semibold text-slate-950 dark:text-slate-100">
              {t(tKey(namespace, model.headlineKey))}
            </h3>
            <Badge size="sm" variant="secondary">
              {t(tKey(namespace, model.sourceSummaryKey))}
            </Badge>
          </div>

          <p className="text-sm leading-6 text-slate-600 dark:text-slate-300">
            {t(tKey(namespace, model.descriptionKey))}
          </p>

          <div className="space-y-1.5 text-xs leading-5 text-slate-500 dark:text-slate-400">
            <p>{t(tKey(namespace, model.boundaryNoteKey))}</p>
            <p>{t(tKey(namespace, model.directToolExportNoteKey))}</p>
            {model.modelSyncNoteKey ? (
              <p>{t(tKey(namespace, model.modelSyncNoteKey))}</p>
            ) : null}
          </div>
        </div>

        <div className="flex flex-col gap-2 md:min-w-56">
          {renderActionButton(
            model.primaryAction,
            t,
            namespace,
            onActionClick,
            "default",
          )}
          {model.secondaryActions.map((action) =>
            renderActionButton(action, t, namespace, onActionClick, "outline"),
          )}
          {model.optionalActions.length > 0 ? (
            <div className="border-t border-slate-200 pt-2 dark:border-white/10">
              <div className="mb-1 flex items-center gap-1.5 text-[11px] font-medium text-slate-500 dark:text-slate-400">
                <KeyRound className="h-3.5 w-3.5" />
                {t(tKey(namespace, "unifiedApiGuidance.optionalLabel"))}
              </div>
              <div className="flex flex-col gap-2">
                {model.optionalActions.map((action) =>
                  renderActionButton(
                    action,
                    t,
                    namespace,
                    onActionClick,
                    "outline",
                  ),
                )}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </Card>
  )
}
```

Update `src/features/UnifiedApiGuidance/index.ts`:

```ts
export * from "./model"
export * from "./tracking"
export * from "./UnifiedApiGuidanceCard"
```

- [ ] **Step 4: Run card tests**

Run:

```powershell
pnpm vitest run tests/features/UnifiedApiGuidance/UnifiedApiGuidanceCard.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Add the Overview widget to the view model and layout**

In `src/features/OptionsOverview/ids.ts`, add:

```ts
unifiedApiGuidance: "unifiedApiGuidance",
```

to `OPTIONS_OVERVIEW_WIDGET_IDS`.

In `src/features/OptionsOverview/testIds.ts`, add:

```ts
unifiedApiGuidance: "options-overview-unified-api-guidance",
```

In `src/features/OptionsOverview/types.ts`, import the model type:

```ts
import type { UnifiedApiGuidanceModel } from "~/features/UnifiedApiGuidance"
```

Add to `OptionsOverviewViewModel`:

```ts
unifiedApiGuidance: UnifiedApiGuidanceModel
```

In `src/features/OptionsOverview/layout.ts`, insert the widget after `statusSummary`:

```ts
{
  id: OPTIONS_OVERVIEW_WIDGET_IDS.unifiedApiGuidance,
  columnSpan: 3,
  persisted: false,
},
```

In `src/features/OptionsOverview/overviewSelectors.ts`, import and build the model:

```ts
import { buildUnifiedApiGuidanceModel } from "~/features/UnifiedApiGuidance"
```

Add to the returned view model:

```ts
unifiedApiGuidance: buildUnifiedApiGuidanceModel({
  enabledAccountCount: enabledAccounts.length,
  profileCount: input.apiCredentialProfiles.length,
  preferences: input.preferences,
  managedSiteType: input.managedSiteType,
}),
```

In `src/features/OptionsOverview/components/gridText.ts`, add:

```ts
[OPTIONS_OVERVIEW_WIDGET_IDS.unifiedApiGuidance]: (t: TFunction) =>
  t("optionsOverview:sections.unifiedApiGuidance"),
```

- [ ] **Step 6: Render the Overview widget**

In `src/features/OptionsOverview/components/OptionsOverviewGrid.tsx`, import:

```ts
import {
  trackUnifiedApiGuidanceAction,
  UnifiedApiGuidanceCard,
  type UnifiedApiGuidanceAction,
} from "~/features/UnifiedApiGuidance"
import { PRODUCT_ANALYTICS_SURFACE_IDS } from "~/services/productAnalytics/events"
```

Add a case in `renderWidget(...)`:

```tsx
case OPTIONS_OVERVIEW_WIDGET_IDS.unifiedApiGuidance: {
  const handleUnifiedApiAction = (action: UnifiedApiGuidanceAction) => {
    void trackUnifiedApiGuidanceAction({
      model: viewModel.unifiedApiGuidance,
      action,
      surfaceId:
        PRODUCT_ANALYTICS_SURFACE_IDS.OptionsOverviewUnifiedApiGuidance,
    })
    navigateFromWidget(action.target)
  }

  return (
    <WidgetBody testId={OPTIONS_OVERVIEW_TEST_IDS.unifiedApiGuidance}>
      <UnifiedApiGuidanceCard
        model={viewModel.unifiedApiGuidance}
        namespace="optionsOverview"
        onActionClick={handleUnifiedApiAction}
      />
    </WidgetBody>
  )
}
```

In `src/features/OptionsOverview/OptionsOverview.tsx`, add to `overviewWidgetSurfaceIds`:

```ts
unifiedApiGuidance:
  PRODUCT_ANALYTICS_SURFACE_IDS.OptionsOverviewUnifiedApiGuidance,
```

- [ ] **Step 7: Update Overview tests**

In `tests/features/OptionsOverview/layout.test.ts`, update the expected layout to include:

```ts
{
  id: "unifiedApiGuidance",
  columnSpan: 3,
  persisted: false,
},
```

In `tests/features/OptionsOverview/overviewSelectors.test.ts`, add assertions to the setup-focused test:

```ts
expect(view.unifiedApiGuidance).toMatchObject({
  status: "needs_sources",
  sourceKind: "none",
  primaryAction: {
    kind: "add_account",
    target: { menuItemId: MENU_ITEM_IDS.ACCOUNT },
  },
})
```

Add a managed-site-ready assertion to the configured managed-site test:

```ts
expect(configuredView.unifiedApiGuidance).toMatchObject({
  status: "ready_to_import",
  sourceKind: "account",
  primaryAction: {
    kind: "import_account_tokens",
    target: { menuItemId: MENU_ITEM_IDS.KEYS },
  },
})
```

In `tests/entrypoints/options/pages/OptionsOverview/OptionsOverview.test.tsx`, add `unifiedApiGuidance` to `setupViewModel` using:

```ts
unifiedApiGuidance: {
  status: "needs_sources",
  sourceKind: "none",
  headlineKey: "unifiedApiGuidance.headline",
  descriptionKey: "unifiedApiGuidance.description.needs_sources",
  sourceSummaryKey: "unifiedApiGuidance.sources.none",
  boundaryNoteKey: "unifiedApiGuidance.boundaryNote",
  directToolExportNoteKey: "unifiedApiGuidance.directToolExportNote",
  primaryAction: {
    kind: "add_account",
    labelKey: "unifiedApiGuidance.actions.addAccount",
    target: { menuItemId: MENU_ITEM_IDS.ACCOUNT },
  },
  secondaryActions: [
    {
      kind: "add_api_credential",
      labelKey: "unifiedApiGuidance.actions.addApiCredential",
      target: { menuItemId: MENU_ITEM_IDS.API_CREDENTIAL_PROFILES },
    },
  ],
  optionalActions: [],
},
```

Add a new test:

```tsx
it("renders unified API guidance and tracks its state-aware navigation", async () => {
  const user = userEvent.setup()
  useOptionsOverviewDataMock.mockReturnValue({
    isLoading: false,
    error: null,
    viewModel: setupViewModel,
    reload: vi.fn(),
  })

  renderOverview()

  expect(
    screen.getByTestId(OPTIONS_OVERVIEW_TEST_IDS.unifiedApiGuidance),
  ).toHaveTextContent("optionsOverview:unifiedApiGuidance.boundaryNote")

  await user.click(
    screen.getByRole("button", {
      name: "optionsOverview:unifiedApiGuidance.actions.addAccount",
    }),
  )

  expect(pushWithinOptionsPageMock).toHaveBeenCalledWith("#account", {})
  expect(trackProductAnalyticsEvent).toHaveBeenCalledWith(
    PRODUCT_ANALYTICS_EVENTS.FeatureActionCompleted,
    expect.objectContaining({
      feature_id: PRODUCT_ANALYTICS_FEATURE_IDS.OptionsOverview,
      action_id: PRODUCT_ANALYTICS_ACTION_IDS.OpenUnifiedApiGuidanceAction,
      surface_id:
        PRODUCT_ANALYTICS_SURFACE_IDS.OptionsOverviewUnifiedApiGuidance,
      result: PRODUCT_ANALYTICS_RESULTS.Success,
      target_page_id: MENU_ITEM_IDS.ACCOUNT,
      guidance_status: "needs_sources",
      guidance_action_kind: "add_account",
    }),
  )
})
```

- [ ] **Step 8: Add Overview locale keys**

Add this subtree under `src/locales/en/optionsOverview.json`:

```json
"unifiedApiGuidance": {
  "actions": {
    "addAccount": "Add account",
    "addApiCredential": "Add API credential",
    "configureManagedSite": "Configure managed site",
    "importAccountTokens": "Import account keys",
    "manageChannels": "Manage channels",
    "openApiCredentialProfiles": "Open credential library",
    "openModelSync": "Open model sync"
  },
  "boundaryNote": "All API Hub is not the API endpoint. Your managed site is what external tools call.",
  "description": {
    "needs_managed_site": "You already have sources. Connect a managed site next so those sources can become gateway channels.",
    "needs_sources": "Start with full accounts or saved API credentials (token / API key). All API Hub validates and organizes them before they are imported into a managed site.",
    "ready_accounts": "Your managed site is configured. Import selected account keys into managed-site channels, then call the managed site as the unified endpoint.",
    "ready_profiles": "Your managed site is configured. Use saved API credentials for verification, reuse, direct export, or individual managed-site channel setup."
  },
  "directToolExportNote": "Direct client-tool export is a separate path; it does not replace managed-site gateway setup.",
  "headline": "Need one API endpoint?",
  "modelSyncOptional": "Model sync is optional maintenance after channels exist.",
  "optionalLabel": "Optional maintenance",
  "sources": {
    "account": "Account sources",
    "both": "Accounts + credentials",
    "none": "No sources yet",
    "profile": "Credential sources"
  }
}
```

Add equivalent `unifiedApiGuidance` keys to `zh-CN`, `zh-TW`, `ja`, and `vi` in the same file name. Use this content:

```json
{
  "zh-CN": {
    "headline": "需要一个统一 API 入口？",
    "boundaryNote": "All API Hub 不是 API 入口。外部工具实际调用的是你的自建站点。",
    "directToolExportNote": "直接导出到客户端工具是单独路径，不等于完成自建网关配置。",
    "modelSyncOptional": "模型同步是渠道创建后的可选维护能力。"
  },
  "zh-TW": {
    "headline": "需要一個統一 API 入口？",
    "boundaryNote": "All API Hub 不是 API 入口。外部工具實際呼叫的是你的自建站點。",
    "directToolExportNote": "直接匯出到用戶端工具是獨立路徑，不等於完成自建閘道設定。",
    "modelSyncOptional": "模型同步是渠道建立後的選用維護能力。"
  },
  "ja": {
    "headline": "1 つの API エンドポイントが必要ですか？",
    "boundaryNote": "All API Hub は API エンドポイントではありません。外部ツールが呼び出すのは管理対象サイトです。",
    "directToolExportNote": "クライアントツールへの直接エクスポートは別経路であり、管理対象ゲートウェイ設定の代わりではありません。",
    "modelSyncOptional": "モデル同期は、チャンネル作成後の任意のメンテナンス機能です。"
  },
  "vi": {
    "headline": "Cần một điểm cuối API duy nhất?",
    "boundaryNote": "All API Hub không phải điểm cuối API. Công cụ bên ngoài sẽ gọi trang được quản lý của bạn.",
    "directToolExportNote": "Xuất trực tiếp sang công cụ khách là một đường riêng, không thay thế thiết lập cổng trên trang được quản lý.",
    "modelSyncOptional": "Đồng bộ mô hình là bảo trì tùy chọn sau khi đã có kênh."
  }
}
```

For each non-English locale, translate the `actions`, `description`, `optionalLabel`, and `sources` keys in the same style as the four strings above. Keep the JSON key shape identical across all locale files.

- [ ] **Step 9: Run Overview and card tests**

Run:

```powershell
pnpm vitest run tests/features/UnifiedApiGuidance/unifiedApiGuidanceModel.test.ts tests/features/UnifiedApiGuidance/UnifiedApiGuidanceCard.test.tsx tests/features/OptionsOverview/layout.test.ts tests/features/OptionsOverview/overviewSelectors.test.ts tests/entrypoints/options/pages/OptionsOverview/OptionsOverview.test.tsx
```

Expected: PASS.

- [ ] **Step 10: Commit Overview widget**

Run:

```powershell
git add src/features/UnifiedApiGuidance/UnifiedApiGuidanceCard.tsx src/features/UnifiedApiGuidance/index.ts src/features/OptionsOverview tests/features/UnifiedApiGuidance tests/features/OptionsOverview tests/entrypoints/options/pages/OptionsOverview/OptionsOverview.test.tsx src/locales
git commit -m "feat(options): surface unified api setup guidance"
```

---

### Task 4: Add Account Source Guidance And Detection-Failure Recovery

**Files:**
- Modify: `src/features/AccountManagement/AccountManagement.tsx`
- Modify: `src/features/AccountManagement/components/NewcomerSupportCard.tsx`
- Modify: `src/features/AccountManagement/components/AccountDialog/AutoDetectErrorAlert.tsx`
- Modify: `tests/features/AccountManagement/AccountManagement.analytics.test.tsx`
- Modify: `tests/features/AccountManagement/components/NewcomerSupportCard.test.tsx`
- Modify: `tests/features/AccountManagement/components/AccountDialogWarnings.test.tsx`
- Modify: `src/locales/*/account.json`
- Modify: `src/locales/*/accountDialog.json`

- [ ] **Step 1: Add failing account guidance tests**

In `tests/features/AccountManagement/AccountManagement.analytics.test.tsx`, add a test that renders `AccountManagement` with account context mocks containing one enabled account and user preferences with no valid managed-site config. Assert the page contains:

```ts
expect(screen.getByText("account:unifiedApiGuidance.headline")).toBeVisible()
expect(
  screen.getByText("account:unifiedApiGuidance.description.needs_managed_site"),
).toBeVisible()
```

Click the configure button and assert:

```ts
expect(pushWithinOptionsPageMock).toHaveBeenCalledWith("#basic", {
  tab: "managedSite",
  anchor: SETTINGS_ANCHORS.MANAGED_SITE_SELECTOR,
  highlight: SETTINGS_ANCHORS.MANAGED_SITE_SELECTOR,
})
```

- [ ] **Step 2: Add failing auto-detect recovery tests**

In `tests/features/AccountManagement/components/AccountDialogWarnings.test.tsx`, extend the navigation mock:

```ts
const { openApiCredentialProfilesPageMock, openSiteSupportRequestPageMock } =
  vi.hoisted(() => ({
    openApiCredentialProfilesPageMock: vi.fn(),
    openSiteSupportRequestPageMock: vi.fn(),
  }))
```

Return `openApiCredentialProfilesPage` from the `~/utils/navigation` mock:

```ts
openApiCredentialProfilesPage: openApiCredentialProfilesPageMock,
```

Reset it in `beforeEach`.

Add this test:

```tsx
it("offers API credential recovery first when auto-detect cannot identify a manageable account", () => {
  render(
    <AutoDetectErrorAlert
      error={{
        type: AutoDetectErrorType.NOT_FOUND,
        message: "Site was not recognized",
      }}
      siteUrl="https://relay.example.invalid/console"
    />,
  )

  expect(
    screen.getByText("accountDialog:warnings.autoDetectApiCredentialRecovery.description"),
  ).toBeVisible()

  fireEvent.click(
    screen.getByRole("button", {
      name: "accountDialog:warnings.autoDetectApiCredentialRecovery.actions.openCredentialLibrary",
    }),
  )

  expect(openApiCredentialProfilesPageMock).toHaveBeenCalledTimes(1)
  expect(openSiteSupportRequestPageMock).not.toHaveBeenCalled()

  fireEvent.click(
    screen.getByRole("button", {
      name: "actions.reportUnsupportedSite",
    }),
  )

  expect(openSiteSupportRequestPageMock).toHaveBeenCalledWith({
    siteUrl: "https://relay.example.invalid/console",
    errorType: AutoDetectErrorType.NOT_FOUND,
    errorMessage: "Site was not recognized",
  })
})
```

Add this negative test:

```tsx
it("does not replace login recovery with credential-library recovery for unauthorized errors", () => {
  render(
    <AutoDetectErrorAlert
      error={{
        type: AutoDetectErrorType.UNAUTHORIZED,
        message: "Please log in",
        actionText: "Retry login",
      }}
      siteUrl="https://relay.example.invalid"
    />,
  )

  expect(
    screen.queryByText(
      "accountDialog:warnings.autoDetectApiCredentialRecovery.description",
    ),
  ).not.toBeInTheDocument()
})
```

- [ ] **Step 3: Run the account tests and verify they fail**

Run:

```powershell
pnpm vitest run tests/features/AccountManagement/AccountManagement.analytics.test.tsx tests/features/AccountManagement/components/AccountDialogWarnings.test.tsx
```

Expected: FAIL because the guidance and recovery CTA are not implemented.

- [ ] **Step 4: Render account-management guidance**

In `src/features/AccountManagement/AccountManagement.tsx`, import:

```ts
import { SETTINGS_ANCHORS } from "~/constants/settingsAnchors"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import {
  buildUnifiedApiGuidanceModel,
  trackUnifiedApiGuidanceAction,
  UnifiedApiGuidanceCard,
  type UnifiedApiGuidanceAction,
} from "~/features/UnifiedApiGuidance"
import { PRODUCT_ANALYTICS_SURFACE_IDS } from "~/services/productAnalytics/events"
import { pushWithinOptionsPage } from "~/utils/navigation"
```

Inside `AccountManagementContent`, read preferences:

```ts
const { preferences, managedSiteType } = useUserPreferencesContext()
```

Build the account-source model:

```ts
const enabledAccountCount = displayData.filter(
  (account) => !account.disabled,
).length
const unifiedApiGuidance = buildUnifiedApiGuidanceModel({
  enabledAccountCount,
  profileCount: 0,
  preferences,
  managedSiteType,
})
```

Add the click handler:

```ts
const handleUnifiedApiGuidanceAction = (action: UnifiedApiGuidanceAction) => {
  void trackUnifiedApiGuidanceAction({
    model: unifiedApiGuidance,
    action,
    surfaceId:
      PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAccountManagementUnifiedApiGuidance,
  })

  if (action.kind === "add_account") {
    openAddAccount()
    return
  }

  pushWithinOptionsPage(`#${action.target.menuItemId}`, action.target.params ?? {})
}
```

Place this block after `PageHeader` and before `AccountList`:

```tsx
<UnifiedApiGuidanceCard
  model={unifiedApiGuidance}
  namespace="account"
  onActionClick={handleUnifiedApiGuidanceAction}
  className="mb-4"
/>
```

Remove unused imports if TypeScript reports them. Keep account operations and list behavior unchanged.

- [ ] **Step 5: Clarify the newcomer card account-source copy**

In `src/features/AccountManagement/components/NewcomerSupportCard.tsx`, keep the existing action group and sponsor section. Change the description key to a richer account-source description by updating only locale text:

```json
"description": "Add accounts to build a source inventory for balances, health checks, API keys, direct exports, and later managed-site channel import."
```

In `tests/features/AccountManagement/components/NewcomerSupportCard.test.tsx`, assert the rendered card contains:

```ts
expect(
  screen.getByText("account:newcomerSupport.description"),
).toBeInTheDocument()
```

Keep the existing sponsor and API credential fallback assertions unchanged.

- [ ] **Step 6: Add API Credential Profiles recovery to auto-detect failures**

In `src/features/AccountManagement/components/AccountDialog/AutoDetectErrorAlert.tsx`, import:

```ts
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_EVENTS,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
  PRODUCT_ANALYTICS_TARGET_KINDS,
  PRODUCT_ANALYTICS_UNIFIED_API_GUIDANCE_ACTION_KINDS,
  PRODUCT_ANALYTICS_UNIFIED_API_GUIDANCE_STATUSES,
  trackProductAnalyticsEvent,
} from "~/services/productAnalytics/events"
import {
  openApiCredentialProfilesPage,
  openSiteSupportRequestPage,
} from "~/utils/navigation"
```

Add this helper above the component:

```ts
const API_CREDENTIAL_RECOVERY_ERROR_TYPES = new Set<AutoDetectErrorType>([
  AutoDetectErrorType.INVALID_RESPONSE,
  AutoDetectErrorType.NOT_FOUND,
  AutoDetectErrorType.FORBIDDEN,
  AutoDetectErrorType.UNKNOWN,
])

const shouldOfferApiCredentialRecovery = (errorType: AutoDetectErrorType) =>
  API_CREDENTIAL_RECOVERY_ERROR_TYPES.has(errorType)
```

Inside the component, add:

```ts
const showApiCredentialRecovery = shouldOfferApiCredentialRecovery(error.type)

const handleOpenApiCredentialProfiles = () => {
  void trackProductAnalyticsEvent(
    PRODUCT_ANALYTICS_EVENTS.FeatureActionCompleted,
    {
      feature_id: PRODUCT_ANALYTICS_FEATURE_IDS.AccountManagement,
      action_id: PRODUCT_ANALYTICS_ACTION_IDS.OpenUnifiedApiGuidanceAction,
      surface_id:
        PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAccountDialogAutoDetectRecovery,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
      result: PRODUCT_ANALYTICS_RESULTS.Success,
      target_kind: PRODUCT_ANALYTICS_TARGET_KINDS.OptionsPage,
      target_page_id: "apiCredentialProfiles",
      guidance_status:
        PRODUCT_ANALYTICS_UNIFIED_API_GUIDANCE_STATUSES.NeedsSources,
      guidance_action_kind:
        PRODUCT_ANALYTICS_UNIFIED_API_GUIDANCE_ACTION_KINDS.SaveApiCredentialRecovery,
    },
  )
  void openApiCredentialProfilesPage()
}
```

In the alert body, after the error message and before the button row, add:

```tsx
{showApiCredentialRecovery ? (
  <div className="mb-3 rounded-md border border-amber-200 bg-amber-50/70 p-3 text-xs leading-5 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-100">
    <p className="font-medium">
      {t("warnings.autoDetectApiCredentialRecovery.title")}
    </p>
    <p>{t("warnings.autoDetectApiCredentialRecovery.description")}</p>
  </div>
) : null}
```

In the action button row, render this button before the report-support button:

```tsx
{showApiCredentialRecovery && (
  <Button
    type="button"
    onClick={handleOpenApiCredentialProfiles}
    variant="warning"
    size="sm"
  >
    {t(
      "warnings.autoDetectApiCredentialRecovery.actions.openCredentialLibrary",
    )}
  </Button>
)}
```

Keep existing login, reload, help-doc, and site-support behavior unchanged.

- [ ] **Step 7: Add Account and Account Dialog locale keys**

Add `account:unifiedApiGuidance` with the same key shape as `optionsOverview:unifiedApiGuidance`. Use this English copy in `src/locales/en/account.json`:

```json
"unifiedApiGuidance": {
  "actions": {
    "addAccount": "Add account",
    "addApiCredential": "Add API credential",
    "configureManagedSite": "Configure managed site",
    "importAccountTokens": "Open Key Management",
    "manageChannels": "Manage channels",
    "openApiCredentialProfiles": "Open credential library",
    "openModelSync": "Open model sync"
  },
  "boundaryNote": "All API Hub prepares account sources; your managed site provides the external API endpoint.",
  "description": {
    "needs_managed_site": "These accounts can become managed-site channels after the managed-site admin connection is configured.",
    "needs_sources": "Adding accounts creates a managed source inventory that can provide keys for direct export or managed-site channels.",
    "ready_accounts": "Use Key Management to import selected account keys into managed-site channels.",
    "ready_profiles": "Saved API credentials are available in the credential library for direct reuse or individual channel setup."
  },
  "directToolExportNote": "Direct tool export remains available beside managed-site import.",
  "headline": "Use accounts as gateway sources",
  "modelSyncOptional": "Model sync is optional after channels exist.",
  "optionalLabel": "Optional maintenance",
  "sources": {
    "account": "Account sources",
    "both": "Accounts + credentials",
    "none": "No account sources yet",
    "profile": "Credential sources"
  }
}
```

Add `accountDialog:warnings.autoDetectApiCredentialRecovery` in every locale. Use this English copy:

```json
"autoDetectApiCredentialRecovery": {
  "actions": {
    "openCredentialLibrary": "Open API credential library"
  },
  "description": "If you already have this site's API credentials (token / API key), save them to the credential library for verification, reuse, export, or managed-site setup.",
  "title": "Could not identify a manageable account yet."
}
```

Translate the same keys in `zh-CN`, `zh-TW`, `ja`, and `vi`, keeping the JSON shape identical.

- [ ] **Step 8: Run account-focused tests**

Run:

```powershell
pnpm vitest run tests/features/AccountManagement/AccountManagement.analytics.test.tsx tests/features/AccountManagement/components/NewcomerSupportCard.test.tsx tests/features/AccountManagement/components/AccountDialogWarnings.test.tsx
```

Expected: PASS.

- [ ] **Step 9: Commit account guidance**

Run:

```powershell
git add src/features/AccountManagement tests/features/AccountManagement src/locales
git commit -m "feat(account): guide unified api source setup"
```

---

### Task 5: Clarify API Credential Profiles And Key Management Bridge Copy

**Files:**
- Modify: `src/features/ApiCredentialProfiles/ApiCredentialProfiles.tsx`
- Modify: `src/features/KeyManagement/components/Header.tsx`
- Modify: `src/features/KeyManagement/components/ManagedSiteTokenBatchExportDialog.tsx`
- Modify: `tests/features/ApiCredentialProfiles/ApiCredentialProfilesListView.test.tsx`
- Modify: `tests/entrypoints/options/pages/KeyManagement/TokenList.batchExport.test.tsx`
- Modify: `tests/entrypoints/options/pages/KeyManagement/KeyManagement.emptyStateActions.test.tsx`
- Modify: `src/locales/*/apiCredentialProfiles.json`
- Modify: `src/locales/*/keyManagement.json`

- [ ] **Step 1: Add failing API Credential Profiles guidance assertion**

In `tests/features/ApiCredentialProfiles/ApiCredentialProfilesListView.test.tsx`, add or update a page-level render test to assert:

```ts
expect(
  screen.getByText("apiCredentialProfiles:unifiedApiGuidance.description"),
).toBeVisible()
expect(
  screen.getByText("apiCredentialProfiles:unifiedApiGuidance.boundaryNote"),
).toBeVisible()
```

- [ ] **Step 2: Add failing Key Management copy assertions**

In `tests/entrypoints/options/pages/KeyManagement/KeyManagement.emptyStateActions.test.tsx`, assert the header includes:

```ts
expect(
  screen.getByText("keyManagement:unifiedApiGuidance.headerBridge"),
).toBeVisible()
```

In `tests/entrypoints/options/pages/KeyManagement/TokenList.batchExport.test.tsx`, assert the batch managed-site export dialog includes:

```ts
expect(
  screen.getByText("keyManagement:batchManagedSiteExport.gatewayDescription"),
).toBeVisible()
```

- [ ] **Step 3: Run the API credential and Key Management tests and verify they fail**

Run:

```powershell
pnpm vitest run tests/features/ApiCredentialProfiles/ApiCredentialProfilesListView.test.tsx tests/entrypoints/options/pages/KeyManagement/KeyManagement.emptyStateActions.test.tsx tests/entrypoints/options/pages/KeyManagement/TokenList.batchExport.test.tsx
```

Expected: FAIL because the copy is not rendered.

- [ ] **Step 4: Render API Credential Profiles source guidance**

In `src/features/ApiCredentialProfiles/ApiCredentialProfiles.tsx`, import:

```ts
import { Notice } from "~/components/ui"
```

After `PageHeader`, add:

```tsx
<Notice
  tone="info"
  icon={<ApiCredentialLibraryIcon className="h-4 w-4" />}
  title={t("apiCredentialProfiles:unifiedApiGuidance.title")}
  description={
    <span className="space-y-1">
      <span className="block">
        {t("apiCredentialProfiles:unifiedApiGuidance.description")}
      </span>
      <span className="block">
        {t("apiCredentialProfiles:unifiedApiGuidance.boundaryNote")}
      </span>
    </span>
  }
/>
```

- [ ] **Step 5: Add Key Management bridge copy**

In `src/features/KeyManagement/components/Header.tsx`, extend the default description:

```tsx
let description: ReactNode = (
  <>
    <span className="block">{t("description")}</span>
    <span className="mt-1 block text-sm text-slate-600 dark:text-slate-400">
      {t("unifiedApiGuidance.headerBridge")}
    </span>
  </>
)
```

Keep the existing managed-site status hint branch, but include the bridge line before the warning:

```tsx
description = (
  <>
    <span className="block">{t("description")}</span>
    <span className="mt-1 block text-sm text-slate-600 dark:text-slate-400">
      {t("unifiedApiGuidance.headerBridge")}
    </span>
    <span className="mt-1 block font-medium text-amber-700 dark:text-amber-300">
      {managedSiteStatusHint}
    </span>
  </>
)
```

In `src/features/KeyManagement/components/ManagedSiteTokenBatchExportDialog.tsx`, add this line below the existing description in the modal header:

```tsx
<div className="text-muted-foreground text-sm">
  {t("keyManagement:batchManagedSiteExport.gatewayDescription")}
</div>
```

Do not change preview, execution, or import behavior.

- [ ] **Step 6: Add API Credential Profiles and Key Management locale keys**

Add to `src/locales/en/apiCredentialProfiles.json`:

```json
"unifiedApiGuidance": {
  "boundaryNote": "For one external endpoint, import useful credentials into a managed site channel; the managed site is what clients call.",
  "description": "API credentials (token / API key) are lightweight sources for quick verification, reuse, direct export, and individual managed-site channel setup.",
  "title": "Lightweight source path"
}
```

Add to `src/locales/en/keyManagement.json`:

```json
"unifiedApiGuidance": {
  "headerBridge": "Import account keys into managed-site channels when you want the managed site to act as the unified API gateway. Direct client-tool export remains a separate path."
}
```

Add inside `batchManagedSiteExport`:

```json
"gatewayDescription": "This creates managed-site channels. External tools call the managed site as the unified API endpoint."
```

Translate these keys in `zh-CN`, `zh-TW`, `ja`, and `vi`. Keep the JSON key shape identical.

- [ ] **Step 7: Run focused tests**

Run:

```powershell
pnpm vitest run tests/features/ApiCredentialProfiles/ApiCredentialProfilesListView.test.tsx tests/entrypoints/options/pages/KeyManagement/KeyManagement.emptyStateActions.test.tsx tests/entrypoints/options/pages/KeyManagement/TokenList.batchExport.test.tsx
```

Expected: PASS.

- [ ] **Step 8: Commit credential and key guidance**

Run:

```powershell
git add src/features/ApiCredentialProfiles src/features/KeyManagement tests/features/ApiCredentialProfiles tests/entrypoints/options/pages/KeyManagement src/locales
git commit -m "feat(credentials): clarify managed-site source paths"
```

---

### Task 6: Clarify Managed Site Channels And Model Sync

**Files:**
- Modify: `src/features/ManagedSiteChannels/ManagedSiteChannels.tsx`
- Modify: `src/features/ManagedSiteModelSync/ManagedSiteModelSync.tsx`
- Modify: `tests/entrypoints/options/pages/ManagedSiteChannels/ManagedSiteChannels.test.tsx`
- Modify: `tests/features/ManagedSiteModelSync/ManagedSiteModelSync.test.tsx`
- Modify: `src/locales/*/managedSiteChannels.json`
- Modify: `src/locales/*/managedSiteModelSync.json`

- [ ] **Step 1: Add failing Managed Site Channels empty-state test**

In `tests/entrypoints/options/pages/ManagedSiteChannels/ManagedSiteChannels.test.tsx`, add a test with a valid managed-site config and `ListChannels` returning an empty `items` array. Assert:

```ts
expect(
  screen.getByText("managedSiteChannels:gatewayGuidance.empty.title"),
).toBeVisible()
expect(
  screen.getByText("managedSiteChannels:gatewayGuidance.empty.description"),
).toBeVisible()
```

Click the import action:

```ts
await user.click(
  screen.getByRole("button", {
    name: "managedSiteChannels:gatewayGuidance.empty.openKeyManagement",
  }),
)

expect(navigateWithinOptionsPage).toHaveBeenCalledWith("#keys")
```

- [ ] **Step 2: Add failing model-sync optional copy test**

In `tests/features/ManagedSiteModelSync/ManagedSiteModelSync.test.tsx`, assert the rendered page contains:

```ts
expect(
  screen.getByText("managedSiteModelSync:optionalGuidance.description"),
).toBeVisible()
```

- [ ] **Step 3: Run managed-site tests and verify they fail**

Run:

```powershell
pnpm vitest run tests/entrypoints/options/pages/ManagedSiteChannels/ManagedSiteChannels.test.tsx tests/features/ManagedSiteModelSync/ManagedSiteModelSync.test.tsx
```

Expected: FAIL because the new copy and empty action are not rendered.

- [ ] **Step 4: Update Managed Site Channels header and empty state**

In `src/features/ManagedSiteChannels/ManagedSiteChannels.tsx`, change the `PageHeader` description prop to:

```tsx
description={t("managedSiteChannels:gatewayGuidance.headerDescription")}
```

Inside the empty table cell branch, replace:

```tsx
<div className="text-muted-foreground text-sm">
  {t("table.empty")}
</div>
```

with:

```tsx
<div className="mx-auto flex max-w-md flex-col items-center gap-3 py-4 text-center">
  <div className="space-y-1">
    <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
      {channels.length === 0
        ? t("gatewayGuidance.empty.title")
        : t("table.empty")}
    </div>
    <div className="text-muted-foreground text-sm">
      {channels.length === 0
        ? t("gatewayGuidance.empty.description")
        : t("gatewayGuidance.empty.filteredDescription")}
    </div>
  </div>
  {channels.length === 0 ? (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() => navigateWithinOptionsPage(`#${MENU_ITEM_IDS.KEYS}`)}
    >
      {t("gatewayGuidance.empty.openKeyManagement")}
    </Button>
  ) : null}
</div>
```

Keep existing filters, table, migration, create, delete, and sync behavior unchanged.

- [ ] **Step 5: Update Managed Site Model Sync optional copy**

In `src/features/ManagedSiteModelSync/ManagedSiteModelSync.tsx`, add this paragraph below `PageHeader` when the page is neither config-missing nor unsupported:

```tsx
{!isModelSyncUnsupported && !isConfigMissing ? (
  <p className="mb-6 text-sm leading-6 text-slate-600 dark:text-slate-400">
    {t("managedSiteModelSync:optionalGuidance.description")}
  </p>
) : null}
```

Also change the existing page description locale value rather than hardcoding text in the component.

- [ ] **Step 6: Add Managed Site locale keys**

Add to `src/locales/en/managedSiteChannels.json`:

```json
"gatewayGuidance": {
  "empty": {
    "description": "Import account keys or saved API credentials as channels before this managed site can serve them from one endpoint.",
    "filteredDescription": "No channels match the current filters. Clear filters to review the gateway channel list.",
    "openKeyManagement": "Open Key Management",
    "title": "No gateway channels yet"
  },
  "headerDescription": "Manage the channels that make your managed site act as the unified API gateway."
}
```

Add to `src/locales/en/managedSiteModelSync.json`:

```json
"optionalGuidance": {
  "description": "Model sync is optional maintenance for supported managed sites. Use it after channels exist to keep model lists, mappings, or routing aligned."
}
```

Change `managedSiteModelSync.description` to:

```json
"description": "Optional model-list maintenance for supported managed-site channels."
```

Translate the same key shape in `zh-CN`, `zh-TW`, `ja`, and `vi`.

- [ ] **Step 7: Run managed-site tests**

Run:

```powershell
pnpm vitest run tests/entrypoints/options/pages/ManagedSiteChannels/ManagedSiteChannels.test.tsx tests/features/ManagedSiteModelSync/ManagedSiteModelSync.test.tsx
```

Expected: PASS.

- [ ] **Step 8: Commit managed-site guidance**

Run:

```powershell
git add src/features/ManagedSiteChannels src/features/ManagedSiteModelSync tests/entrypoints/options/pages/ManagedSiteChannels tests/features/ManagedSiteModelSync src/locales
git commit -m "feat(managed-sites): clarify gateway and model sync guidance"
```

---

### Task 7: Locale Extraction, Related Validation, And Cleanup

**Files:**
- Modify only files that formatting, extraction, or validation proves need task-scoped cleanup.

- [ ] **Step 1: Inspect final task-scoped diff**

Run:

```powershell
git status --porcelain
git diff -- src/features/UnifiedApiGuidance src/features/OptionsOverview src/features/AccountManagement src/features/ApiCredentialProfiles src/features/KeyManagement src/features/ManagedSiteChannels src/features/ManagedSiteModelSync src/services/productAnalytics src/locales tests/features tests/entrypoints/options/pages tests/services/productAnalytics
```

Expected: only task-scoped files from this plan are modified.

- [ ] **Step 2: Run i18n extraction check**

Run:

```powershell
pnpm run i18n:extract:ci
```

Expected: PASS with no unexpected locale rewrites. If it reports missing or removed keys, fix the source `t(...)` calls or locale key shape, then rerun the command.

- [ ] **Step 3: Run focused tests**

Run:

```powershell
pnpm vitest run tests/features/UnifiedApiGuidance/unifiedApiGuidanceModel.test.ts tests/features/UnifiedApiGuidance/UnifiedApiGuidanceCard.test.tsx tests/services/productAnalytics/privacy.test.ts tests/features/OptionsOverview/layout.test.ts tests/features/OptionsOverview/overviewSelectors.test.ts tests/entrypoints/options/pages/OptionsOverview/OptionsOverview.test.tsx tests/features/AccountManagement/AccountManagement.analytics.test.tsx tests/features/AccountManagement/components/NewcomerSupportCard.test.tsx tests/features/AccountManagement/components/AccountDialogWarnings.test.tsx tests/features/ApiCredentialProfiles/ApiCredentialProfilesListView.test.tsx tests/entrypoints/options/pages/KeyManagement/KeyManagement.emptyStateActions.test.tsx tests/entrypoints/options/pages/KeyManagement/TokenList.batchExport.test.tsx tests/entrypoints/options/pages/ManagedSiteChannels/ManagedSiteChannels.test.tsx tests/features/ManagedSiteModelSync/ManagedSiteModelSync.test.tsx
```

Expected: PASS.

- [ ] **Step 4: Run related validation**

Run:

```powershell
pnpm vitest related --run src/features/UnifiedApiGuidance/model.ts src/features/UnifiedApiGuidance/UnifiedApiGuidanceCard.tsx src/features/OptionsOverview/overviewSelectors.ts src/features/OptionsOverview/OptionsOverview.tsx src/features/AccountManagement/AccountManagement.tsx src/features/AccountManagement/components/AccountDialog/AutoDetectErrorAlert.tsx src/features/ApiCredentialProfiles/ApiCredentialProfiles.tsx src/features/KeyManagement/components/Header.tsx src/features/KeyManagement/components/ManagedSiteTokenBatchExportDialog.tsx src/features/ManagedSiteChannels/ManagedSiteChannels.tsx src/features/ManagedSiteModelSync/ManagedSiteModelSync.tsx src/services/productAnalytics/events.ts src/services/productAnalytics/privacy.ts
```

Expected: PASS.

- [ ] **Step 5: Run TypeScript compile**

Run:

```powershell
pnpm compile
```

Expected: PASS. This is required because the slice adds shared UI exports and analytics payload fields.

- [ ] **Step 6: Run the commit gate**

Stage only task-scoped files, then run:

```powershell
pnpm run validate:staged
```

Expected: PASS.

- [ ] **Step 7: Run push gate only before remote handoff**

Run this before pushing or opening a PR:

```powershell
pnpm run validate:push
```

Expected: PASS. This gate is justified because the implementation changes typed analytics payloads, shared exports, and multiple options UI surfaces.

- [ ] **Step 8: Commit final cleanup only if cleanup edits were needed**

If Steps 1-6 required additional cleanup edits, run:

```powershell
git add src/features/UnifiedApiGuidance src/features/OptionsOverview src/features/AccountManagement src/features/ApiCredentialProfiles src/features/KeyManagement src/features/ManagedSiteChannels src/features/ManagedSiteModelSync src/services/productAnalytics src/locales tests/features tests/entrypoints/options/pages tests/services/productAnalytics
git commit -m "chore(options): validate unified api guidance copy"
```

If no cleanup edits were needed after prior task commits, do not create an empty commit.

---

## Follow-up Amendment: Partial Data And Permission Separation (2026-07-31)

Classification: `CONTINUE`. The current task branch still owns the unified API
guidance work, the original architecture remains valid, and the correction
does not require a new spec, branch, or worktree.

### Revised Decisions

- The original spec already required neutral behavior when accounts, API
  credential profiles, or preferences fail to load. The implementation now
  preserves independently available Overview data, withholds source
  conclusions, suppresses dependent setup attention, and provides retry.
- Global optional browser permissions are not unified API readiness. Do not
  render their status or authorization entry inside the unified API card;
  retain the existing first-use onboarding, permission settings, and
  feature-local permission guidance instead.
- The shared permission controller may continue to represent a failed status
  check as unknown rather than denied. That correctness fix is independent of
  unified API guidance.
- No permission-warning impression or guidance-navigation telemetry is needed
  after removing the coupling.
- Settings search remains unchanged because this correction does not add,
  rename, or move a setting or target.
- The original no-Playwright decision remains valid. The temporary unified API
  permission scenario is removed; existing permission-onboarding E2E coverage
  continues to own the actual browser permission flow.

### Completed Follow-up Tasks

- [x] Add regression coverage for partial Overview data and keep unknown source
  inventory from appearing empty.
- [x] Add permission-status tri-state coverage as a shared permission-module
  correctness fix.
- [x] Add regression coverage that keeps unrelated optional permissions out of
  unified API guidance.
- [x] Keep retry focus stable while exposing busy and disabled semantics.
- [x] Update every current app locale (`en`, `es-419`, `ja`, `vi`, `zh-CN`,
  and `zh-TW`).
- [x] Remove the temporary unified API permission Playwright scenario while
  preserving the existing permission-onboarding and settings scenarios.

This amendment supersedes the permission-guidance portions of `520c5983e` and
`6ade19d5a`; their partial-data and shared permission-status corrections remain
valid.

`pnpm run validate:push` remains a pre-remote requirement and was not run
because this follow-up was not pushed and no PR was created.

---

## Final Verification Checklist

- [ ] Overview explains that All API Hub is not the runtime API endpoint.
- [ ] Overview shows state-aware next actions for no sources, missing managed-site config, account-backed sources, profile-only sources, mixed sources, and optional model sync.
- [ ] Account Management explains accounts as source inventory without replacing existing account operations.
- [ ] Account auto-detect recognition failures offer API Credential Profiles as the primary continuation and site-support reporting as a secondary path.
- [ ] API Credential Profiles describe API credentials (token / API key) as lightweight sources for verification, reuse, direct export, and individual channel setup.
- [ ] Key Management copy distinguishes managed-site import from direct client-tool export.
- [ ] Managed Site Channels copy frames channels as the gateway work surface and routes empty configured sites to Key Management.
- [ ] Managed Site Model Sync is described as optional maintenance, not setup required for unified API usage.
- [ ] Direct tool export is not described as a step in the managed-site gateway path.
- [ ] Partial local-store failures keep available Overview data visible without reporting unknown source inventory as empty.
- [ ] Unrelated optional browser permissions do not appear as unified API setup requirements or readiness warnings.
- [ ] No runtime API proxy, local server, cloud relay, new dependency, managed-site provider rewrite, channel-count background load, or Playwright E2E was added.
- [ ] New telemetry records only controlled guidance status/action-kind enums, existing surface ids, existing target page ids, route-param presence, and sanitized managed-site type.
- [ ] New analytics fields are present in payload types, allow-list, enum allow-list, and privacy tests.
- [ ] Locale key shapes match across `en`, `es-419`, `zh-CN`, `zh-TW`, `ja`, and `vi`.
- [ ] `pnpm run i18n:extract:ci` passes.
- [ ] Focused Vitest tests pass.
- [ ] Related Vitest validation passes.
- [ ] `pnpm compile` passes.
- [ ] `pnpm run validate:staged` passes.
- [ ] `pnpm run validate:push` passes before PR or remote handoff.

## Self-Review Notes

- Spec coverage: the plan covers product boundary, state-aware guidance, Overview, Account Management, detection failure recovery, API Credential Profiles, Key Management, Managed Site Channels, Managed Site Model Sync, telemetry, i18n, and validation. Channel-count awareness and batch profile import are explicitly excluded because the spec allows them to remain outside the first slice.
- Placeholder scan: no task relies on open-ended instructions such as unspecified validation, unstated files, or undefined functions. Locale translation work has fixed key shape and English source copy; sibling locale content must be filled with concrete translations in the same task before validation.
- Type consistency: `UnifiedApiGuidanceModel`, `UnifiedApiGuidanceAction`, guidance statuses, action kinds, analytics constants, and route targets are defined before any rendering or telemetry task uses them.
