import { ESLint, Linter } from "eslint"
import tseslint from "typescript-eslint"
import { describe, expect, it } from "vitest"

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
    expect(messages[0].ruleId).toBe("@typescript-eslint/no-restricted-imports")
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
    "src/features/KeyManagement/presentation/accountKeyResourcePresentation.ts",
    "tests/features/example.test.ts",
  ])("allows explicit owners and test fixtures: %s", async (file) => {
    expect(await check(siteImport, file)).toEqual([])
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
      await check("browser.tabs.query({})", "src/utils/browser/browserApi.ts"),
    ).toEqual([])
    expect(
      await check(siteImport, "src/utils/browser/browserApi.ts"),
    ).toHaveLength(1)
  })
})
