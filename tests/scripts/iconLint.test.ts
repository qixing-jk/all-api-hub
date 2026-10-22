import { ESLint, Linter } from "eslint"
import tseslint from "typescript-eslint"
import { describe, expect, it } from "vitest"

const eslint = new ESLint()
async function check(
  code: string,
  file = "src/features/AccountManagement/AccountManagement.tsx",
) {
  const config = await eslint.calculateConfigForFile(file)
  return new Linter().verify(code, {
    languageOptions: { parser: tseslint.parser },
    rules: {
      "no-restricted-imports": config.rules["no-restricted-imports"] ?? "off",
      "no-restricted-syntax": config.rules["no-restricted-syntax"] ?? "off",
    },
  })
}

describe("icon import lint policy", () => {
  it.each([
    "AlertTriangle",
    "AlertCircle",
    "CheckCircle",
    "CheckCircle2",
    "XCircle",
    "MoreHorizontal",
    "SquarePen",
    "RefreshCcw",
  ])("rejects %s even under a local alias", async (icon) => {
    const messages = await check(
      `import { ${icon} as Icon } from "lucide-react"`,
    )
    expect(messages).toHaveLength(1)
  })
  it.each([
    "src/components/icons/productIcons.ts",
    "src/entrypoints/options/main.tsx",
    "src/services/apiAdapters/newApi/index.ts",
  ])("retains global alias restrictions in %s", async (file) => {
    expect(
      await check('import { AlertTriangle } from "lucide-react"', file),
    ).toHaveLength(1)
  })
  it("keeps feature-only restrictions scoped and allows canonical icons", async () => {
    expect(
      await check(
        'import { SquarePen, RefreshCcw } from "lucide-react"',
        "src/components/icons/productIcons.ts",
      ),
    ).toEqual([])
    expect(
      await check(
        'import { CalendarCheck2, Pencil, RefreshCw, UserRound } from "lucide-react"',
      ),
    ).toEqual([])
    expect(await check('const label = "SquarePen"')).toEqual([])
  })
  it("preserves the feature browser API guard", async () => {
    expect(await check("window.chrome.tabs.query({})")).toHaveLength(1)
  })
  it("preserves the workflow transition icon restriction", async () => {
    expect(
      await check('import { ExternalLink } from "lucide-react"'),
    ).toHaveLength(1)
  })
})
