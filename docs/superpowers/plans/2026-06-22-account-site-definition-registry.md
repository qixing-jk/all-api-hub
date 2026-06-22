# Account Site Definition Registry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add one account-site definition registry so new account site types start from one registration row while existing onboarding, adapter, profile, and Model List seams keep their current responsibilities.

**Architecture:** Create `src/services/accountSiteDefinitions/` as the stable registration source for site identifiers, account/managed scopes, adapter family, onboarding metadata, product profile overrides, and readiness expectations. Keep `src/constants/siteType.ts` and `src/services/accountSiteOnboarding/**` as compatibility facades/projections, keep runtime backend behavior in `SiteAdapter`, and keep product-profile helper behavior in `accountSiteProfile`.

**Tech Stack:** TypeScript, Vitest, WXT extension services, MSW-backed service tests, pnpm.

**Spec:** `docs/superpowers/specs/2026-06-22-account-site-definition-registry-design.md`

---

## File Structure

Create:

- `src/services/accountSiteDefinitions/identifiers.ts`
  - Own `SITE_TYPES`, AIHubMix constants, and the broad `SiteType` literal union.
- `src/services/accountSiteDefinitions/contracts.ts`
  - Own definition scopes, adapter-family constants, registration data shapes, and projection helper types.
- `src/services/accountSiteDefinitions/definitions.ts`
  - Own the account-site and managed-only definition rows.
- `src/services/accountSiteDefinitions/registry.ts`
  - Own cloning, lookup, and projection helpers for definitions.
- `src/services/accountSiteDefinitions/siteTypes.ts`
  - Export compatibility site-type arrays and `AccountSiteType` / `ManagedSiteType` derived from definition rows.
- `src/services/accountSiteDefinitions/index.ts`
  - Public barrel for definition registry callers.
- `tests/services/accountSiteDefinitions/registry.test.ts`
  - Direct completeness and projection tests for the definition registry.
- `tests/services/modelList/accountSources/readiness.definitions.test.ts`
  - Integration-style tests that compare definition readiness expectations with actual readiness results.

Modify:

- `src/services/accountSiteOnboarding/contracts.ts`
  - Re-export shared route/detection/adapter-family definition contracts while keeping content-session extractor types local.
- `src/services/accountSiteOnboarding/siteTypes.ts`
  - Become a compatibility facade over `accountSiteDefinitions/siteTypes`.
- `src/constants/siteType.ts`
  - Continue to export the same public constants and helpers from the facade.
- `src/services/accountSiteOnboarding/metadata.ts`
  - Project onboarding metadata from account-site definitions instead of owning a separate metadata table.
- `src/services/accountSiteOnboarding/registry.ts`
  - Keep the public onboarding helper names, now backed by definition projections.
- `tests/services/accountSiteOnboarding/registry.test.ts`
  - Add coverage that onboarding projections come from defensive definition copies.
- `tests/services/detectSiteType.test.ts`
  - Keep current domain/title/compat-header detection behavior.
- `src/services/accounts/accountSiteProfile/profiles.ts`
  - Keep the default compatible product profile; stop owning site-specific override rows.
- `src/services/accounts/accountSiteProfile/registry.ts`
  - Resolve site-specific profile overrides from account-site definitions.
- `tests/services/accounts/accountSiteProfile.test.ts`
  - Assert the profile behavior remains unchanged and overrides are no longer exported by the profile barrel.
- `src/services/apiAdapters/registry.ts`
  - Keep routing through `getAccountSiteAdapterFamily(...)`; no behavior change expected after onboarding projection moves.
- `tests/services/apiAdapters/registry.test.ts`
  - Keep adapter-family routing coverage.
- Existing Model List / Key Management tests
  - Update only if the targeted raw `SITE_TYPES` cleanup changes a touched policy path.

Do not modify:

- `src/services/apiAdapters/**` concrete adapter implementations, except imports required by type movement.
- `src/services/managedSites/**`
- `src/services/models/modelSync/**`
- `src/locales/**`
- telemetry schemas, privacy allow-lists, settings search definitions, or Playwright E2E tests.
- persisted schema field names such as `sub2apiAuth`.

---

## Implementation Notes

This is a behavior-preserving registration refactor.

Preserve these public imports:

```ts
import {
  ACCOUNT_SITE_ADAPTER_FAMILIES,
  ACCOUNT_SITE_TYPES,
  ACCOUNT_SITE_TYPE_VALUES,
  AIHUBMIX_API_ORIGIN,
  AIHUBMIX_HOSTNAMES,
  AIHUBMIX_LOGIN_PATH,
  AIHUBMIX_WEB_ORIGIN,
  MANAGED_SITE_TYPES,
  SITE_TYPES,
  isAccountSiteType,
  isManagedSiteType,
} from "~/constants/siteType"
```

Keep this ownership split:

- account-site definitions own stable registration data;
- onboarding owns projection helpers and content-session extractor ordering;
- adapters own backend protocol behavior;
- product profiles own merge behavior and saved-account product helpers;
- Model List readiness owns runtime route resolution.

Telemetry decision: none. No analytics events or fields change.

Settings search decision: none. No settings UI, anchors, deep links, or search definitions change.

E2E decision: no new Playwright E2E by default. Registry projection and policy routing are deterministic and covered by Vitest.

---

### Task 1: Add Definition Module And Completeness Tests

**Files:**

- Create: `src/services/accountSiteDefinitions/identifiers.ts`
- Create: `src/services/accountSiteDefinitions/contracts.ts`
- Create: `src/services/accountSiteDefinitions/definitions.ts`
- Create: `src/services/accountSiteDefinitions/registry.ts`
- Create: `src/services/accountSiteDefinitions/siteTypes.ts`
- Create: `src/services/accountSiteDefinitions/index.ts`
- Create: `tests/services/accountSiteDefinitions/registry.test.ts`

- [ ] **Step 1: Write failing definition registry tests**

Create `tests/services/accountSiteDefinitions/registry.test.ts`:

