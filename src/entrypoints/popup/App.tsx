import { useState } from "react"
import { useTranslation } from "react-i18next"

import { AppLayout } from "~/components/AppLayout"
import { UI_CONSTANTS } from "~/constants/ui"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import { AccountManagementProvider } from "~/features/AccountManagement/hooks/AccountManagementProvider"
import { cn } from "~/lib/utils"
import { isExtensionSidePanel, isMobileDevice } from "~/utils/browser"

import ActionButtons from "./components/ActionButtons"
import HeaderSection from "./components/HeaderSection"
import PopupViewSwitchTabs, {
  type PopupViewType,
} from "./components/PopupViewSwitchTabs"
import { usePopupViewRegistry } from "./viewRegistry"

/**
 * Popup body content for the extension popup and side panel.
 * Handles device-aware layout sizing, header/actions, and account list rendering.
 */
function PopupContent() {
  const { t } = useTranslation(["bookmark", "apiCredentialProfiles"])
  const { isLoading } = useUserPreferencesContext()
  const inSidePanel = isExtensionSidePanel()
  const [activeView, setActiveView] = useState<PopupViewType>("accounts")
  const viewConfig = usePopupViewRegistry()

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
              viewConfig[nextView].preload?.()
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

      <div className="flex-1" data-testid={`popup-view-${activeView}`}>
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
