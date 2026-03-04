import { useState } from "react"
import { useTranslation } from "react-i18next"

import { AppLayout } from "~/components/AppLayout"
import { UI_CONSTANTS } from "~/constants/ui"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import AccountList from "~/features/AccountManagement/components/AccountList"
import { AccountManagementProvider } from "~/features/AccountManagement/hooks/AccountManagementProvider"
import BookmarksList from "~/features/SiteBookmarks/components/BookmarksList"
import { useBookmarkDialogContext } from "~/features/SiteBookmarks/hooks/BookmarkDialogStateContext"
import { useAddAccountHandler } from "~/hooks/useAddAccountHandler"
import { cn } from "~/lib/utils"
import { isExtensionSidePanel, isMobileByUA } from "~/utils/browser"

import ActionButtons from "./components/ActionButtons"
import BalanceSection from "./components/BalanceSection"
import BookmarkStatsSection from "./components/BookmarkStatsSection"
import HeaderSection from "./components/HeaderSection"
import PopupViewSwitchTabs from "./components/PopupViewSwitchTabs"
import ShareOverviewSnapshotButton from "./components/ShareOverviewSnapshotButton"

/**
 * Popup body content for the extension popup and side panel.
 * Handles layout sizing, header/actions, and account list rendering.
 */
function PopupContent() {
  const { t } = useTranslation(["account", "bookmark", "common"])
  const { isLoading } = useUserPreferencesContext()
  const { handleAddAccountClick } = useAddAccountHandler()
  const inSidePanel = isExtensionSidePanel()

  const [activeView, setActiveView] = useState<"accounts" | "bookmarks">(
    "accounts",
  )

  const { openAddBookmark } = useBookmarkDialogContext()

  const popupWidthClass = isMobileByUA()
    ? "w-full"
    : inSidePanel
      ? ""
      : UI_CONSTANTS.POPUP.WIDTH

  const popupHeightClass = isMobileByUA()
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
        showRefresh={activeView === "accounts"}
        activeView={activeView}
      />

      <section className="dark:border-dark-bg-tertiary shrink-0 space-y-2 border-b border-gray-200 bg-linear-to-br from-blue-50/50 to-indigo-50/30 p-3 sm:p-4 dark:from-blue-900/20 dark:to-indigo-900/10">
        <div className="flex items-center justify-between gap-2">
          <PopupViewSwitchTabs
            value={activeView}
            onChange={setActiveView}
            accountsLabel={t("bookmark:switch.accounts")}
            bookmarksLabel={t("bookmark:switch.bookmarks")}
          />
          {activeView === "accounts" && <ShareOverviewSnapshotButton />}
        </div>
        {!isLoading && (
          <>
            {activeView === "accounts" ? (
              <BalanceSection />
            ) : (
              <BookmarkStatsSection />
            )}
          </>
        )}
      </section>

      <div className="flex-1">
        <ActionButtons
          primaryActionLabel={
            activeView === "accounts"
              ? t("account:addAccount")
              : t("bookmark:actions.add")
          }
          onPrimaryAction={
            activeView === "accounts" ? handleAddAccountClick : openAddBookmark
          }
        />

        {activeView === "accounts" ? <AccountList /> : <BookmarksList />}
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
