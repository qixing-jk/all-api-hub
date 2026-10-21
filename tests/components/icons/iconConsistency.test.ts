import fs from "fs"
import path from "path"
import {
  ArrowLeftRight,
  CalendarCheck2,
  KeyRound,
  Pencil,
  RefreshCw,
  RotateCcw,
  UsersRound,
} from "lucide-react"
import { describe, expect, it } from "vitest"

import {
  OPTIONS_CAPABILITY_ICONS,
  OPTIONS_MENU_ITEM_ICONS,
} from "~/components/icons/optionsPageIcons"
import {
  AccountKeyIcon,
  AccountManagementIcon,
  AutoCheckinIcon,
  EditActionIcon,
  ImportExportIcon,
  ManagedSiteModelSyncIcon,
  RefreshActionIcon,
  ResetActionIcon,
} from "~/components/icons/productIcons"
import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"

function getFiles(dir: string): string[] {
  let results: string[] = []
  if (!fs.existsSync(dir)) return results
  const list = fs.readdirSync(dir)
  for (const file of list) {
    const full = path.join(dir, file)
    const stat = fs.statSync(full)
    if (stat.isDirectory()) {
      results = results.concat(getFiles(full))
    } else if (/\.(tsx|ts)$/.test(file)) {
      results.push(full)
    }
  }
  return results
}

describe("Icon consistency across features and shared interactions", () => {
  it("defines unified feature and action icon constants", () => {
    expect(AccountManagementIcon).toBe(UsersRound)
    expect(AutoCheckinIcon).toBe(CalendarCheck2)
    expect(ManagedSiteModelSyncIcon).toBe(RefreshCw)
    expect(ImportExportIcon).toBe(ArrowLeftRight)
    expect(AccountKeyIcon).toBe(KeyRound)

    expect(RefreshActionIcon).toBe(RefreshCw)
    expect(EditActionIcon).toBe(Pencil)
    expect(ResetActionIcon).toBe(RotateCcw)
  })

  it("unifies feature icons in optionsPageIcons", () => {
    expect(OPTIONS_MENU_ITEM_ICONS[MENU_ITEM_IDS.ACCOUNT]).toBe(UsersRound)
    expect(OPTIONS_MENU_ITEM_ICONS[MENU_ITEM_IDS.AUTO_CHECKIN]).toBe(
      CalendarCheck2,
    )
    expect(OPTIONS_MENU_ITEM_ICONS[MENU_ITEM_IDS.MANAGED_SITE_MODEL_SYNC]).toBe(
      RefreshCw,
    )
    expect(OPTIONS_MENU_ITEM_ICONS[MENU_ITEM_IDS.IMPORT_EXPORT]).toBe(
      ArrowLeftRight,
    )

    expect(OPTIONS_CAPABILITY_ICONS.autoCheckin).toBe(CalendarCheck2)
    expect(OPTIONS_CAPABILITY_ICONS.managedSiteModelSync).toBe(RefreshCw)
  })

  it("does not import deprecated Lucide aliases in src", () => {
    const files = getFiles("src")
    const deprecatedIcons = [
      "AlertTriangle",
      "AlertCircle",
      "CheckCircle",
      "CheckCircle2",
      "XCircle",
      "MoreHorizontal",
    ]

    const violations: { file: string; icon: string }[] = []

    for (const file of files) {
      const content = fs.readFileSync(file, "utf8")
      const matches = [
        ...content.matchAll(
          /import\s*\{([^}]+)\}\s*from\s*['"]lucide-react['"]/g,
        ),
      ]
      for (const m of matches) {
        const rawNames = m[1] ?? ""
        const names = rawNames.split(",").map(
          (s) =>
            s
              .trim()
              .split(/\s+as\s+/)[0]
              ?.trim() ?? "",
        )
        for (const icon of deprecatedIcons) {
          if (names.includes(icon)) {
            violations.push({ file: file.replace(/\\/g, "/"), icon })
          }
        }
      }
    }

    expect(
      violations,
      `Found deprecated Lucide icons: ${JSON.stringify(violations, null, 2)}`,
    ).toEqual([])
  })

  it("unifies edit actions to Pencil and notes display to FileText (no SquarePen in features)", () => {
    const files = getFiles("src/features")
    const violations: string[] = []

    for (const file of files) {
      const content = fs.readFileSync(file, "utf8")
      if (
        content.includes("SquarePen") &&
        /from\s*['"]lucide-react['"]/.test(content)
      ) {
        violations.push(file.replace(/\\/g, "/"))
      }
    }

    expect(
      violations,
      `Found SquarePen in features: ${violations.join(", ")}`,
    ).toEqual([])
  })

  it("unifies refresh and retry actions to RefreshCw (no RefreshCcw in features)", () => {
    const files = getFiles("src/features")
    const violations: string[] = []

    for (const file of files) {
      const content = fs.readFileSync(file, "utf8")
      if (
        content.includes("RefreshCcw") &&
        /from\s*['"]lucide-react['"]/.test(content)
      ) {
        violations.push(file.replace(/\\/g, "/"))
      }
    }

    expect(
      violations,
      `Found RefreshCcw in features: ${violations.join(", ")}`,
    ).toEqual([])
  })
})