```ts
import { describe, expect, it } from "vitest"

import {
  ACCOUNT_SITE_ADAPTER_FAMILIES,
  ACCOUNT_SITE_DEFINITION_SCOPES,
  ACCOUNT_SITE_TYPES,
  AIHUBMIX_HOSTNAMES,
  MANAGED_SITE_TYPES,
  SITE_TYPES,
  getAccountSiteDefinition,
  getAccountSiteDefinitions,
  getAccountSiteOnboardingDefinitions,
  getAccountSiteProductProfileOverride,
  getAccountSiteReadinessExpectation,
  getAccountSiteTypeValues,
  getManagedSiteTypeValues,
} from "~/services/accountSiteDefinitions"
import {
  ACCOUNT_SITE_MODEL_LIST_DISPLAY_CAPABILITY_SOURCES,
  ACCOUNT_SITE_MODEL_LIST_STATUS_SCOPES,
  ACCOUNT_SITE_MODEL_LIST_TOKEN_SCOPED_CATALOG_FALLBACKS,
  ACCOUNT_SITE_SUPPLEMENTAL_AUTH_KINDS,
} from "~/services/accounts/accountSiteProfile"
import { MODEL_LIST_ACCOUNT_SOURCE_ROUTES } from "~/services/modelList/accountSources/readiness"
import { AuthTypeEnum } from "~/types"

describe("accountSiteDefinitions registry", () => {
  it("keeps account site membership as a definition projection", () => {
    expect(getAccountSiteTypeValues()).toEqual([...ACCOUNT_SITE_TYPES])
    expect(getAccountSiteTypeValues()).toEqual([
      SITE_TYPES.ONE_API,
      SITE_TYPES.NEW_API,
      SITE_TYPES.ANYROUTER,
      SITE_TYPES.VELOERA,
      SITE_TYPES.ONE_HUB,
      SITE_TYPES.DONE_HUB,
      SITE_TYPES.V_API,
      SITE_TYPES.VO_API,
      SITE_TYPES.SUPER_API,
      SITE_TYPES.RIX_API,
      SITE_TYPES.NEO_API,
      SITE_TYPES.WONG_GONGYI,
      SITE_TYPES.SUB2API,
      SITE_TYPES.AIHUBMIX,
      SITE_TYPES.UNKNOWN,
    ])
  })

  it("keeps managed site membership as a definition projection", () => {
    expect(getManagedSiteTypeValues()).toEqual([...MANAGED_SITE_TYPES])
    expect(getManagedSiteTypeValues()).toEqual([
      SITE_TYPES.NEW_API,
      SITE_TYPES.VELOERA,
      SITE_TYPES.DONE_HUB,
      SITE_TYPES.OCTOPUS,
      SITE_TYPES.AXON_HUB,
      SITE_TYPES.CLAUDE_CODE_HUB,
    ])
  })

  it("contains no duplicate site type definitions", () => {
    const siteTypes = getAccountSiteDefinitions().map(
      (definition) => definition.siteType,
    )

    expect(new Set(siteTypes).size).toBe(siteTypes.length)
  })

  it("resolves account-scoped definitions for every account site type", () => {
    for (const siteType of ACCOUNT_SITE_TYPES) {
      const definition = getAccountSiteDefinition(siteType)
      expect(definition, `${siteType} definition is missing`).toBeDefined()
      expect(definition?.scopes).toContain(
        ACCOUNT_SITE_DEFINITION_SCOPES.Account,
      )
      expect(definition?.adapterFamily).toBeTruthy()
    }
  })

  it("resolves managed-scoped definitions for every managed site type", () => {
    for (const siteType of MANAGED_SITE_TYPES) {
      const definition = getAccountSiteDefinition(siteType)
      expect(definition, `${siteType} definition is missing`).toBeDefined()
      expect(definition?.scopes).toContain(
        ACCOUNT_SITE_DEFINITION_SCOPES.Managed,
      )
    }
  })

  it("projects adapter families from definitions", () => {
    expect(getAccountSiteDefinition(SITE_TYPES.NEW_API)?.adapterFamily).toBe(
      ACCOUNT_SITE_ADAPTER_FAMILIES.NewApiFamily,
    )
    expect(getAccountSiteDefinition(SITE_TYPES.SUB2API)?.adapterFamily).toBe(
      ACCOUNT_SITE_ADAPTER_FAMILIES.Sub2Api,
    )
    expect(getAccountSiteDefinition(SITE_TYPES.AIHUBMIX)?.adapterFamily).toBe(
      ACCOUNT_SITE_ADAPTER_FAMILIES.Aihubmix,
    )
    expect(getAccountSiteDefinition(SITE_TYPES.OCTOPUS)?.adapterFamily).toBe(
      ACCOUNT_SITE_ADAPTER_FAMILIES.Unsupported,
    )
  })

  it("projects onboarding metadata from definitions", () => {
    const onboardingDefinitions = getAccountSiteOnboardingDefinitions()

    expect(onboardingDefinitions.map((definition) => definition.siteType)).toEqual(
      [...ACCOUNT_SITE_TYPES],
    )
    expect(
      onboardingDefinitions.find(
        (definition) => definition.siteType === SITE_TYPES.AIHUBMIX,
      )?.detection?.hostnames,
    ).toEqual([...AIHUBMIX_HOSTNAMES])
    expect(
      onboardingDefinitions.find(
        (definition) => definition.siteType === SITE_TYPES.SUB2API,
      )?.routes,
    ).toMatchObject({
      usagePath: "/usage",
      redeemPath: "/redeem",
      siteAnnouncementsPath: "/dashboard",
    })
  })

  it("returns defensive copies for definitions and projections", () => {
    const first = getAccountSiteDefinition(SITE_TYPES.AIHUBMIX)
    ;(first!.onboarding!.detection!.hostnames as string[]).push(
      "mutated.example.invalid",
    )
    first!.adapterFamily = ACCOUNT_SITE_ADAPTER_FAMILIES.Unsupported

    const second = getAccountSiteDefinition(SITE_TYPES.AIHUBMIX)
    expect(second?.adapterFamily).toBe(ACCOUNT_SITE_ADAPTER_FAMILIES.Aihubmix)
    expect(second?.onboarding?.detection?.hostnames).toEqual([
      ...AIHUBMIX_HOSTNAMES,
    ])
  })

  it("projects product-profile overrides from definitions", () => {
    expect(getAccountSiteProductProfileOverride(SITE_TYPES.ANYROUTER)).toMatchObject({
      auth: {
        defaultAuthType: AuthTypeEnum.Cookie,
        defaultAuthHostnames: ["anyrouter.top"],
      },
    })
    expect(getAccountSiteProductProfileOverride(SITE_TYPES.SUB2API)).toMatchObject({
      authSession: {
        kind: ACCOUNT_SITE_SUPPLEMENTAL_AUTH_KINDS.Sub2ApiRefreshToken,
        decoratesAccountApiRequests: true,
      },
      modelList: {
        tokenScopedCatalogFallback:
          ACCOUNT_SITE_MODEL_LIST_TOKEN_SCOPED_CATALOG_FALLBACKS.RuntimeKey,
        statusScope: ACCOUNT_SITE_MODEL_LIST_STATUS_SCOPES.Token,
      },
    })
    expect(getAccountSiteProductProfileOverride(SITE_TYPES.AIHUBMIX)).toMatchObject({
      modelList: {
        displayCapabilitiesSource:
          ACCOUNT_SITE_MODEL_LIST_DISPLAY_CAPABILITY_SOURCES.Profile,
      },
    })
  })

  it("projects Model List readiness expectations from definitions", () => {
    expect(getAccountSiteReadinessExpectation(SITE_TYPES.NEW_API)?.modelList).toEqual({
      expectedRoute: MODEL_LIST_ACCOUNT_SOURCE_ROUTES.DirectPricing,
    })
    expect(getAccountSiteReadinessExpectation(SITE_TYPES.SUB2API)?.modelList).toEqual({
      expectedRoute: MODEL_LIST_ACCOUNT_SOURCE_ROUTES.TokenScopedRuntimeCatalog,
    })
    expect(getAccountSiteReadinessExpectation(SITE_TYPES.AIHUBMIX)?.modelList).toEqual({
      expectedRoute: MODEL_LIST_ACCOUNT_SOURCE_ROUTES.DirectPricing,
    })
  })
})
```

- [ ] **Step 2: Run the failing test**

Run:

```powershell
pnpm vitest run tests/services/accountSiteDefinitions/registry.test.ts
```

Expected: FAIL with an import error for `~/services/accountSiteDefinitions`.

- [ ] **Step 3: Create `identifiers.ts`**

Create `src/services/accountSiteDefinitions/identifiers.ts`:

```ts
export const SITE_TYPES = {
  ONE_API: "one-api",
  NEW_API: "new-api",
  ANYROUTER: "anyrouter",
  VELOERA: "Veloera",
  ONE_HUB: "one-hub",
  DONE_HUB: "done-hub",
  V_API: "v-api",
  VO_API: "VoAPI",
  SUPER_API: "Super-API",
  RIX_API: "Rix-Api",
  NEO_API: "neo-Api",
  WONG_GONGYI: "wong-gongyi",
  SUB2API: "sub2api",
  OCTOPUS: "octopus",
  AXON_HUB: "axonhub",
  CLAUDE_CODE_HUB: "claude-code-hub",
  AIHUBMIX: "AIHubMix",
  UNKNOWN: "unknown",
} as const

export type SiteType = (typeof SITE_TYPES)[keyof typeof SITE_TYPES]

export const AIHUBMIX_API_ORIGIN = "https://aihubmix.com"
export const AIHUBMIX_WEB_ORIGIN = "https://console.aihubmix.com"
export const AIHUBMIX_LOGIN_PATH = "/sign-in"
export const AIHUBMIX_HOSTNAMES = [
  "aihubmix.com",
  "www.aihubmix.com",
  "console.aihubmix.com",
] as const
```

- [ ] **Step 4: Create `contracts.ts`**

Create `src/services/accountSiteDefinitions/contracts.ts`:

```ts
import type { AccountSiteProductProfile } from "~/services/accounts/accountSiteProfile/contracts"

import type { SiteType } from "./identifiers"

export type AccountSiteRouteConfig = {
  loginPath?: string
  usagePath?: string
  checkInPath?: string
  adminCredentialsPath?: string
  redeemPath?: string
  siteAnnouncementsPath?: string
}

export type AccountSiteDetectionMetadata = {
  titlePatterns?: readonly RegExp[]
  hostnames?: readonly string[]
  compatUserIdHeaderNames?: readonly string[]
}

export const ACCOUNT_SITE_ADAPTER_FAMILIES = {
  NewApiFamily: "newApiFamily",
  Sub2Api: "sub2api",
  Aihubmix: "aihubmix",
  Unsupported: "unsupported",
} as const

export type AccountSiteAdapterFamily =
  (typeof ACCOUNT_SITE_ADAPTER_FAMILIES)[keyof typeof ACCOUNT_SITE_ADAPTER_FAMILIES]

export const ACCOUNT_SITE_DEFINITION_SCOPES = {
  Account: "account",
  Managed: "managed",
} as const

export type AccountSiteDefinitionScope =
  (typeof ACCOUNT_SITE_DEFINITION_SCOPES)[keyof typeof ACCOUNT_SITE_DEFINITION_SCOPES]

export type AccountSiteDefinitionOnboardingMetadata = {
  detection?: AccountSiteDetectionMetadata
  routes?: AccountSiteRouteConfig
}

export const ACCOUNT_SITE_MODEL_LIST_EXPECTED_ROUTES = {
  DirectPricing: "direct_pricing",
  TokenScopedRuntimeCatalog: "token_scoped_runtime_catalog",
  Unsupported: "unsupported",
} as const

export type AccountSiteModelListExpectedRoute =
  (typeof ACCOUNT_SITE_MODEL_LIST_EXPECTED_ROUTES)[keyof typeof ACCOUNT_SITE_MODEL_LIST_EXPECTED_ROUTES]

export type AccountSiteDefinitionReadiness = {
  modelList?: {
    expectedRoute: AccountSiteModelListExpectedRoute
  }
}

export type AccountSiteDefinition = {
  siteType: SiteType
  scopes: readonly AccountSiteDefinitionScope[]
  adapterFamily: AccountSiteAdapterFamily
  onboarding?: AccountSiteDefinitionOnboardingMetadata
  productProfile?: Partial<AccountSiteProductProfile>
  readiness?: AccountSiteDefinitionReadiness
}
```

- [ ] **Step 5: Create definition rows**

Create `src/services/accountSiteDefinitions/definitions.ts`.

Use the existing route and detection values from `src/services/accountSiteOnboarding/metadata.ts`, and place every row in one of these arrays:

