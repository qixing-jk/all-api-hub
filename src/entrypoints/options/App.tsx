import { Suspense, useState } from "react"
import { useTranslation } from "react-i18next"

import { AppLayout } from "~/components/AppLayout"
import PopupInterruptionHintBanner from "~/components/PopupInterruptionHintBanner"
import { Spinner } from "~/components/ui"
import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { THEME_CONTENT_WIDTH } from "~/constants/theme"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import { useAppearanceSave } from "~/features/Appearance/useAppearanceSave"
import { DevPanel, DevPanelProvider } from "~/features/DevPanel"
import { hasOptionalPermissions } from "~/features/OptionsSearch/basicSettingsMeta"
import { OptionsSearchDialog } from "~/features/OptionsSearch/OptionsSearchDialog"
import { useOptionsSearchContext } from "~/features/OptionsSearch/useOptionsSearch"
import { useSearchHotkeys } from "~/features/OptionsSearch/useSearchHotkeys"
import { ProductTourProvider } from "~/features/ProductTour"
import {
  PRODUCT_TOUR_FOCUS_RETURN_ATTRIBUTE,
  PRODUCT_TOUR_TARGET_ATTRIBUTE,
  PRODUCT_TOUR_TARGETS,
} from "~/features/ProductTour/constants"
import { useProductAnalyticsPageView } from "~/hooks/useProductAnalyticsPageView"
import { cn } from "~/lib/utils"
import {
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_PAGE_IDS,
  type ProductAnalyticsPageId,
} from "~/services/productAnalytics/contracts"
import { normalizeAppearance } from "~/types/theme"

import Header from "./components/Header"
import Sidebar from "./components/Sidebar"
import { menuItems } from "./constants"
import { useHashNavigation } from "./hooks/useHashNavigation"
import BasicSettings from "./pages/BasicSettings"
import { OPTIONS_TEST_IDS } from "./testIds"

/**
 * Maps options navigation state to the fixed analytics page id enum.
 */
function mapOptionsMenuItemToAnalyticsPageId(
  menuItem: string,
): ProductAnalyticsPageId {
  switch (menuItem) {
    case MENU_ITEM_IDS.OVERVIEW:
      return PRODUCT_ANALYTICS_PAGE_IDS.OptionsOverview
    case MENU_ITEM_IDS.ACCOUNT:
      return PRODUCT_ANALYTICS_PAGE_IDS.OptionsAccountManagement
    case MENU_ITEM_IDS.BOOKMARK:
      return PRODUCT_ANALYTICS_PAGE_IDS.OptionsBookmarkManagement
    case MENU_ITEM_IDS.KEYS:
      return PRODUCT_ANALYTICS_PAGE_IDS.OptionsKeyManagement
    case MENU_ITEM_IDS.MANAGED_SITE_CHANNELS:
      return PRODUCT_ANALYTICS_PAGE_IDS.OptionsManagedSiteChannels
    case MENU_ITEM_IDS.MODELS:
      return PRODUCT_ANALYTICS_PAGE_IDS.OptionsModelList
    case MENU_ITEM_IDS.USAGE_ANALYTICS:
      return PRODUCT_ANALYTICS_PAGE_IDS.OptionsUsageAnalytics
    case MENU_ITEM_IDS.BALANCE_HISTORY:
      return PRODUCT_ANALYTICS_PAGE_IDS.OptionsBalanceHistory
    case MENU_ITEM_IDS.API_CREDENTIAL_PROFILES:
      return PRODUCT_ANALYTICS_PAGE_IDS.OptionsApiCredentialProfiles
    case MENU_ITEM_IDS.SITE_ANNOUNCEMENTS:
      return PRODUCT_ANALYTICS_PAGE_IDS.OptionsSiteAnnouncements
    case MENU_ITEM_IDS.IMPORT_EXPORT:
      return PRODUCT_ANALYTICS_PAGE_IDS.OptionsImportExport
    case MENU_ITEM_IDS.AUTO_CHECKIN:
      return PRODUCT_ANALYTICS_PAGE_IDS.OptionsAutoCheckin
    case MENU_ITEM_IDS.MANAGED_SITE_MODEL_SYNC:
      return PRODUCT_ANALYTICS_PAGE_IDS.OptionsManagedSiteModelSync
    case MENU_ITEM_IDS.ABOUT:
      return PRODUCT_ANALYTICS_PAGE_IDS.OptionsAbout
    case MENU_ITEM_IDS.BASIC:
    default:
      return PRODUCT_ANALYTICS_PAGE_IDS.OptionsBasicSettings
  }
}

/**
 * Localized fallback used while a lazily loaded options page chunk is being fetched.
 */
function OptionsPageContentFallback() {
  const { t } = useTranslation("common")

  return (
    <div className="py-density-12 flex items-center justify-center">
      <Spinner size="lg" aria-label={t("status.loading")} />
    </div>
  )
}

/**
 * Options page shell with a local Suspense boundary for route-level lazy chunks.
 * Handles hash navigation, mobile sidebar toggles, and collapse state.
 */
