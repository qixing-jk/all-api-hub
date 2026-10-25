import { ESLint, Linter } from "eslint"
import tseslint from "typescript-eslint"
import { describe, expect, it } from "vitest"

const eslint = new ESLint()
async function check(
  code: string,
  file = "src/features/AccountManagement/AccountManagement.tsx",
) {
  const config = await eslint.calculateConfigForFile(file)
  return new Linter().verify(
    code,
    {
      files: ["**/*.{ts,tsx}"],
      languageOptions: { parser: tseslint.parser },
      plugins: config.plugins,
      rules: {
        "no-restricted-imports": config.rules["no-restricted-imports"] ?? "off",
        "no-restricted-syntax": config.rules["no-restricted-syntax"] ?? "off",
        "shared-ui/use-shared-imports":
          config.rules["shared-ui/use-shared-imports"] ?? "off",
      },
    },
    { filename: file },
  )
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

describe("shared help and tooltip boundaries", () => {
  it("rejects a locally renamed workflow arrow", async () => {
    const messages = await check(
      'import { ArrowUpRight as OpenIcon } from "lucide-react"',
    )
    expect(messages).toHaveLength(1)
    expect(messages[0]?.message).toContain("WorkflowTransitionIcon")
  })

  it.each([
    'import { CircleHelp as Help } from "lucide-react"',
    'import { HelpCircleIcon as Help } from "lucide-react"',
    'export { CircleHelp as Help } from "lucide-react"',
  ])("rejects help glyphs bypassing their owner: %s", async (code) => {
    const messages = await check(code)
    expect(messages).toHaveLength(1)
    expect(messages[0]?.message).toContain("HelpHintIcon")
  })

  it.each([
    'import { ExternalLinkIcon } from "lucide-react"',
    'import { SquareArrowOutUpRight } from "lucide-react"',
    'export { ArrowUpRight as OpenIcon } from "lucide-react"',
  ])("rejects alternate transition imports: %s", async (code) => {
    const messages = await check(code)
    expect(messages).toHaveLength(1)
    expect(messages[0]?.message).toContain("WorkflowTransitionIcon")
  })

  it.each([
    'import * as Icons from "lucide-react"',
    'export * from "lucide-react"',
    'export * as Icons from "lucide-react"',
    'const icons = import("lucide-react")',
  ])(
    "rejects namespace access that hides restricted glyphs: %s",
    async (code) => {
      const messages = await check(code)
      // The existing canonical-name guard also rejects wildcard access.
      expect(
        messages.some(
          (message) =>
            message.ruleId === "shared-ui/use-shared-imports" &&
            message.message.includes("named lucide-react imports"),
        ),
      ).toBe(true)
    },
  )

  it.each([
    'import { Tooltip as Hint } from "react-tooltip"',
    'export { Tooltip } from "react-tooltip"',
    'const tooltips = import("react-tooltip")',
    'import { Tooltip } from "react-tooltip/dist/react-tooltip"',
  ])("rejects direct third-party tooltip access: %s", async (code) => {
    const messages = await check(code)
    expect(messages).toHaveLength(1)
    expect(messages[0]?.message).toContain("~/components/Tooltip")
  })

  it.each([
    "src/entrypoints/options/main.tsx",
    "src/features/ModelList/filtering/ControlPanel.tsx",
    "src/services/apiAdapters/newApi/index.ts",
  ])(
    "retains the shared boundary through config overrides in %s",
    async (file) => {
      expect(
        await check('import { ArrowUpRight } from "lucide-react"', file),
      ).toHaveLength(1)
    },
  )

  it("allows shared owners and their consumers", async () => {
    expect(
      await check(
        'import { ArrowUpRight } from "lucide-react"',
        "src/components/icons/WorkflowTransitionIcon.tsx",
      ),
    ).toEqual([])
    expect(
      await check(
        'import { CircleHelp } from "lucide-react"',
        "src/components/icons/productIcons.ts",
      ),
    ).toEqual([])
    expect(
      await check(
        'import { Tooltip } from "react-tooltip"',
        "src/components/Tooltip.tsx",
      ),
    ).toEqual([])
    expect(
      await check(
        'import { HelpHintIcon } from "~/components/icons/productIcons"; import { WorkflowTransitionIcon } from "~/components/icons/WorkflowTransitionIcon"; import Tooltip from "~/components/Tooltip"',
      ),
    ).toEqual([])
  })

  it.each([
    "src/components/ui/Dialog/ConfirmDialog.tsx",
    "src/features/ModelList/presentation/ModelVendorMark.tsx",
    "src/features/AccountManagement/components/AccountList/rows/SiteInfoCheckInIndicators.tsx",
    "src/features/AutoCheckin/workspace/FilterBar.tsx",
  ])("allows a question glyph for non-help semantics in %s", async (file) => {
    expect(
      await check('import { CircleHelp } from "lucide-react"', file),
    ).toEqual([])
    expect(
      await check('import { ArrowUpRight } from "lucide-react"', file),
    ).toHaveLength(1)
  })

  it("allows Info notices and ordinary Lucide types", async () => {
    expect(
      await check('import { Info, type LucideIcon } from "lucide-react"'),
    ).toEqual([])
  })
})