```ts
import {
  ACCOUNT_SITE_AUTH_SESSION_REFRESH_LOCK_SCOPES,
  ACCOUNT_SITE_CREATED_TOKEN_SECRET_HANDLING,
  ACCOUNT_SITE_MODEL_LIST_DASHBOARD_ESTIMATE_LOADERS,
  ACCOUNT_SITE_MODEL_LIST_DIRECT_PRICING,
  ACCOUNT_SITE_MODEL_LIST_DISPLAY_CAPABILITY_SOURCES,
  ACCOUNT_SITE_MODEL_LIST_STATUS_SCOPES,
  ACCOUNT_SITE_MODEL_LIST_TOKEN_SCOPED_CATALOG_FALLBACKS,
  ACCOUNT_SITE_SUPPLEMENTAL_AUTH_KINDS,
  ACCOUNT_SITE_TOKEN_FORM_NETWORK_LIMIT_POLICIES,
} from "~/services/accounts/accountSiteProfile/contracts"
import { AuthTypeEnum } from "~/types"

import {
  ACCOUNT_SITE_ADAPTER_FAMILIES,
  ACCOUNT_SITE_DEFINITION_SCOPES,
  ACCOUNT_SITE_MODEL_LIST_EXPECTED_ROUTES,
  type AccountSiteDefinition,
} from "./contracts"
import {
  AIHUBMIX_API_ORIGIN,
  AIHUBMIX_HOSTNAMES,
  AIHUBMIX_LOGIN_PATH,
  AIHUBMIX_WEB_ORIGIN,
  SITE_TYPES,
} from "./identifiers"

function makeTitleRegex(name: string): RegExp {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const pattern = escaped.replace(/-/g, "[-_ ]?")
  return new RegExp(`\\b${pattern}\\b`, "i")
}

const DEFAULT_USAGE_PATH = "/console/log"
const DEFAULT_CHECKIN_PATH = "/console/personal"

export const ACCOUNT_SITE_DEFINITIONS = [
  {
    siteType: SITE_TYPES.ONE_API,
    scopes: [ACCOUNT_SITE_DEFINITION_SCOPES.Account],
    adapterFamily: ACCOUNT_SITE_ADAPTER_FAMILIES.NewApiFamily,
    onboarding: {
      detection: { titlePatterns: [makeTitleRegex(SITE_TYPES.ONE_API)] },
      routes: { usagePath: DEFAULT_USAGE_PATH },
    },
    readiness: {
      modelList: {
        expectedRoute: ACCOUNT_SITE_MODEL_LIST_EXPECTED_ROUTES.DirectPricing,
      },
    },
  },
  {
    siteType: SITE_TYPES.NEW_API,
    scopes: [
      ACCOUNT_SITE_DEFINITION_SCOPES.Account,
      ACCOUNT_SITE_DEFINITION_SCOPES.Managed,
    ],
    adapterFamily: ACCOUNT_SITE_ADAPTER_FAMILIES.NewApiFamily,
    onboarding: {
      detection: { titlePatterns: [makeTitleRegex(SITE_TYPES.NEW_API)] },
      routes: {
        usagePath: DEFAULT_USAGE_PATH,
        checkInPath: DEFAULT_CHECKIN_PATH,
        adminCredentialsPath: DEFAULT_CHECKIN_PATH,
      },
    },
    readiness: {
      modelList: {
        expectedRoute: ACCOUNT_SITE_MODEL_LIST_EXPECTED_ROUTES.DirectPricing,
      },
    },
  },
  {
    siteType: SITE_TYPES.ANYROUTER,
    scopes: [ACCOUNT_SITE_DEFINITION_SCOPES.Account],
    adapterFamily: ACCOUNT_SITE_ADAPTER_FAMILIES.NewApiFamily,
    onboarding: {
      detection: { titlePatterns: [/\\bany\\s*router\\b/i] },
      routes: { checkInPath: "/console/topup" },
    },
    productProfile: {
      auth: {
        defaultAuthType: AuthTypeEnum.Cookie,
        defaultAuthHostnames: ["anyrouter.top"],
      },
    },
    readiness: {
      modelList: {
        expectedRoute: ACCOUNT_SITE_MODEL_LIST_EXPECTED_ROUTES.DirectPricing,
      },
    },
  },
  {
    siteType: SITE_TYPES.SUB2API,
    scopes: [ACCOUNT_SITE_DEFINITION_SCOPES.Account],
    adapterFamily: ACCOUNT_SITE_ADAPTER_FAMILIES.Sub2Api,
    onboarding: {
      detection: { titlePatterns: [makeTitleRegex(SITE_TYPES.SUB2API)] },
      routes: {
        usagePath: "/usage",
        redeemPath: "/redeem",
        siteAnnouncementsPath: "/dashboard",
      },
    },
    productProfile: {
      auth: {
        allowedAuthTypes: [AuthTypeEnum.AccessToken],
        defaultAuthType: AuthTypeEnum.AccessToken,
        defaultAuthHostnames: [],
        supportsCookieAuth: false,
        supportsBuiltInCheckInDetection: false,
      },
      authSession: {
        kind: ACCOUNT_SITE_SUPPLEMENTAL_AUTH_KINDS.Sub2ApiRefreshToken,
        decoratesAccountApiRequests: true,
        refreshLockScope: ACCOUNT_SITE_AUTH_SESSION_REFRESH_LOCK_SCOPES.Account,
      },
      identity: {
        usernameRequired: false,
        storedUserIdentityFields: ["id"],
      },
      modelList: {
        directPricing: ACCOUNT_SITE_MODEL_LIST_DIRECT_PRICING.Unsupported,
        tokenScopedCatalogFallback:
          ACCOUNT_SITE_MODEL_LIST_TOKEN_SCOPED_CATALOG_FALLBACKS.RuntimeKey,
        dashboardEstimateLoader:
          ACCOUNT_SITE_MODEL_LIST_DASHBOARD_ESTIMATE_LOADERS.Sub2Api,
        statusScope: ACCOUNT_SITE_MODEL_LIST_STATUS_SCOPES.Token,
        displayCapabilitiesSource:
          ACCOUNT_SITE_MODEL_LIST_DISPLAY_CAPABILITY_SOURCES.Response,
      },
      supplementalAuth: {
        kind: ACCOUNT_SITE_SUPPLEMENTAL_AUTH_KINDS.Sub2ApiRefreshToken,
      },
    },
    readiness: {
      modelList: {
        expectedRoute:
          ACCOUNT_SITE_MODEL_LIST_EXPECTED_ROUTES.TokenScopedRuntimeCatalog,
      },
    },
  },
  {
    siteType: SITE_TYPES.AIHUBMIX,
    scopes: [ACCOUNT_SITE_DEFINITION_SCOPES.Account],
    adapterFamily: ACCOUNT_SITE_ADAPTER_FAMILIES.Aihubmix,
    onboarding: {
      detection: {
        titlePatterns: [makeTitleRegex(SITE_TYPES.AIHUBMIX)],
        hostnames: AIHUBMIX_HOSTNAMES,
      },
      routes: {
        loginPath: AIHUBMIX_LOGIN_PATH,
        usagePath: "/statistics",
        redeemPath: "/topup",
        checkInPath: "/",
        adminCredentialsPath: "/",
      },
    },
    productProfile: {
      auth: {
        allowedAuthTypes: [AuthTypeEnum.AccessToken],
        defaultAuthType: AuthTypeEnum.AccessToken,
        defaultAuthHostnames: [],
        supportsCookieAuth: false,
        supportsBuiltInCheckInDetection: true,
      },
      createdToken: {
        secretHandling:
          ACCOUNT_SITE_CREATED_TOKEN_SECRET_HANDLING.OneTimeSecretDialog,
      },
      identity: {
        usernameRequired: true,
        storedUserIdentityFields: ["username"],
      },
      modelList: {
        directPricing: ACCOUNT_SITE_MODEL_LIST_DIRECT_PRICING.Supported,
        tokenScopedCatalogFallback:
          ACCOUNT_SITE_MODEL_LIST_TOKEN_SCOPED_CATALOG_FALLBACKS.None,
        dashboardEstimateLoader:
          ACCOUNT_SITE_MODEL_LIST_DASHBOARD_ESTIMATE_LOADERS.None,
        statusScope: ACCOUNT_SITE_MODEL_LIST_STATUS_SCOPES.Account,
        displayCapabilitiesSource:
          ACCOUNT_SITE_MODEL_LIST_DISPLAY_CAPABILITY_SOURCES.Profile,
      },
      tokenForm: {
        networkLimitPolicy:
          ACCOUNT_SITE_TOKEN_FORM_NETWORK_LIMIT_POLICIES.SubnetLimit,
      },
      urls: {
        recognizedHostnames: AIHUBMIX_HOSTNAMES,
        storageOrigin: AIHUBMIX_WEB_ORIGIN,
        duplicateOrigin: AIHUBMIX_WEB_ORIGIN,
        managedChannelOrigin: AIHUBMIX_API_ORIGIN,
      },
    },
    readiness: {
      modelList: {
        expectedRoute: ACCOUNT_SITE_MODEL_LIST_EXPECTED_ROUTES.DirectPricing,
      },
    },
  },
] as const satisfies readonly AccountSiteDefinition[]

export const MANAGED_ONLY_SITE_DEFINITIONS = [
  {
    siteType: SITE_TYPES.OCTOPUS,
    scopes: [ACCOUNT_SITE_DEFINITION_SCOPES.Managed],
    adapterFamily: ACCOUNT_SITE_ADAPTER_FAMILIES.Unsupported,
  },
  {
    siteType: SITE_TYPES.AXON_HUB,
    scopes: [ACCOUNT_SITE_DEFINITION_SCOPES.Managed],
    adapterFamily: ACCOUNT_SITE_ADAPTER_FAMILIES.Unsupported,
  },
  {
    siteType: SITE_TYPES.CLAUDE_CODE_HUB,
    scopes: [ACCOUNT_SITE_DEFINITION_SCOPES.Managed],
    adapterFamily: ACCOUNT_SITE_ADAPTER_FAMILIES.Unsupported,
  },
] as const satisfies readonly AccountSiteDefinition[]

export const ACCOUNT_SITE_DEFINITION_OVERRIDES = [
  {
    siteType: SITE_TYPES.VELOERA,
    scopes: [
      ACCOUNT_SITE_DEFINITION_SCOPES.Account,
      ACCOUNT_SITE_DEFINITION_SCOPES.Managed,
    ],
    adapterFamily: ACCOUNT_SITE_ADAPTER_FAMILIES.NewApiFamily,
    onboarding: {
      detection: { titlePatterns: [makeTitleRegex(SITE_TYPES.VELOERA)] },
      routes: {
        usagePath: "/app/logs/api-usage",
        checkInPath: "/app/me",
        redeemPath: "/app/wallet",
        adminCredentialsPath: "/app/me",
      },
    },
    readiness: {
      modelList: {
        expectedRoute: ACCOUNT_SITE_MODEL_LIST_EXPECTED_ROUTES.DirectPricing,
      },
    },
  },
  {
    siteType: SITE_TYPES.DONE_HUB,
    scopes: [
      ACCOUNT_SITE_DEFINITION_SCOPES.Account,
      ACCOUNT_SITE_DEFINITION_SCOPES.Managed,
    ],
    adapterFamily: ACCOUNT_SITE_ADAPTER_FAMILIES.NewApiFamily,
    onboarding: {
      detection: { titlePatterns: [makeTitleRegex(SITE_TYPES.DONE_HUB)] },
      routes: {
        usagePath: "/panel/log",
        redeemPath: "/panel/topup",
        adminCredentialsPath: "/panel/profile",
      },
    },
    readiness: {
      modelList: {
        expectedRoute: ACCOUNT_SITE_MODEL_LIST_EXPECTED_ROUTES.DirectPricing,
      },
    },
  },
] as const satisfies readonly AccountSiteDefinition[]
```

