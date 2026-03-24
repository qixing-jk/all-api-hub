import {
  lazy,
  Suspense,
  useCallback,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { useTranslation } from "react-i18next"

import AccountList from "~/features/AccountManagement/components/AccountList"
import type { ApiCredentialProfilesPopupViewHandle } from "~/features/ApiCredentialProfiles/components/ApiCredentialProfilesPopupView"
import { useBookmarkDialogContext } from "~/features/SiteBookmarks/hooks/BookmarkDialogStateContext"
import { useAddAccountHandler } from "~/hooks/useAddAccountHandler"

import BalanceSection from "./components/BalanceSection"
import type { PopupViewType } from "./components/PopupViewSwitchTabs"
import ShareOverviewSnapshotButton from "./components/ShareOverviewSnapshotButton"

const loadBookmarksList = () =>
  import("~/features/SiteBookmarks/components/BookmarksList")
const loadApiCredentialProfilesPopupView = () =>
  import(
    "~/features/ApiCredentialProfiles/components/ApiCredentialProfilesPopupView"
  )

const LazyBookmarksList = lazy(loadBookmarksList)
const LazyApiCredentialProfilesPopupView = lazy(
  loadApiCredentialProfilesPopupView,
)

const LazyBookmarkStatsSection = lazy(
  () => import("./components/BookmarkStatsSection"),
)
const LazyApiCredentialProfilesStatsSection = lazy(
  () => import("./components/ApiCredentialProfilesStatsSection"),
)

interface PopupViewConfig {
  showRefresh: boolean
  headerAction?: ReactNode
  statsSection?: ReactNode
  primaryActionLabel: string
  onPrimaryAction: () => void
  content: ReactNode
  preload?: () => void
}

/**
 * Compact placeholder for lazily loaded popup stats cards.
 */
function PopupStatsFallback() {
  return (
    <div className="h-16 animate-pulse rounded-xl bg-white/50 dark:bg-white/5" />
  )
}

/**
 * Lightweight placeholder shown while a non-default popup tab chunk is loading.
 */
function PopupContentFallback() {
  const { t } = useTranslation("common")

  return (
    <div className="flex min-h-40 items-center justify-center px-4 py-8 text-sm text-gray-500 dark:text-gray-400">
      {t("status.loading")}
    </div>
  )
}

/**
 * Builds popup view definitions, including lazy-loaded secondary tabs and their preload hooks.
 */
export function usePopupViewRegistry(): Record<PopupViewType, PopupViewConfig> {
  const { t } = useTranslation([
    "account",
    "bookmark",
    "common",
    "apiCredentialProfiles",
  ])
  const { handleAddAccountClick } = useAddAccountHandler()
  const { openAddBookmark } = useBookmarkDialogContext()

  const apiCredentialProfilesViewRef =
    useRef<ApiCredentialProfilesPopupViewHandle>(null)
  const [pendingApiCredentialProfilesAdd, setPendingApiCredentialProfilesAdd] =
    useState(false)

  const handleApiCredentialProfilesViewRef = useCallback(
    (handle: ApiCredentialProfilesPopupViewHandle | null) => {
      apiCredentialProfilesViewRef.current = handle

      if (handle && pendingApiCredentialProfilesAdd) {
        handle.openAddDialog()
        setPendingApiCredentialProfilesAdd(false)
      }
    },
    [pendingApiCredentialProfilesAdd],
  )

  return {
    accounts: {
      showRefresh: true,
      headerAction: <ShareOverviewSnapshotButton />,
      statsSection: <BalanceSection />,
      primaryActionLabel: t("account:addAccount"),
      onPrimaryAction: handleAddAccountClick,
      content: <AccountList />,
    },
    bookmarks: {
      showRefresh: false,
      statsSection: (
        <Suspense fallback={<PopupStatsFallback />}>
          <LazyBookmarkStatsSection />
        </Suspense>
      ),
      primaryActionLabel: t("bookmark:actions.add"),
      onPrimaryAction: openAddBookmark,
      content: (
        <Suspense fallback={<PopupContentFallback />}>
          <LazyBookmarksList />
        </Suspense>
      ),
      preload: () => {
        void loadBookmarksList()
      },
    },
    apiCredentialProfiles: {
      showRefresh: false,
      statsSection: (
        <Suspense fallback={<PopupStatsFallback />}>
          <LazyApiCredentialProfilesStatsSection />
        </Suspense>
      ),
      primaryActionLabel: t("apiCredentialProfiles:actions.add"),
      onPrimaryAction: () => {
        if (apiCredentialProfilesViewRef.current) {
          apiCredentialProfilesViewRef.current.openAddDialog()
          return
        }

        setPendingApiCredentialProfilesAdd(true)
        void loadApiCredentialProfilesPopupView()
      },
      content: (
        <Suspense fallback={<PopupContentFallback />}>
          <LazyApiCredentialProfilesPopupView
            ref={handleApiCredentialProfilesViewRef}
          />
        </Suspense>
      ),
      preload: () => {
        void loadApiCredentialProfilesPopupView()
      },
    },
  }
}
