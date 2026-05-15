import {
  ArrowPathIcon,
  ArrowsPointingOutIcon,
  Cog6ToothIcon,
} from "@heroicons/react/24/outline"
import { PanelRightClose } from "lucide-react"
import { useCallback } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

import iconImage from "~/assets/icon.png"
import { DevDialogDebugMenu } from "~/components/DevDialogDebugMenu"
import { FeedbackDropdownMenu } from "~/components/FeedbackDropdownMenu"
import Tooltip from "~/components/Tooltip"
import { BodySmall, IconButton } from "~/components/ui"
import { VersionBadge } from "~/components/VersionBadge"
import { COLORS } from "~/constants/designTokens"
import { ProductAnalyticsScope } from "~/contexts/ProductAnalyticsScopeContext"
import { useAccountDataContext } from "~/features/AccountManagement/hooks/AccountDataContext"
import { startProductAnalyticsAction } from "~/services/productAnalytics/actions"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/events"
import { isExtensionSidePanel } from "~/utils/browser"
import { getSidePanelSupport } from "~/utils/browser/browserApi"
import { createLogger } from "~/utils/core/logger"
import {
  openApiCredentialProfilesPage,
  openFullAccountManagerPage,
  openFullBookmarkManagerPage,
  openSettingsPage,
  openSidePanelPage,
} from "~/utils/navigation"

import type { PopupViewType } from "./PopupViewSwitchTabs"
import CompactThemeToggle from "./ThemeToggle"

/**
 * Unified logger scoped to the popup header component.
 */
const logger = createLogger("PopupHeaderSection")

/**
 * Popup header with app identity (including version), theme toggle, and navigation controls.
 * Provides refresh, open-full-page, settings, and side panel shortcuts, while
 * hiding side-panel entry points on runtimes that report unsupported behavior.
 */