Then add the remaining account rows in the same file with the current values from `accountSiteOnboarding/metadata.ts`:

```ts
export const COMPATIBLE_ACCOUNT_SITE_DEFINITIONS = [
  {
    siteType: SITE_TYPES.ONE_HUB,
    scopes: [ACCOUNT_SITE_DEFINITION_SCOPES.Account],
    adapterFamily: ACCOUNT_SITE_ADAPTER_FAMILIES.NewApiFamily,
    onboarding: {
      detection: { titlePatterns: [makeTitleRegex(SITE_TYPES.ONE_HUB)] },
      routes: {
        usagePath: "/panel/log",
        redeemPath: "/panel/topup",
        adminCredentialsPath: "/panel/profile",
      },
    },
    readiness: {
      modelList: {
        expectedRoute: ACCOUNT_SITE_MODEL_LIST_EXPECTED_ROUTES.DirectPricing,
      },
    },
  },
  {
    siteType: SITE_TYPES.V_API,
    scopes: [ACCOUNT_SITE_DEFINITION_SCOPES.Account],
    adapterFamily: ACCOUNT_SITE_ADAPTER_FAMILIES.NewApiFamily,
    onboarding: {
      detection: { titlePatterns: [makeTitleRegex(SITE_TYPES.V_API)] },
      routes: {
        usagePath: "/panel/log",
        checkInPath: "/panel/profile",
        redeemPath: "/panel/topup",
        adminCredentialsPath: "/panel/profile",
      },
    },
    readiness: {
      modelList: {
        expectedRoute: ACCOUNT_SITE_MODEL_LIST_EXPECTED_ROUTES.DirectPricing,
      },
    },
  },
  {
    siteType: SITE_TYPES.VO_API,
    scopes: [ACCOUNT_SITE_DEFINITION_SCOPES.Account],
    adapterFamily: ACCOUNT_SITE_ADAPTER_FAMILIES.NewApiFamily,
    onboarding: {
      detection: { titlePatterns: [makeTitleRegex(SITE_TYPES.VO_API)] },
      routes: { usagePath: DEFAULT_USAGE_PATH, redeemPath: "/wallet" },
    },
    readiness: {
      modelList: {
        expectedRoute: ACCOUNT_SITE_MODEL_LIST_EXPECTED_ROUTES.DirectPricing,
      },
    },
  },
  {
    siteType: SITE_TYPES.SUPER_API,
    scopes: [ACCOUNT_SITE_DEFINITION_SCOPES.Account],
    adapterFamily: ACCOUNT_SITE_ADAPTER_FAMILIES.NewApiFamily,
    onboarding: {
      detection: { titlePatterns: [makeTitleRegex(SITE_TYPES.SUPER_API)] },
    },
    readiness: {
      modelList: {
        expectedRoute: ACCOUNT_SITE_MODEL_LIST_EXPECTED_ROUTES.DirectPricing,
      },
    },
  },
  {
    siteType: SITE_TYPES.RIX_API,
    scopes: [ACCOUNT_SITE_DEFINITION_SCOPES.Account],
    adapterFamily: ACCOUNT_SITE_ADAPTER_FAMILIES.NewApiFamily,
    onboarding: {
      detection: { titlePatterns: [makeTitleRegex(SITE_TYPES.RIX_API)] },
      routes: {
        usagePath: "/log",
        checkInPath: "/panel",
        redeemPath: "/topup",
      },
    },
    readiness: {
      modelList: {
        expectedRoute: ACCOUNT_SITE_MODEL_LIST_EXPECTED_ROUTES.DirectPricing,
      },
    },
  },
  {
    siteType: SITE_TYPES.NEO_API,
    scopes: [ACCOUNT_SITE_DEFINITION_SCOPES.Account],
    adapterFamily: ACCOUNT_SITE_ADAPTER_FAMILIES.NewApiFamily,
    onboarding: {
      detection: { titlePatterns: [makeTitleRegex(SITE_TYPES.NEO_API)] },
    },
    readiness: {
      modelList: {
        expectedRoute: ACCOUNT_SITE_MODEL_LIST_EXPECTED_ROUTES.DirectPricing,
      },
    },
  },
  {
    siteType: SITE_TYPES.WONG_GONGYI,
    scopes: [ACCOUNT_SITE_DEFINITION_SCOPES.Account],
    adapterFamily: ACCOUNT_SITE_ADAPTER_FAMILIES.NewApiFamily,
    onboarding: {
      detection: { titlePatterns: [/wong\\s*公益站/i] },
      routes: { checkInPath: "/console/topup" },
    },
    readiness: {
      modelList: {
        expectedRoute: ACCOUNT_SITE_MODEL_LIST_EXPECTED_ROUTES.DirectPricing,
      },
    },
  },
  {
    siteType: SITE_TYPES.UNKNOWN,
    scopes: [ACCOUNT_SITE_DEFINITION_SCOPES.Account],
    adapterFamily: ACCOUNT_SITE_ADAPTER_FAMILIES.NewApiFamily,
    onboarding: {
      detection: { titlePatterns: [makeTitleRegex(SITE_TYPES.UNKNOWN)] },
    },
    readiness: {
      modelList: {
        expectedRoute: ACCOUNT_SITE_MODEL_LIST_EXPECTED_ROUTES.DirectPricing,
      },
    },
  },
] as const satisfies readonly AccountSiteDefinition[]

export const SITE_TYPE_DEFINITIONS = [
  ...ACCOUNT_SITE_DEFINITIONS,
  ...ACCOUNT_SITE_DEFINITION_OVERRIDES,
  ...COMPATIBLE_ACCOUNT_SITE_DEFINITIONS,
  ...MANAGED_ONLY_SITE_DEFINITIONS,
] as const satisfies readonly AccountSiteDefinition[]
```

- [ ] **Step 6: Create registry projection helpers**

Create `src/services/accountSiteDefinitions/registry.ts`:

