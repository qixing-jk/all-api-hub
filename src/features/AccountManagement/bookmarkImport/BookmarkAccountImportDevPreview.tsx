import { FlaskConical } from "lucide-react"
import { useMemo, useState } from "react"

import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { SITE_TYPES } from "~/constants/siteType"
import BookmarkAccountImportDialog from "~/features/AccountManagement/components/BookmarkAccountImportDialog"
import { useRegisterDevPanelSection } from "~/features/DevPanel/DevPanelSectionsContext"
import type { DevPanelSection } from "~/features/DevPanel/types"
import { AuthTypeEnum } from "~/types"
import { isDevelopmentMode } from "~/utils/core/environment"

import type {
  BookmarkAccountImportFailureCategory,
  BookmarkAccountImportRowResult,
} from "./types"
import type { BookmarkAccountImportDialogRuntime } from "./useBookmarkAccountImportDialog"

/** Creates one in-memory scenario; each reopened dialog starts a new run. */
function createFixtureRuntime(): BookmarkAccountImportDialogRuntime {
  let attempt = 0
  const sites = ["success", "login", "verification", "save"] as const
  return {
    accounts: [],
    requestPermissions: async () => ({
      success: true,
      results: [],
      requestedResults: [],
    }),
    readBookmarks: async () => ({
      success: true,
      tree: [
        {
          id: "fixture-folder",
          title: "Dev: Bookmark import fixtures",
          children: sites.map((site) => ({
            id: site,
            title: `Dev: ${site}`,
            url: `https://${site}.bookmark-import.invalid/dashboard`,
          })),
        },
      ],
    }),
    async importAccounts({ candidates, onProgress }) {
      attempt += 1
      const rows: BookmarkAccountImportRowResult[] = []
      for (const candidate of candidates) {
        const scenario = new URL(candidate.url).hostname.split(".")[0]
        const category: BookmarkAccountImportFailureCategory | undefined =
          attempt === 1 &&
          (scenario === "login" ||
            scenario === "save" ||
            scenario === "verification")
            ? scenario
            : attempt === 2 && scenario === "verification"
              ? "verification"
              : undefined
        rows.push(
          category
            ? {
                candidateId: candidate.id,
                url: candidate.url,
                status: "failed",
                failureCategory: category,
                safeMessageKey: `ui:dialog.bookmarkAccountImport.failures.${category}`,
                siteType: SITE_TYPES.NEW_API,
                authType: AuthTypeEnum.AccessToken,
              }
            : {
                candidateId: candidate.id,
                url: candidate.url,
                status: "success",
                accountId: `dev:${candidate.id}`,
              },
        )
        onProgress?.({
          completedCount: rows.length,
          totalCount: candidates.length,
          currentCandidateId: candidate.id,
        })
        // Yield once so the real progress state renders without fixture timers.
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => resolve()),
        )
      }
      return {
        rows,
        successCount: rows.filter((row) => row.status === "success").length,
        failureCount: rows.filter((row) => row.status === "failed").length,
        skippedCount: 0,
      }
    },
    loadAccountData: async () => {},
    startAnalytics: () => ({ complete() {} }),
  }
}

/** Reuses the normal import dialog with one isolated fixture runtime. */
function FixtureSession({ onClose }: { onClose: () => void }) {
  const runtime = useMemo(createFixtureRuntime, [])
  return (
    <BookmarkAccountImportDialog
      isOpen
      onClose={onClose}
      runtime={runtime}
      devNotice="Dev 本地模拟：无需真实书签、登录或凭据，不保存账号。首次添加展示成功、未登录、需验证、保存失败；重试两次后全部成功。手动完善会打开真实添加窗口，仅用于检查测试网址和类型的预填。"
    />
  )
}

/** Keeps the fixture launcher registered while the account page is mounted. */
function DevPreviewContent() {
  const [session, setSession] = useState(0)
  const [isOpen, setIsOpen] = useState(false)
  const section = useMemo<DevPanelSection>(
    () => ({
      id: "bookmark-import-fixtures",
      title: "Bookmark import fixtures",
      icon: FlaskConical,
      description:
        "Pure-local mixed results. Retry twice to simulate recovery; reopen to reset. No bookmark permissions, network requests, account writes, or analytics.",
      surfaces: ["options"],
      pages: [MENU_ITEM_IDS.ACCOUNT],
      actions: [
        {
          id: "open-bookmark-import-fixtures",
          label: "Dev: Open bookmark import fixtures",
          icon: FlaskConical,
          run: () => {
            setSession((value) => value + 1)
            setIsOpen(true)
          },
        },
      ],
    }),
    [],
  )
  useRegisterDevPanelSection(section)
  return isOpen ? (
    <FixtureSession key={session} onClose={() => setIsOpen(false)} />
  ) : null
}

/** Registers the account-page fixture launcher only in development mode. */
export default function BookmarkAccountImportDevPreview() {
  return isDevelopmentMode() ? <DevPreviewContent /> : null
}