export default function HeaderSection({
  showRefresh = true,
  activeView = "accounts",
}: {
  showRefresh?: boolean
  activeView?: PopupViewType
}) {
  const { t, i18n } = useTranslation(["ui", "account", "common"])
  const { isRefreshing, handleRefresh } = useAccountDataContext()
  const inSidePanel = isExtensionSidePanel()
  const sidePanelSupported = getSidePanelSupport().supported
  const entrypoint = inSidePanel
    ? PRODUCT_ANALYTICS_ENTRYPOINTS.Sidepanel
    : PRODUCT_ANALYTICS_ENTRYPOINTS.Popup
  const headerSurface = inSidePanel
    ? PRODUCT_ANALYTICS_SURFACE_IDS.SidepanelHeader
    : PRODUCT_ANALYTICS_SURFACE_IDS.PopupHeader

  const handleGlobalRefresh = useCallback(async () => {
    const tracker = startProductAnalyticsAction({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.AccountManagement,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.RefreshPopupAccounts,
      surfaceId: headerSurface,
      entrypoint,
    })

    try {
      const result = await toast.promise(handleRefresh(true), {
        loading: t("account:refresh.refreshingAll"),
        success: (result) => {
          if (result.failed > 0) {
            return t("account:refresh.refreshComplete", {
              success: result.success,
              failed: result.failed,
            })
          }
          return t("account:refresh.refreshSuccess")
        },
        error: t("account:refresh.refreshFailed"),
      })
      const refreshInsights = {
        successCount: result.success,
        failureCount: result.failed,
      }
      if (result.failed > 0) {
        tracker.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
          errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
          insights: refreshInsights,
        })
        return
      }

      tracker.complete(PRODUCT_ANALYTICS_RESULTS.Success, {
        insights: refreshInsights,
      })
    } catch (error) {
      logger.error("Error during global refresh", error)
      tracker.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
        errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
      })
    }
  }, [entrypoint, handleRefresh, headerSurface, t])

  const openFullPageLabel =
    activeView === "bookmarks"
      ? t("ui:navigation.bookmark")
      : activeView === "apiCredentialProfiles"
        ? t("ui:navigation.apiCredentialProfiles")
        : t("ui:navigation.account")
  const openFullPageFeatureId =
    activeView === "bookmarks"
      ? PRODUCT_ANALYTICS_FEATURE_IDS.BookmarkManagement
      : activeView === "apiCredentialProfiles"
        ? PRODUCT_ANALYTICS_FEATURE_IDS.ApiCredentialProfiles
        : PRODUCT_ANALYTICS_FEATURE_IDS.AccountManagement
  const openFullPageActionId =
    activeView === "bookmarks"
      ? PRODUCT_ANALYTICS_ACTION_IDS.OpenPopupBookmarkManagementPage
      : activeView === "apiCredentialProfiles"
        ? PRODUCT_ANALYTICS_ACTION_IDS.OpenPopupApiCredentialProfilesPage
        : PRODUCT_ANALYTICS_ACTION_IDS.OpenPopupAccountManagementPage

  const handleOpenFullPage = async () => {
    if (activeView === "bookmarks") {
      await openFullBookmarkManagerPage()
      return
    }

    if (activeView === "apiCredentialProfiles") {
      await openApiCredentialProfilesPage()
      return
    }

    await openFullAccountManagerPage()
  }

  const handleOpenSetting = async () => {
    await openSettingsPage()
  }

  const handleOpenSidePanel = async () => {
    await openSidePanelPage()
  }

  return (
    <header
      className={`flex items-center justify-between px-3 py-2 sm:px-5 sm:py-3 ${COLORS.background.primary} ${COLORS.border.default} shrink-0 border-b`}
    >
      {/* Logo and Title Section */}
      <div className="flex min-w-0 flex-1 items-center gap-2.5 sm:gap-3">
        <img
          src={iconImage}
          alt={t("ui:app.name")}
          className="h-7 w-7 shrink-0 rounded-lg shadow-sm sm:h-8 sm:w-8"
        />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-col gap-0.5">
            <BodySmall weight="semibold" className="truncate leading-tight">
              {t("ui:app.name")}
            </BodySmall>
            {/* Current extension version (links to the changelog). */}
            <VersionBadge
              size="sm"
              className="w-fit self-start px-1.5 py-0 text-[0.65rem] leading-tight [&>a]:gap-1 [&>a]:leading-tight [&>a>svg]:size-3"
            />
          </div>
        </div>
      </div>

      {/* Action Buttons Section */}
      <ProductAnalyticsScope entrypoint={entrypoint} surfaceId={headerSurface}>
        <div className="flex shrink-0 items-center gap-1 sm:gap-2">
          <CompactThemeToggle />
          <FeedbackDropdownMenu language={i18n.language} />

          <ProductAnalyticsScope
            featureId={PRODUCT_ANALYTICS_FEATURE_IDS.AccountManagement}
          >
            {showRefresh && (
              <Tooltip content={t("common:actions.refresh")}>
                <IconButton
                  onClick={handleGlobalRefresh}
                  disabled={isRefreshing}
                  variant="outline"
                  size="sm"
                  aria-label={t("common:actions.refresh")}
                  className="touch-manipulation"
                >
                  <ArrowPathIcon
                    className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`}
                  />
                </IconButton>
              </Tooltip>
            )}

            <ProductAnalyticsScope featureId={openFullPageFeatureId}>
              <Tooltip content={openFullPageLabel}>
                <IconButton
                  onClick={handleOpenFullPage}
                  variant="outline"
                  size="sm"
                  aria-label={openFullPageLabel}
                  className="touch-manipulation"
                  analyticsAction={openFullPageActionId}
                >
                  <ArrowsPointingOutIcon className="h-4 w-4" />
                </IconButton>
              </Tooltip>
            </ProductAnalyticsScope>

            {!inSidePanel && sidePanelSupported && (
              <Tooltip content={t("common:actions.openSidePanel")}>
                <IconButton
                  aria-label={t("common:actions.openSidePanel")}
                  size="sm"
                  variant="outline"
                  onClick={handleOpenSidePanel}
                  analyticsAction={
                    PRODUCT_ANALYTICS_ACTION_IDS.OpenSidepanelFromPopup
                  }
                >
                  <PanelRightClose className="h-4 w-4" />
                </IconButton>
              </Tooltip>
            )}
          </ProductAnalyticsScope>

          <ProductAnalyticsScope
            featureId={PRODUCT_ANALYTICS_FEATURE_IDS.ProductAnalyticsSettings}
          >
            <Tooltip content={t("common:labels.settings")}>
              <IconButton
                onClick={handleOpenSetting}
                variant="outline"
                size="sm"
                aria-label={t("common:labels.settings")}
                className="touch-manipulation"
                analyticsAction={
                  PRODUCT_ANALYTICS_ACTION_IDS.OpenPopupSettingsPage
                }
              >
                <Cog6ToothIcon className="h-4 w-4" />
              </IconButton>
            </Tooltip>
          </ProductAnalyticsScope>

          <DevDialogDebugMenu />
        </div>
      </ProductAnalyticsScope>
    </header>
  )
}