```ts
import { ACCOUNT_SITE_DEFINITION_SCOPES, type AccountSiteDefinition } from "./contracts"
import { SITE_TYPE_DEFINITIONS } from "./definitions"
import type { SiteType } from "./identifiers"

const cloneRegExp = (regex: RegExp) => new RegExp(regex.source, regex.flags)

const cloneDefinition = (
  definition: AccountSiteDefinition,
): AccountSiteDefinition => ({
  ...definition,
  scopes: [...definition.scopes],
  onboarding: definition.onboarding
    ? {
        ...definition.onboarding,
        detection: definition.onboarding.detection
          ? {
              ...definition.onboarding.detection,
              titlePatterns: definition.onboarding.detection.titlePatterns
                ? definition.onboarding.detection.titlePatterns.map(cloneRegExp)
                : undefined,
              hostnames: definition.onboarding.detection.hostnames
                ? [...definition.onboarding.detection.hostnames]
                : undefined,
              compatUserIdHeaderNames: definition.onboarding.detection
                .compatUserIdHeaderNames
                ? [
                    ...definition.onboarding.detection
                      .compatUserIdHeaderNames,
                  ]
                : undefined,
            }
          : undefined,
        routes: definition.onboarding.routes
          ? { ...definition.onboarding.routes }
          : undefined,
      }
    : undefined,
  productProfile: definition.productProfile
    ? {
        ...definition.productProfile,
        auth: definition.productProfile.auth
          ? {
              ...definition.productProfile.auth,
              allowedAuthTypes: definition.productProfile.auth.allowedAuthTypes
                ? [...definition.productProfile.auth.allowedAuthTypes]
                : undefined,
              defaultAuthHostnames: definition.productProfile.auth
                .defaultAuthHostnames
                ? [...definition.productProfile.auth.defaultAuthHostnames]
                : undefined,
            }
          : undefined,
        authSession: definition.productProfile.authSession
          ? { ...definition.productProfile.authSession }
          : undefined,
        createdToken: definition.productProfile.createdToken
          ? { ...definition.productProfile.createdToken }
          : undefined,
        identity: definition.productProfile.identity
          ? {
              ...definition.productProfile.identity,
              storedUserIdentityFields: definition.productProfile.identity
                .storedUserIdentityFields
                ? [...definition.productProfile.identity.storedUserIdentityFields]
                : undefined,
            }
          : undefined,
        modelList: definition.productProfile.modelList
          ? { ...definition.productProfile.modelList }
          : undefined,
        supplementalAuth: definition.productProfile.supplementalAuth
          ? { ...definition.productProfile.supplementalAuth }
          : undefined,
        tokenForm: definition.productProfile.tokenForm
          ? { ...definition.productProfile.tokenForm }
          : undefined,
        urls: definition.productProfile.urls
          ? {
              ...definition.productProfile.urls,
              recognizedHostnames: definition.productProfile.urls
                .recognizedHostnames
                ? [...definition.productProfile.urls.recognizedHostnames]
                : undefined,
            }
          : undefined,
      }
    : undefined,
  readiness: definition.readiness
    ? {
        modelList: definition.readiness.modelList
          ? { ...definition.readiness.modelList }
          : undefined,
      }
    : undefined,
})

export function getAccountSiteDefinitions(): readonly AccountSiteDefinition[] {
  return SITE_TYPE_DEFINITIONS.map(cloneDefinition)
}

export function getAccountSiteDefinition(
  siteType: SiteType | string,
): AccountSiteDefinition | undefined {
  const definition = SITE_TYPE_DEFINITIONS.find(
    (candidate) => candidate.siteType === siteType,
  )

  return definition ? cloneDefinition(definition) : undefined
}

export function getAccountSiteTypeValues() {
  return SITE_TYPE_DEFINITIONS.filter((definition) =>
    definition.scopes.includes(ACCOUNT_SITE_DEFINITION_SCOPES.Account),
  ).map((definition) => definition.siteType)
}

export function getManagedSiteTypeValues() {
  return SITE_TYPE_DEFINITIONS.filter((definition) =>
    definition.scopes.includes(ACCOUNT_SITE_DEFINITION_SCOPES.Managed),
  ).map((definition) => definition.siteType)
}

export function getAccountSiteOnboardingDefinitions() {
  return getAccountSiteDefinitions()
    .filter((definition) =>
      definition.scopes.includes(ACCOUNT_SITE_DEFINITION_SCOPES.Account),
    )
    .map((definition) => ({
      siteType: definition.siteType,
      adapterFamily: definition.adapterFamily,
      detection: definition.onboarding?.detection,
      routes: definition.onboarding?.routes,
    }))
}

export function getAccountSiteProductProfileOverride(siteType: SiteType | string) {
  return getAccountSiteDefinition(siteType)?.productProfile
}

export function getAccountSiteReadinessExpectation(siteType: SiteType | string) {
  return getAccountSiteDefinition(siteType)?.readiness
}
```

If TypeScript rejects optional nested arrays in `cloneDefinition`, keep the helper local to this task and adjust only by making clone branches explicit. Do not replace defensive copies with direct references.

- [ ] **Step 7: Create `siteTypes.ts` and barrel exports**

Create `src/services/accountSiteDefinitions/siteTypes.ts`:

```ts
import {
  getAccountSiteTypeValues,
  getManagedSiteTypeValues,
} from "./registry"
export {
  AIHUBMIX_API_ORIGIN,
  AIHUBMIX_HOSTNAMES,
  AIHUBMIX_LOGIN_PATH,
  AIHUBMIX_WEB_ORIGIN,
  SITE_TYPES,
  type SiteType,
} from "./identifiers"

export const ACCOUNT_SITE_TYPES = getAccountSiteTypeValues()
export type AccountSiteType = (typeof ACCOUNT_SITE_TYPES)[number]

export const ACCOUNT_SITE_TYPE_VALUES = [...ACCOUNT_SITE_TYPES]

export const MANAGED_SITE_TYPES = getManagedSiteTypeValues()
export type ManagedSiteType = (typeof MANAGED_SITE_TYPES)[number]
```

Create `src/services/accountSiteDefinitions/index.ts`:

```ts
export * from "./contracts"
export * from "./identifiers"
export * from "./registry"
export * from "./siteTypes"
```

- [ ] **Step 8: Run definition tests**

Run:

```powershell
pnpm vitest run tests/services/accountSiteDefinitions/registry.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit definition module**

Run:

```powershell
git add src/services/accountSiteDefinitions tests/services/accountSiteDefinitions/registry.test.ts
git commit -m "refactor(account-sites): add definition registry"
```

Expected: commit succeeds after `validate:staged`.

---

### Task 2: Preserve Site-Type Compatibility Facades

**Files:**

- Modify: `src/services/accountSiteOnboarding/contracts.ts`
- Modify: `src/services/accountSiteOnboarding/siteTypes.ts`
- Modify: `src/constants/siteType.ts`
- Modify: `tests/services/accountSiteDefinitions/registry.test.ts`
- Modify: `tests/services/accountSiteOnboarding/registry.test.ts`
- Modify: `tests/services/detectSiteType.test.ts`

- [ ] **Step 1: Write compatibility assertions**

Append this test to `tests/services/accountSiteDefinitions/registry.test.ts`:

```ts
  it("keeps the legacy constants facade aligned with definitions", async () => {
    const legacy = await import("~/constants/siteType")

    expect(legacy.SITE_TYPES).toBe(SITE_TYPES)
    expect(legacy.ACCOUNT_SITE_TYPES).toEqual(getAccountSiteTypeValues())
    expect(legacy.ACCOUNT_SITE_TYPE_VALUES).toEqual(getAccountSiteTypeValues())
    expect(legacy.MANAGED_SITE_TYPES).toEqual(getManagedSiteTypeValues())
    expect(legacy.isAccountSiteType(SITE_TYPES.AIHUBMIX)).toBe(true)
    expect(legacy.isAccountSiteType(SITE_TYPES.OCTOPUS)).toBe(false)
    expect(legacy.isManagedSiteType(SITE_TYPES.OCTOPUS)).toBe(true)
    expect(legacy.isManagedSiteType(SITE_TYPES.SUB2API)).toBe(false)
  })
```

- [ ] **Step 2: Run the compatibility assertion**

Run:

```powershell
pnpm vitest run tests/services/accountSiteDefinitions/registry.test.ts
```

Expected: FAIL until the legacy facade is routed through `accountSiteDefinitions`.

- [ ] **Step 3: Route onboarding contracts through definition contracts**

Replace the shared route/detection/adapter-family definitions in `src/services/accountSiteOnboarding/contracts.ts` with re-exports, while keeping content-session extractor types in this file:

```ts
import type { AccountSiteType } from "./siteTypes"

export {
  ACCOUNT_SITE_ADAPTER_FAMILIES,
  type AccountSiteAdapterFamily,
  type AccountSiteDetectionMetadata,
  type AccountSiteRouteConfig,
} from "~/services/accountSiteDefinitions/contracts"
import type {
  AccountSiteAdapterFamily,
  AccountSiteDetectionMetadata,
  AccountSiteRouteConfig,
} from "~/services/accountSiteDefinitions/contracts"

export type ContentSessionExtractionContext = {
  url?: string
  siteTypeHint?: AccountSiteType
}

export type ContentSessionExtractionResult = {
  userId: string | number
  user: Record<string, unknown>
  accessToken?: string
  siteTypeHint?: AccountSiteType
  sub2apiAuth?: {
    refreshToken: string
    tokenExpiresAt?: number
  }
}

export type ContentSessionExtractor = {
  id: string
  canExtract(context: ContentSessionExtractionContext): boolean
  extract(
    context: ContentSessionExtractionContext,
  ): Promise<ContentSessionExtractionResult | null>
}

export type AccountSiteOnboardingMetadata = {
  siteType: AccountSiteType
  adapterFamily: AccountSiteAdapterFamily
  detection?: AccountSiteDetectionMetadata
  routes?: AccountSiteRouteConfig
}
```

- [ ] **Step 4: Replace onboarding site-type source with re-exports**

Replace `src/services/accountSiteOnboarding/siteTypes.ts` with:

```ts
export {
  ACCOUNT_SITE_TYPES,
  ACCOUNT_SITE_TYPE_VALUES,
  AIHUBMIX_API_ORIGIN,
  AIHUBMIX_HOSTNAMES,
  AIHUBMIX_LOGIN_PATH,
  AIHUBMIX_WEB_ORIGIN,
  MANAGED_SITE_TYPES,
  SITE_TYPES,
  type AccountSiteType,
  type ManagedSiteType,
  type SiteType,
} from "~/services/accountSiteDefinitions/siteTypes"
```

- [ ] **Step 5: Keep constants facade behavior unchanged**

Inspect `src/constants/siteType.ts`.

Keep its public exports from `~/services/accountSiteOnboarding/siteTypes` and `~/services/accountSiteOnboarding/contracts`. Only change imports if TypeScript reports a cycle or missing type. The helper bodies should remain:

```ts
export function isAccountSiteType(value: unknown): value is AccountSiteType {
  return (
    typeof value === "string" &&
    ACCOUNT_SITE_TYPE_VALUES.includes(value as AccountSiteType)
  )
}

export function isManagedSiteType(value: unknown): value is ManagedSiteType {
  return (
    typeof value === "string" &&
    MANAGED_SITE_TYPES.includes(value as ManagedSiteType)
  )
}
```

- [ ] **Step 6: Run facade and detection tests**

Run:

```powershell
pnpm vitest run tests/services/accountSiteDefinitions/registry.test.ts tests/services/accountSiteOnboarding/registry.test.ts tests/services/detectSiteType.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit compatibility facade migration**

Run:

```powershell
git add src/services/accountSiteOnboarding/contracts.ts src/services/accountSiteOnboarding/siteTypes.ts src/constants/siteType.ts tests/services/accountSiteDefinitions/registry.test.ts tests/services/accountSiteOnboarding/registry.test.ts tests/services/detectSiteType.test.ts
git commit -m "refactor(account-sites): route site type facades through definitions"
```