function OptionsPage() {
  const { t } = useTranslation("settings")
  const { activeMenuItem, routeParams, handleMenuItemChange, refreshKey } =
    useHashNavigation()
  const { managedSiteType, preferences, showTodayCashflow } =
    useUserPreferencesContext()
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false)
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const appearance = normalizeAppearance(preferences?.appearance)
  const isSidebarCollapsed = appearance.sidebarCollapsed
  const {
    save: saveAppearance,
    saving: savingAppearance,
    failed: appearanceSaveFailed,
  } = useAppearanceSave()
  const setIsSidebarCollapsed = (sidebarCollapsed: boolean) => {
    void saveAppearance({ sidebarCollapsed })
  }

  useProductAnalyticsPageView({
    entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    pageId: mapOptionsMenuItemToAnalyticsPageId(activeMenuItem),
  })

  // 获取当前活动的组件
  const ActiveComponent =
    menuItems.find((item) => item.id === activeMenuItem)?.component ||
    BasicSettings

  const searchContext = useOptionsSearchContext({
    autoCheckinEnabled: preferences?.autoCheckin?.globalEnabled ?? true,
    hasOptionalPermissions,
    managedSiteType,
    modelRedirectEnabled: Boolean(preferences?.modelRedirect?.enabled),
    showTodayCashflow,
    webdavAutoSyncEnabled: Boolean(preferences?.webdav?.autoSync),
  })

  useSearchHotkeys({
    onOpen: () => setIsSearchOpen(true),
  })

  const handleTitleClick = () => {
    handleMenuItemChange(MENU_ITEM_IDS.OVERVIEW)
  }

  const handleMenuItemClick = (itemId: string) => {
    handleMenuItemChange(itemId)
    setIsMobileSidebarOpen(false) // 移动端选择后关闭侧边栏
  }

  return (
    <ProductTourProvider
      isSidebarCollapsed={isSidebarCollapsed}
      onExpandSidebar={() => setIsSidebarCollapsed(false)}
      isMobileSidebarOpen={isMobileSidebarOpen}
      onMobileSidebarOpenChange={setIsMobileSidebarOpen}
    >
      <DevPanelProvider surface="options" page={activeMenuItem}>
        <div
          className="bg-workspace flex min-h-screen flex-col"
          data-testid={OPTIONS_TEST_IDS.app}
        >
          <Header
            onSearchOpen={() => setIsSearchOpen(true)}
            onTitleClick={handleTitleClick}
            onMenuToggle={() => setIsMobileSidebarOpen(!isMobileSidebarOpen)}
            isMobileSidebarOpen={isMobileSidebarOpen}
          />

          <div className="flex flex-1 flex-col md:flex-row">
            <Sidebar
              activeMenuItem={activeMenuItem}
              onMenuItemClick={handleMenuItemClick}
              isMobileOpen={isMobileSidebarOpen}
              onMobileClose={() => setIsMobileSidebarOpen(false)}
              isCollapsed={isSidebarCollapsed}
              onCollapseToggle={() =>
                setIsSidebarCollapsed(!isSidebarCollapsed)
              }
              isCollapsePending={savingAppearance}
            />

            {/* 右侧内容区域 */}
            <main
              className="min-w-0 flex-1 focus:outline-none"
              tabIndex={-1}
              {...{ [PRODUCT_TOUR_FOCUS_RETURN_ATTRIBUTE]: true }}
            >
              <div
                className={cn(
                  "mx-auto w-full",
                  appearance.contentWidth === THEME_CONTENT_WIDTH.CENTERED &&
                    "max-w-7xl",
                )}
              >
                <PopupInterruptionHintBanner className="mt-density-4 mx-4 sm:mx-6" />
                {appearanceSaveFailed && (
                  <p
                    role="alert"
                    className="text-destructive-text mt-density-4 mx-4 text-sm sm:mx-6"
                  >
                    {t("settings:appearance.saveFailed")}
                  </p>
                )}
                <div
                  className="min-w-0"
                  data-testid={OPTIONS_TEST_IDS.contentCard}
                  {...{
                    [PRODUCT_TOUR_TARGET_ATTRIBUTE]:
                      PRODUCT_TOUR_TARGETS.Content,
                  }}
                >
                  <Suspense fallback={<OptionsPageContentFallback />}>
                    <ActiveComponent
                      routeParams={routeParams}
                      refreshKey={refreshKey}
                    />
                  </Suspense>
                </div>
              </div>
            </main>
          </div>

          <OptionsSearchDialog
            open={isSearchOpen}
            onOpenChange={setIsSearchOpen}
            onPageNavigate={(pageId, params) => {
              handleMenuItemChange(pageId, params)
              setIsMobileSidebarOpen(false)
            }}
            context={searchContext}
          />
          <DevPanel />
        </div>
      </DevPanelProvider>
    </ProductTourProvider>
  )
}

/**
 * Wraps OptionsPage with shared AppLayout (theme/providers).
 */
function App() {
  return (
    <AppLayout>
      <OptionsPage />
    </AppLayout>
  )
}

export default App
