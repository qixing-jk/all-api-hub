import {
  lazy,
  Suspense,
  useCallback,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { useTranslation } from "react-i18next"

import { AppLayout } from "~/components/AppLayout"
import { UI_CONSTANTS } from "~/constants/ui"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import AccountList from "~/features/AccountManagement/components/AccountList"
import { AccountManagementProvider } from "~/features/AccountManagement/hooks/AccountManagementProvider"
import type { ApiCredentialProfilesPopupViewHandle } from "~/features/ApiCredentialProfiles/components/ApiCredentialProfilesPopupView"
import { useBookmarkDialogContext } from "~/features/SiteBookmarks/hooks/BookmarkDialogStateContext"
import { useAddAccountHandler } from "~/hooks/useAddAccountHandler"
import { cn } from "~/lib/utils"
import { isExtensionSidePanel, isMobileDevice } from "~/utils/browser"

import ActionButtons from "./components/ActionButtons"
import BalanceSection from "./components/BalanceSection"
import HeaderSection from "./components/HeaderSection"
import PopupViewSwitchTabs, {
  type PopupViewType,
} from "./components/PopupViewSwitchTabs"
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
  return (
    <div className="flex min-h-40 items-center justify-center px-4 py-8 text-sm text-gray-500 dark:text-gray-400">
      Loading...
    </div>
  )
}

/**
 * Popup body content for the extension popup and side panel.
 * Handles device-aware layout sizing, header/actions, and account list rendering.
 */
function PopupContent() {
  const { t } = useTranslation([
    "account",
    "bookmark",
    "common",
    "apiCredentialProfiles",
  ])
  const { isLoading } = useUserPreferencesContext()
  const { handleAddAccountClick } = useAddAccountHandler()
  const inSidePanel = isExtensionSidePanel()

  const [activeView, setActiveView] = useState<PopupViewType>("accounts")

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

  const viewConfig: Record<
    PopupViewType,
    {
      showRefresh: boolean
      headerAction?: ReactNode
      statsSection?: ReactNode
      primaryActionLabel: string
      onPrimaryAction: () => void
      content: ReactNode
    }
  > = {
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
    },
  }

  const activeViewConfig = viewConfig[activeView]

  const popupWidthClass = isMobileDevice()
    ? "w-full"
    : inSidePanel
      ? ""
      : UI_CONSTANTS.POPUP.WIDTH

  const popupHeightClass = isMobileDevice()
    ? ""
    : inSidePanel
      ? ""
      : UI_CONSTANTS.POPUP.HEIGHT

  return (
    <div
      className={cn(
        "dark:bg-dark-bg-primary flex flex-col overflow-y-auto bg-white",
        popupWidthClass,
        popupHeightClass,
      )}
    >
      <HeaderSection
        showRefresh={activeViewConfig.showRefresh}
        activeView={activeView}
      />

      <section className="dark:border-dark-bg-tertiary shrink-0 space-y-2 border-b border-gray-200 bg-linear-to-br from-blue-50/50 to-indigo-50/30 p-3 sm:p-4 dark:from-blue-900/20 dark:to-indigo-900/10">
        <div className="flex items-center justify-between gap-2">
          <PopupViewSwitchTabs
            value={activeView}
            onChange={(nextView) => {
              setActiveView(nextView)

              if (nextView === "bookmarks") {
                void loadBookmarksList()
              }

              if (nextView === "apiCredentialProfiles") {
                void loadApiCredentialProfilesPopupView()
              }
            }}
            accountsLabel={t("bookmark:switch.accounts")}
            bookmarksLabel={t("bookmark:switch.bookmarks")}
            apiCredentialProfilesLabel={t(
              "apiCredentialProfiles:popup.tabLabel",
            )}
          />
          {activeViewConfig.headerAction}
        </div>
        {!isLoading && activeViewConfig.statsSection
          ? activeViewConfig.statsSection
          : null}
      </section>

      <div className="flex-1">
        <ActionButtons
          primaryActionLabel={activeViewConfig.primaryActionLabel}
          onPrimaryAction={activeViewConfig.onPrimaryAction}
        />

        {activeViewConfig.content}
      </div>
    </div>
  )
}

/**
 * Root popup application with providers/layout wrappers.
 * @returns Popup component tree rendered inside AppLayout.
 */
function App() {
  return (
    <AppLayout>
      <AccountManagementProvider>
        <PopupContent />
      </AccountManagementProvider>
    </AppLayout>
  )
}

export default App