Expected: commit succeeds after `validate:staged`.

---

### Task 3: Route Onboarding Metadata Through Definitions

**Files:**

- Modify: `src/services/accountSiteOnboarding/metadata.ts`
- Modify: `src/services/accountSiteOnboarding/registry.ts`
- Modify: `tests/services/accountSiteOnboarding/registry.test.ts`
- Modify: `tests/services/detectSiteType.test.ts`

- [ ] **Step 1: Add onboarding projection assertions**

Append this test to `tests/services/accountSiteOnboarding/registry.test.ts`:

```ts
  it("projects onboarding definitions from the account-site definition registry", async () => {
    const { getAccountSiteDefinition } = await import(
      "~/services/accountSiteDefinitions"
    )

    const aihubmixDefinition = getAccountSiteDefinition(SITE_TYPES.AIHUBMIX)
    const onboardingDefinition = getAccountSiteOnboardingDefinition(
      SITE_TYPES.AIHUBMIX,
    )

    expect(onboardingDefinition).toMatchObject({
      siteType: SITE_TYPES.AIHUBMIX,
      adapterFamily: ACCOUNT_SITE_ADAPTER_FAMILIES.Aihubmix,
      routes: aihubmixDefinition?.onboarding?.routes,
    })
    expect(onboardingDefinition?.detection?.hostnames).toEqual([
      ...AIHUBMIX_HOSTNAMES,
    ])
  })
```

- [ ] **Step 2: Run onboarding registry tests**

Run:

```powershell
pnpm vitest run tests/services/accountSiteOnboarding/registry.test.ts
```

Expected: PASS before implementation or FAIL only if `getAccountSiteDefinition(...)` is not exported correctly. This step locks expected behavior before deleting the local metadata table.

- [ ] **Step 3: Replace the local metadata table with definition projections**

Modify `src/services/accountSiteOnboarding/metadata.ts`.

Keep `DEFAULT_SITE_ROUTE_CONFIG` in this file. Replace local `accountSiteOnboardingMetadata`, `COMPAT_USER_ID_ERROR_HEADER_TO_SITE_TYPE`, and `makeTitleRegex(...)` with projections from definitions:

```ts
import type {
  AccountSiteOnboardingMetadata,
  AccountSiteRouteConfig,
} from "~/services/accountSiteOnboarding/contracts"
import { ACCOUNT_SITE_ADAPTER_FAMILIES } from "~/services/accountSiteOnboarding/contracts"
import {
  getAccountSiteDefinition,
  getAccountSiteDefinitions,
  getAccountSiteOnboardingDefinitions,
} from "~/services/accountSiteDefinitions"

import type { AccountSiteType } from "./siteTypes"
```

Use this helper to normalize definition onboarding rows into the legacy shape:

```ts
const getAccountSiteOnboardingMetadata =
  (): readonly AccountSiteOnboardingMetadata[] =>
    getAccountSiteOnboardingDefinitions().map((definition) => ({
      siteType: definition.siteType as AccountSiteType,
      adapterFamily: definition.adapterFamily,
      detection: definition.detection,
      routes: definition.routes,
    }))
```

Then update the exported helpers:

```ts
export function getAccountSiteMetadata(siteType: AccountSiteType) {
  const metadata = getAccountSiteOnboardingMetadata().find(
    (candidate) => candidate.siteType === siteType,
  )

  if (!metadata) return undefined

  return {
    ...metadata,
    detection: cloneDetectionMetadata(metadata.detection),
    routes: metadata.routes ? { ...metadata.routes } : undefined,
  }
}

export function getAccountSiteTitleRuleMetadata(): readonly AccountSiteTitleRuleMetadata[] {
  return getAccountSiteOnboardingMetadata().flatMap(
    (metadata) =>
      metadata.detection?.titlePatterns?.map((regex) => ({
        name: metadata.siteType,
        regex,
      })) ?? [],
  )
}

export function getAccountSiteDomainRuleMetadata(): readonly AccountSiteDomainRuleMetadata[] {
  return getAccountSiteOnboardingMetadata().flatMap((metadata) =>
    metadata.detection?.hostnames
      ? [
          {
            name: metadata.siteType,
            hostnames: [...metadata.detection.hostnames],
          },
        ]
      : [],
  )
}

export function getAccountSiteRouteOverrideMetadata(
  siteType: AccountSiteType,
): AccountSiteRouteOverrideMetadata {
  return { ...(getAccountSiteMetadata(siteType)?.routes ?? {}) }
}

export function getAccountSiteAdapterFamilyMetadata(siteType: AccountSiteType) {
  return (
    getAccountSiteDefinition(siteType)?.adapterFamily ??
    ACCOUNT_SITE_ADAPTER_FAMILIES.Unsupported
  )
}

export function getAccountSiteCompatUserIdHeaderRules() {
  return getAccountSiteDefinitions().flatMap((definition) =>
    definition.onboarding?.detection?.compatUserIdHeaderNames?.map(
      (headerName) => ({
        siteType: definition.siteType as AccountSiteType,
        headerName,
      }),
    ) ?? [],
  )
}
```

Ensure the New API-family compatible header markers are present in definition rows:

```ts
compatUserIdHeaderNames: ["New-API-User"]
compatUserIdHeaderNames: ["Veloera-User"]
compatUserIdHeaderNames: ["X-Api-User"]
compatUserIdHeaderNames: ["voapi-user"]
compatUserIdHeaderNames: ["Rix-Api-User"]
compatUserIdHeaderNames: ["neo-api-user"]
```

- [ ] **Step 4: Preserve route and detection behavior**

Run:

```powershell
pnpm vitest run tests/services/accountSiteOnboarding/registry.test.ts tests/services/detectSiteType.test.ts
```

Expected: PASS. If compat-header tests fail, add the missing `compatUserIdHeaderNames` to the corresponding definition row instead of restoring `COMPAT_USER_ID_ERROR_HEADER_TO_SITE_TYPE`.

- [ ] **Step 5: Confirm metadata ownership moved**

Run:

```powershell
rg -n "const accountSiteOnboardingMetadata|COMPAT_USER_ID_ERROR_HEADER_TO_SITE_TYPE|function makeTitleRegex" src/services/accountSiteOnboarding/metadata.ts
```

Expected: no matches.

- [ ] **Step 6: Commit onboarding projection migration**

Run:

```powershell
git add src/services/accountSiteDefinitions/definitions.ts src/services/accountSiteOnboarding/metadata.ts src/services/accountSiteOnboarding/registry.ts tests/services/accountSiteOnboarding/registry.test.ts tests/services/detectSiteType.test.ts
git commit -m "refactor(account-sites): derive onboarding metadata from definitions"
```

Expected: commit succeeds after `validate:staged`.

---

### Task 4: Route Product Profile Overrides Through Definitions

**Files:**

- Modify: `src/services/accounts/accountSiteProfile/profiles.ts`
- Modify: `src/services/accounts/accountSiteProfile/registry.ts`
- Modify: `tests/services/accounts/accountSiteProfile.test.ts`
- Modify: `tests/services/accountSiteDefinitions/registry.test.ts`

- [ ] **Step 1: Add profile-source assertion**

Append this test to `tests/services/accounts/accountSiteProfile.test.ts`:

```ts
  it("resolves site-specific overrides from account-site definitions", async () => {
    const { getAccountSiteProductProfileOverride } = await import(
      "~/services/accountSiteDefinitions"
    )

    expect(getAccountSiteProductProfileOverride(SITE_TYPES.SUB2API)).toMatchObject({
      supplementalAuth: {
        kind: ACCOUNT_SITE_SUPPLEMENTAL_AUTH_KINDS.Sub2ApiRefreshToken,
      },
    })
    expect(getAccountSiteProductProfile(SITE_TYPES.SUB2API)).toMatchObject({
      supplementalAuth: {
        kind: ACCOUNT_SITE_SUPPLEMENTAL_AUTH_KINDS.Sub2ApiRefreshToken,
      },
      modelList: {
        tokenScopedCatalogFallback:
          ACCOUNT_SITE_MODEL_LIST_TOKEN_SCOPED_CATALOG_FALLBACKS.RuntimeKey,
      },
    })
  })
```

- [ ] **Step 2: Run profile tests before code movement**

Run:

```powershell
pnpm vitest run tests/services/accounts/accountSiteProfile.test.ts tests/services/accountSiteDefinitions/registry.test.ts
```

Expected: PASS if Task 1 already exposed definition profile overrides.

- [ ] **Step 3: Stop exporting override rows from profile data**

Modify `src/services/accounts/accountSiteProfile/profiles.ts`.

Keep `DEFAULT_ACCOUNT_SITE_PRODUCT_PROFILE`, but remove the `ACCOUNT_SITE_PRODUCT_PROFILE_OVERRIDES` export and its now-unused imports. The file should start like this:

```ts
import { SITE_TYPES } from "~/constants/siteType"
import { AuthTypeEnum } from "~/types"

import {
  ACCOUNT_SITE_AUTH_SESSION_REFRESH_LOCK_SCOPES,
  ACCOUNT_SITE_CREATED_TOKEN_SECRET_HANDLING,
  ACCOUNT_SITE_MODEL_LIST_DASHBOARD_ESTIMATE_LOADERS,
  ACCOUNT_SITE_MODEL_LIST_DIRECT_PRICING,
  ACCOUNT_SITE_MODEL_LIST_DISPLAY_CAPABILITY_SOURCES,
  ACCOUNT_SITE_MODEL_LIST_STATUS_SCOPES,
  ACCOUNT_SITE_MODEL_LIST_TOKEN_SCOPED_CATALOG_FALLBACKS,
  ACCOUNT_SITE_SUPPLEMENTAL_AUTH_KINDS,
  ACCOUNT_SITE_TOKEN_FORM_NETWORK_LIMIT_POLICIES,
  type AccountSiteProductProfile,
} from "./contracts"
```

