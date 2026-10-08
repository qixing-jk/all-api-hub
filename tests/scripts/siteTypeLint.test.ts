import { globSync } from "node:fs"
import { ESLint, Linter } from "eslint"
import tseslint from "typescript-eslint"
import { describe, expect, it } from "vitest"

import { atIndex } from "~~/tests/test-utils/indexedAccess"

const eslint = new ESLint()
const page = "src/features/KeyManagement/KeyManagement.tsx"

async function check(code: string, file = page) {
  const config = await eslint.calculateConfigForFile(file)
  return new Linter().verify(code, {
    languageOptions: { parser: tseslint.parser },
    plugins: { "@typescript-eslint": tseslint.plugin },
    rules: {
      "@typescript-eslint/no-restricted-imports":
        config.rules["@typescript-eslint/no-restricted-imports"] ?? "off",
      "no-restricted-imports": config.rules["no-restricted-imports"] ?? "off",
      "no-restricted-syntax": config.rules["no-restricted-syntax"] ?? "off",
    },
  })
}

const siteImport = 'import { SITE_TYPES } from "~/constants/siteType"'

describe("site type import whitelist", () => {
  it("keeps the current Kilo Code dialog behind account capabilities", async () => {
    const files = globSync([
      "src/components/KiloCodeExportDialog.tsx",
      "src/features/KiloCodeExport/**/KiloCodeExportDialog.tsx",
    ])
    expect(files).toHaveLength(1)
    const messages = await check(
      'import { getApiService } from "~/services/apiService"',
      atIndex(files, 0).replaceAll("\\", "/"),
    )
    expect(messages).toHaveLength(1)
    expect(atIndex(messages, 0).ruleId).toBe("no-restricted-imports")
  })

  it.each([
    siteImport,
    'import { SITE_TYPES as types } from "~/constants/siteType"',
    'import * as types from "~/constants/siteType"',
    'import { SITE_TYPES } from "../../constants/siteType"',
    'import { SITE_TYPES } from "~/services/accountSiteDefinitions/identifiers"',
    'import { SITE_TYPES } from "~/services/accountSiteDefinitions/siteTypes"',
    'import { SITE_TYPES } from "../../services/accountSiteDefinitions/identifiers.ts"',
    'export { SITE_TYPES } from "~/constants/siteType"',
    'export * from "~/constants/siteType"',
  ])("rejects direct imports and re-exports: %s", async (code) => {
    const messages = await check(code)
    expect(messages).toHaveLength(1)
    expect(atIndex(messages, 0).ruleId).toBe(
      "@typescript-eslint/no-restricted-imports",
    )
  })

  it.each([
    'import type { AccountSiteType, ManagedSiteType } from "~/constants/siteType"',
    'import { type SiteType, isAccountSiteType } from "~/constants/siteType"',
    'import { getAccountSiteApiRouter } from "~/constants/siteType"',
    'import { getSiteTypeCapabilities } from "~/services/apiAdapters/registry"',
    "if (source.siteType !== target.siteType) run()",
  ])("allows types, queries and identity comparisons: %s", async (code) => {
    expect(await check(code)).toEqual([])
  })

  it.each([
    "src/services/apiAdapters/registry.ts",
    "src/services/siteDetection/detectSiteType.ts",
    "src/services/accounts/accountDefaults.ts",
    "src/services/managedSites/configRegistration.ts",
    "src/features/AccountManagement/components/AccountDialog/form/AccessTokenVerificationGuide.tsx",
    "src/features/AccountManagement/components/AccountDialog/form/AccountForm.tsx",
    "src/features/AccountManagement/components/AccountDialog/detection/autoDetectDraft.ts",
    "src/features/AccountManagement/components/AccountDialog/form/useOpenRouterAccountOnboarding.ts",
    "src/features/AccountManagement/components/AccountDialog/workspace/useAccountDialog.ts",
    "src/features/AccountManagement/components/AccountDialog/form/useAccountDialogIdentityChanges.ts",
    "src/features/AccountManagement/components/AccountDialog/detection/useAccountDialogDetection.ts",
    "src/features/AccountManagement/components/AccountDialog/form/useAccountDialogInitialization.ts",
    "src/features/BasicSettings/components/tabs/ManagedSite/providers/GptLoadSettings.tsx",
    "src/features/BasicSettings/components/tabs/ManagedSite/providers/DoneHubSettings.tsx",
    "src/features/BasicSettings/components/tabs/ManagedSite/providers/ClaudeCodeHubSettings.tsx",
    "src/features/BasicSettings/components/tabs/ManagedSite/providers/CliProxyApiSettings.tsx",
    "src/features/BasicSettings/components/tabs/ManagedSite/providers/AxonHubSettings.tsx",
    "src/features/BasicSettings/components/tabs/ManagedSite/providers/NewApiSettings.tsx",
    "src/features/BasicSettings/components/tabs/ManagedSite/providers/OctopusSettings.tsx",
    "src/features/BasicSettings/components/tabs/ManagedSite/providers/OmniRouteSettings.tsx",
    "src/features/BasicSettings/components/tabs/ManagedSite/providers/Sub2ApiSettings.tsx",
    "src/features/BasicSettings/components/tabs/ManagedSite/providers/VeloeraSettings.tsx",
    "src/features/BasicSettings/components/tabs/ManagedSite/modelSync/ModelRedirectSettings.tsx",
    "src/features/BasicSettings/components/tabs/ManagedSite/search/CliProxyApi.search.ts",
    "src/features/BasicSettings/components/tabs/ManagedSite/search/ManagedSiteDoneHub.search.ts",
    "src/features/BasicSettings/components/tabs/ManagedSite/search/ManagedSiteClaudeCodeHub.search.ts",
    "src/features/BasicSettings/components/tabs/ManagedSite/search/ManagedSiteAxonHub.search.ts",
    "tests/features/example.test.ts",
  ])("allows explicit owners and test fixtures: %s", async (file) => {
    expect(await check(siteImport, file)).toEqual([])
  })

  it.each([
    "src/features/KeyManagement/presentation/accountKeyResourcePresentation.ts",
    "src/services/siteAnnouncements/sourceHandlers.ts",
    "src/services/siteAnnouncements/identity.ts",
    "src/services/siteAnnouncements/scheduler.ts",
    "src/services/siteAnnouncements/sources.ts",
    "src/features/SiteAnnouncements/utils.ts",
  ])("keeps consumer behavior behind capabilities: %s", async (file) => {
    expect(await check(siteImport, file)).toHaveLength(1)
  })

  it("does not exempt a sibling presentation module", async () => {
    expect(
      await check(
        siteImport,
        "src/features/KeyManagement/presentation/unregistered.ts",
      ),
    ).toHaveLength(1)
  })

  it("preserves existing import and browser restrictions", async () => {
    expect(await check('import api from "~/services/apiService"')).toHaveLength(
      1,
    )
    expect(await check("browser.tabs.query({})")).toHaveLength(1)
    expect(
      await check(
        "browser.tabs.query({})",
        "src/services/apiAdapters/registry.ts",
      ),
    ).toHaveLength(1)
    expect(
      await check("browser.tabs.query({})", "src/utils/browser/tabs.ts"),
    ).toEqual([])
    expect(await check(siteImport, "src/utils/browser/tabs.ts")).toHaveLength(1)
  })
})
