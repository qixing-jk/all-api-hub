import { useState } from "react"
import { useTranslation } from "react-i18next"

import { AppLayout } from "~/components/AppLayout"
import { UI_CONSTANTS } from "~/constants/ui"
import { ProductAnalyticsScope } from "~/contexts/ProductAnalyticsScopeContext"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import { AccountManagementProvider } from "~/features/AccountManagement/hooks/AccountManagementProvider"
import { useProductAnalyticsPageView } from "~/hooks/useProductAnalyticsPageView"
import { cn } from "~/lib/utils"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_PAGE_IDS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
  type ProductAnalyticsActionId,
  type ProductAnalyticsFeatureId,
  type ProductAnalyticsPageId,
} from "~/services/productAnalytics/events"
import { isExtensionSidePanel, isMobileDevice } from "~/utils/browser"

import ActionButtons from "./components/ActionButtons"
import HeaderSection from "./components/HeaderSection"
import PopupViewSwitchTabs, {
  type PopupViewType,
} from "./components/PopupViewSwitchTabs"
import { usePopupViewRegistry } from "./viewRegistry"

/**
 * Maps popup tab state to the fixed analytics page id enum.
 */
function mapPopupViewToAnalyticsPageId(
  view: PopupViewType,
): ProductAnalyticsPageId {
  switch (view) {
    case "bookmarks":
      return PRODUCT_ANALYTICS_PAGE_IDS.PopupBookmarks
    case "apiCredentialProfiles":
      return PRODUCT_ANALYTICS_PAGE_IDS.PopupApiCredentialProfiles
    case "accounts":
    default:
      return PRODUCT_ANALYTICS_PAGE_IDS.PopupAccounts
  }
}

/**
 * Maps popup tab selection to fixed analytics metadata without exposing labels.
 */
function mapPopupViewToAnalyticsAction(view: PopupViewType): {
  featureId: ProductAnalyticsFeatureId
  actionId: ProductAnalyticsActionId
} {
  switch (view) {
    case "bookmarks":
      return {
        featureId: PRODUCT_ANALYTICS_FEATURE_IDS.BookmarkManagement,
        actionId: PRODUCT_ANALYTICS_ACTION_IDS.SelectBookmarksView,
      }
    case "apiCredentialProfiles":
      return {
        featureId: PRODUCT_ANALYTICS_FEATURE_IDS.ApiCredentialProfiles,
        actionId: PRODUCT_ANALYTICS_ACTION_IDS.SelectApiCredentialProfilesView,
      }
    case "accounts":
    default:
      return {
        featureId: PRODUCT_ANALYTICS_FEATURE_IDS.AccountManagement,
        actionId: PRODUCT_ANALYTICS_ACTION_IDS.SelectAccountsView,
      }
  }
}

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
  const entrypoint = inSidePanel
    ? PRODUCT_ANALYTICS_ENTRYPOINTS.Sidepanel
    : PRODUCT_ANALYTICS_ENTRYPOINTS.Popup
  const viewTabsSurface = inSidePanel
    ? PRODUCT_ANALYTICS_SURFACE_IDS.SidepanelViewTabs
    : PRODUCT_ANALYTICS_SURFACE_IDS.PopupViewTabs

  useProductAnalyticsPageView({
    entrypoint,
    pageId: mapPopupViewToAnalyticsPageId(activeView),
  })

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
          <ProductAnalyticsScope
            entrypoint={entrypoint}
            surfaceId={viewTabsSurface}
          >
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
              getAnalyticsAction={mapPopupViewToAnalyticsAction}
            />
          </ProductAnalyticsScope>
          <ProductAnalyticsScope
            entrypoint={entrypoint}
            featureId={PRODUCT_ANALYTICS_FEATURE_IDS.ShareSnapshots}
            surfaceId={
              inSidePanel
                ? PRODUCT_ANALYTICS_SURFACE_IDS.SidepanelHeader
                : PRODUCT_ANALYTICS_SURFACE_IDS.PopupHeader
            }
          >
            {activeViewConfig.headerAction}
          </ProductAnalyticsScope>
        </div>
        {!isLoading && activeViewConfig.statsSection
          ? activeViewConfig.statsSection
          : null}
      </section>

      <div className="flex-1" data-testid={`popup-view-${activeView}`}>
        <ActionButtons
          primaryActionLabel={activeViewConfig.primaryActionLabel}
          onPrimaryAction={activeViewConfig.onPrimaryAction}
          primaryAnalyticsAction={activeViewConfig.primaryAnalyticsAction}
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