After removal, the only exported runtime value in `profiles.ts` should be:

```ts
export const DEFAULT_ACCOUNT_SITE_PRODUCT_PROFILE: AccountSiteProductProfile = {
  siteType: SITE_TYPES.UNKNOWN,
  auth: {
    allowedAuthTypes: [AuthTypeEnum.AccessToken, AuthTypeEnum.Cookie],
    defaultAuthType: AuthTypeEnum.AccessToken,
    defaultAuthHostnames: [],
    supportsCookieAuth: true,
    supportsBuiltInCheckInDetection: true,
  },
  authSession: {
    kind: ACCOUNT_SITE_SUPPLEMENTAL_AUTH_KINDS.None,
    decoratesAccountApiRequests: false,
    refreshLockScope: ACCOUNT_SITE_AUTH_SESSION_REFRESH_LOCK_SCOPES.None,
  },
  createdToken: {
    secretHandling: ACCOUNT_SITE_CREATED_TOKEN_SECRET_HANDLING.ResponseKey,
  },
  identity: {
    usernameRequired: true,
    storedUserIdentityFields: ["id"],
  },
  modelList: {
    directPricing: ACCOUNT_SITE_MODEL_LIST_DIRECT_PRICING.Supported,
    tokenScopedCatalogFallback:
      ACCOUNT_SITE_MODEL_LIST_TOKEN_SCOPED_CATALOG_FALLBACKS.None,
    dashboardEstimateLoader:
      ACCOUNT_SITE_MODEL_LIST_DASHBOARD_ESTIMATE_LOADERS.None,
    statusScope: ACCOUNT_SITE_MODEL_LIST_STATUS_SCOPES.Account,
    displayCapabilitiesSource:
      ACCOUNT_SITE_MODEL_LIST_DISPLAY_CAPABILITY_SOURCES.Response,
  },
  supplementalAuth: {
    kind: ACCOUNT_SITE_SUPPLEMENTAL_AUTH_KINDS.None,
  },
  tokenForm: {
    networkLimitPolicy: ACCOUNT_SITE_TOKEN_FORM_NETWORK_LIMIT_POLICIES.IpList,
  },
  urls: {
    recognizedHostnames: [],
  },
}
```

- [ ] **Step 4: Read overrides from definitions in the profile registry**

Modify `src/services/accounts/accountSiteProfile/registry.ts`.

Replace the import:

```ts
import {
  ACCOUNT_SITE_PRODUCT_PROFILE_OVERRIDES,
  DEFAULT_ACCOUNT_SITE_PRODUCT_PROFILE,
} from "./profiles"
```

with:

```ts
import { getAccountSiteProductProfileOverride } from "~/services/accountSiteDefinitions"

import { DEFAULT_ACCOUNT_SITE_PRODUCT_PROFILE } from "./profiles"
```

Replace this call:

```ts
ACCOUNT_SITE_PRODUCT_PROFILE_OVERRIDES[siteType]
```

with:

```ts
getAccountSiteProductProfileOverride(siteType)
```

Keep `mergeAccountSiteProductProfile(...)` and `cloneAccountSiteProductProfile(...)` in the profile registry. They are product-profile behavior, not definition behavior.

- [ ] **Step 5: Run profile-focused tests**

Run:

```powershell
pnpm vitest run tests/services/accounts/accountSiteProfile.test.ts tests/services/accountSiteDefinitions/registry.test.ts tests/services/modelList/accountSources/readiness.test.ts tests/services/modelList/accountSources/readiness.routes.test.ts
```

Expected: PASS.

- [ ] **Step 6: Confirm override ownership moved**

Run:

```powershell
rg -n "ACCOUNT_SITE_PRODUCT_PROFILE_OVERRIDES|AIHUBMIX_API_ORIGIN|AIHUBMIX_HOSTNAMES|AIHUBMIX_WEB_ORIGIN" src/services/accounts/accountSiteProfile/profiles.ts
```

Expected: no matches for `ACCOUNT_SITE_PRODUCT_PROFILE_OVERRIDES`, `AIHUBMIX_API_ORIGIN`, `AIHUBMIX_HOSTNAMES`, or `AIHUBMIX_WEB_ORIGIN`.

- [ ] **Step 7: Commit product profile projection migration**

Run:

```powershell
git add src/services/accountSiteDefinitions src/services/accounts/accountSiteProfile/profiles.ts src/services/accounts/accountSiteProfile/registry.ts tests/services/accounts/accountSiteProfile.test.ts tests/services/accountSiteDefinitions/registry.test.ts
git commit -m "refactor(account-sites): derive product profiles from definitions"
```

Expected: commit succeeds after `validate:staged`.

---

### Task 5: Add Definition-Backed Readiness Expectations

**Files:**

- Create: `tests/services/modelList/accountSources/readiness.definitions.test.ts`
- Modify: `src/services/accountSiteDefinitions/contracts.ts`
- Modify: `src/services/accountSiteDefinitions/registry.ts`
- Modify: `tests/services/accountSiteDefinitions/registry.test.ts`
- Modify: `tests/services/apiAdapters/registry.test.ts`

- [ ] **Step 1: Write readiness expectation test**

Create `tests/services/modelList/accountSources/readiness.definitions.test.ts`:

```ts
import { describe, expect, it } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import {
  getAccountSiteReadinessExpectation,
  getAccountSiteTypeValues,
} from "~/services/accountSiteDefinitions"
import {
  ACCOUNT_SITE_MODEL_LIST_DISPLAY_CAPABILITY_SOURCES,
  ACCOUNT_SITE_MODEL_LIST_STATUS_SCOPES,
} from "~/services/accounts/accountSiteProfile"
import {
  MODEL_LIST_ACCOUNT_SOURCE_ROUTES,
  resolveModelListAccountSourceReadiness,
} from "~/services/modelList/accountSources/readiness"

describe("Model List readiness definition expectations", () => {
  it("resolves each expected account site route without throwing", () => {
    for (const siteType of getAccountSiteTypeValues()) {
      const expectation = getAccountSiteReadinessExpectation(siteType)
      const readiness = resolveModelListAccountSourceReadiness({ siteType })

      expect(readiness.route, `${siteType} readiness route`).toBe(
        expectation?.modelList?.expectedRoute,
      )
    }
  })

  it("keeps representative account-site readiness semantics", () => {
    expect(
      resolveModelListAccountSourceReadiness({
        siteType: SITE_TYPES.NEW_API,
      }),
    ).toMatchObject({
      route: MODEL_LIST_ACCOUNT_SOURCE_ROUTES.DirectPricing,
      statusScope: ACCOUNT_SITE_MODEL_LIST_STATUS_SCOPES.Account,
      displayCapabilitiesSource:
        ACCOUNT_SITE_MODEL_LIST_DISPLAY_CAPABILITY_SOURCES.Response,
    })

    expect(
      resolveModelListAccountSourceReadiness({
        siteType: SITE_TYPES.SUB2API,
      }),
    ).toMatchObject({
      route: MODEL_LIST_ACCOUNT_SOURCE_ROUTES.TokenScopedRuntimeCatalog,
      statusScope: ACCOUNT_SITE_MODEL_LIST_STATUS_SCOPES.Token,
      displayCapabilitiesSource:
        ACCOUNT_SITE_MODEL_LIST_DISPLAY_CAPABILITY_SOURCES.Response,
    })

    expect(
      resolveModelListAccountSourceReadiness({
        siteType: SITE_TYPES.AIHUBMIX,
      }),
    ).toMatchObject({
      route: MODEL_LIST_ACCOUNT_SOURCE_ROUTES.DirectPricing,
      statusScope: ACCOUNT_SITE_MODEL_LIST_STATUS_SCOPES.Account,
      displayCapabilitiesSource:
        ACCOUNT_SITE_MODEL_LIST_DISPLAY_CAPABILITY_SOURCES.Profile,
    })
  })
})
```

- [ ] **Step 2: Run the readiness expectation test**

Run:

```powershell
pnpm vitest run tests/services/modelList/accountSources/readiness.definitions.test.ts
```

Expected: PASS if the definition rows already include expected routes for every account site type.

- [ ] **Step 3: Keep definition route constants synchronized with runtime route constants**

The definition registry owns expectation constants so `accountSiteDefinitions` does not import `modelList/accountSources/readiness` at runtime. Add this assertion to `tests/services/modelList/accountSources/readiness.definitions.test.ts`:

```ts
import { ACCOUNT_SITE_MODEL_LIST_EXPECTED_ROUTES } from "~/services/accountSiteDefinitions"

it("keeps definition expectation route constants synchronized with runtime routes", () => {
  expect(ACCOUNT_SITE_MODEL_LIST_EXPECTED_ROUTES).toEqual({
    DirectPricing: MODEL_LIST_ACCOUNT_SOURCE_ROUTES.DirectPricing,
    TokenScopedRuntimeCatalog:
      MODEL_LIST_ACCOUNT_SOURCE_ROUTES.TokenScopedRuntimeCatalog,
    Unsupported: MODEL_LIST_ACCOUNT_SOURCE_ROUTES.Unsupported,
  })
})
```

- [ ] **Step 4: Keep adapter registry behavior covered**

Run:

```powershell
pnpm vitest run tests/services/apiAdapters/registry.test.ts tests/services/accountSiteDefinitions/registry.test.ts tests/services/modelList/accountSources/readiness.definitions.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit readiness expectation coverage**

Run:

```powershell
git add src/services/accountSiteDefinitions src/services/modelList/accountSources/readiness.ts tests/services/accountSiteDefinitions/registry.test.ts tests/services/apiAdapters/registry.test.ts tests/services/modelList/accountSources/readiness.definitions.test.ts
git commit -m "test(model-list): verify definition readiness expectations"
```

Expected: commit succeeds after `validate:staged`.

---

### Task 6: Classify Raw Site-Type Branches And Run Final Validation

**Files:**

- Modify only task-scoped files if a raw branch is definition-owned and already covered by existing helpers.
- No source change is required when remaining hits are backend protocol code, response metadata, content-session extractors, managed-site runtime branches, Account Dialog workflow policy, or provider-specific tests.

- [ ] **Step 1: Run raw site-type search**

Run:

```powershell
rg -n "siteType === SITE_TYPES\\.|siteType !== SITE_TYPES\\.|currentSiteType === SITE_TYPES\\.|managedSiteType === SITE_TYPES\\.|account\\?\\.siteType === SITE_TYPES\\.|account\\.siteType !== SITE_TYPES\\.|site_type === SITE_TYPES\\." src/features src/services
```

Expected: matches remain. Classify each match before editing.

- [ ] **Step 2: Apply the cleanup rule**

Use this decision table for each match:

```text
Route through account-site definitions or product profile:
- static account-site classification
- auth default policy
- URL canonicalization policy
- created-token secret handling policy
- token-form network-limit policy
- Model List source-account route or display policy

Leave in place:
- concrete adapter implementation
- response-source metadata provider labels
- content-session extractor internals
- persisted schema and migration compatibility
- managed-site runtime behavior
- Account Dialog workflow tables and UI flow names
- tests asserting provider-specific behavior
```

Do not edit managed-site branches in:

```text
src/services/managedSites/**
src/services/models/modelSync/**
src/features/KeyManagement/hooks/useKeyManagement.ts
```

Do not edit adapter protocol branches in:

```text
src/services/apiAdapters/**
src/services/apiService/**
```

- [ ] **Step 3: Preserve current AIHubMix Model List source metadata**

Inspect `src/features/ModelList/aihubmixModelList.ts`.

Leave this source-metadata guard in place because it checks the returned payload provider, not only product policy:

```ts
return (
  account?.siteType === SITE_TYPES.AIHUBMIX &&
  pricing?.model_list_source?.provider === SITE_TYPES.AIHUBMIX
)
```

The surrounding downgrade decision should continue to be profile-driven through:

```ts
const profile = getAccountSiteModelListProfile(source.account.siteType)
```

- [ ] **Step 4: Preserve Sub2API quick-create compatibility**

Inspect `src/services/accounts/accountOperations.ts`.

Leave `resolveSub2ApiQuickCreateResolution(...)` scoped to `SITE_TYPES.SUB2API` because the public function name and return type are Sub2API compatibility API:

```ts
if (account.siteType !== SITE_TYPES.SUB2API) {
  throw new Error(TOKEN_PROVISIONING_ERRORS.Sub2ApiQuickCreateNotApplicable)
}
```

Do not generalize this function in this slice.

- [ ] **Step 5: Run ownership checks**

Run:

```powershell
rg -n "const accountSiteOnboardingMetadata|ACCOUNT_SITE_PRODUCT_PROFILE_OVERRIDES|COMPAT_USER_ID_ERROR_HEADER_TO_SITE_TYPE" src/services
rg -n "ACCOUNT_SITE_TYPES|MANAGED_SITE_TYPES|SITE_TYPES =" src/services/accountSiteOnboarding src/constants src/services/accountSiteDefinitions
rg -n "getAccountSiteAdapterFamilyMetadata|getAccountSiteRouteOverrideMetadata|getAccountSiteTitleRuleMetadata|getAccountSiteDomainRuleMetadata" src/services tests
rg -n "provider: SITE_TYPES\\.|sub2apiAuth|contentSession|apiAdapters" src/features src/services tests
```

Expected:

- no local onboarding metadata table remains outside `accountSiteDefinitions`;
- no product-profile override table remains in `accountSiteProfile/profiles.ts`;
- legacy site-type arrays are facades over definition projections;
- remaining provider/source/schema matches are classified in the final handoff.

- [ ] **Step 6: Run focused tests**

Run:

```powershell
pnpm vitest run tests/services/accountSiteDefinitions/registry.test.ts tests/services/accountSiteOnboarding/registry.test.ts tests/services/detectSiteType.test.ts tests/services/accounts/accountSiteProfile.test.ts tests/services/apiAdapters/registry.test.ts tests/services/modelList/accountSources/readiness.test.ts tests/services/modelList/accountSources/readiness.routes.test.ts tests/services/modelList/accountSources/readiness.definitions.test.ts
```

Expected: PASS.

- [ ] **Step 7: Run related tests**

Run:

```powershell
pnpm vitest related --run src/services/accountSiteDefinitions/index.ts src/services/accountSiteDefinitions/registry.ts src/services/accountSiteDefinitions/siteTypes.ts src/services/accountSiteOnboarding/registry.ts src/services/accountSiteOnboarding/metadata.ts src/services/accounts/accountSiteProfile/registry.ts src/services/accounts/accountSiteProfile/profiles.ts src/services/apiAdapters/registry.ts src/services/modelList/accountSources/readiness.ts
```

Expected: PASS. If this expands into a broad unrelated suite and times out, classify the timeout separately and rely on the focused tests plus `pnpm compile`.

- [ ] **Step 8: Run TypeScript compile**

Run:

```powershell
pnpm compile
```

Expected: PASS.

- [ ] **Step 9: Run commit gate**

Stage only task-scoped files, then run:

```powershell
pnpm run validate:staged
```

Expected: PASS.

- [ ] **Step 10: Run push gate before publishing**

Run:

```powershell
pnpm run validate:push
```

Expected: PASS.

- [ ] **Step 11: Inspect final diff scope**

Run:

```powershell
git diff --stat HEAD
git diff --name-status HEAD
```

Expected changed paths are limited to:

```text
src/services/accountSiteDefinitions/**
src/services/accountSiteOnboarding/contracts.ts
src/services/accountSiteOnboarding/siteTypes.ts
src/services/accountSiteOnboarding/metadata.ts
src/services/accountSiteOnboarding/registry.ts
src/constants/siteType.ts
src/services/accounts/accountSiteProfile/profiles.ts
src/services/accounts/accountSiteProfile/registry.ts
src/services/modelList/accountSources/readiness.ts
tests/services/accountSiteDefinitions/**
tests/services/accountSiteOnboarding/registry.test.ts
tests/services/detectSiteType.test.ts
tests/services/accounts/accountSiteProfile.test.ts
tests/services/apiAdapters/registry.test.ts
tests/services/modelList/accountSources/readiness*.test.ts
```

There should be no locale, telemetry, settings search, Playwright, managed-site provider, model-sync, or concrete adapter implementation changes.

- [ ] **Step 12: Final handoff notes**

Report:

```text
Focused tests:
- pnpm vitest run tests/services/accountSiteDefinitions/registry.test.ts tests/services/accountSiteOnboarding/registry.test.ts tests/services/detectSiteType.test.ts tests/services/accounts/accountSiteProfile.test.ts tests/services/apiAdapters/registry.test.ts tests/services/modelList/accountSources/readiness.test.ts tests/services/modelList/accountSources/readiness.routes.test.ts tests/services/modelList/accountSources/readiness.definitions.test.ts

Related tests:
- pnpm vitest related --run src/services/accountSiteDefinitions/index.ts src/services/accountSiteDefinitions/registry.ts src/services/accountSiteDefinitions/siteTypes.ts src/services/accountSiteOnboarding/registry.ts src/services/accountSiteOnboarding/metadata.ts src/services/accounts/accountSiteProfile/registry.ts src/services/accounts/accountSiteProfile/profiles.ts src/services/apiAdapters/registry.ts src/services/modelList/accountSources/readiness.ts

Validation:
- pnpm compile
- pnpm run validate:staged
- pnpm run validate:push

Telemetry decision:
- None. No analytics event or payload changed.

Settings search decision:
- None. No settings UI, anchor, deep link, or search definition changed.

E2E decision:
- No Playwright E2E added. Registry projection and policy routing are covered by Vitest.
```

Also report the remaining raw site-type branch categories from Step 5.

---

## Out Of Scope

- Adding a real new account site type.
- Rewriting concrete adapters under `src/services/apiAdapters/**`.
- Moving managed-site runtime configuration or model-sync branches.
- Renaming persisted `sub2apiAuth`.
- Renaming user-facing copy or locale keys.
- Adding telemetry, settings search entries, or Playwright E2E tests by default.

## Self-Review

- Spec coverage: Tasks 1-2 create the account-site definition Module and preserve compatibility exports; Task 3 derives onboarding metadata and adapter-family projection; Task 4 derives product-profile overrides; Task 5 adds Model List readiness expectations; Task 6 covers raw branch classification, validation, and final diff inspection.
- Scope control: The plan keeps backend behavior in `SiteAdapter`, keeps product-profile helper behavior in `accountSiteProfile`, and leaves managed-site runtime branches out of scope.
- Type consistency: `ACCOUNT_SITE_DEFINITION_SCOPES`, `ACCOUNT_SITE_ADAPTER_FAMILIES`, `ACCOUNT_SITE_MODEL_LIST_EXPECTED_ROUTES`, `AccountSiteDefinition`, `SiteType`, `AccountSiteType`, and `ManagedSiteType` are introduced before later tasks reference them.
- Behavior preservation: The plan keeps existing site-type values, route overrides, AIHubMix hostnames/origins, Sub2API supplemental auth, AnyRouter auth default, adapter family routing, and Model List readiness behavior.
