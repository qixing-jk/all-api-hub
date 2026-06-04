import { AlertTriangle, LayoutDashboard } from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import { useTranslation } from "react-i18next"

import { PageHeader } from "~/components/PageHeader"
import { Alert, Button, Spinner } from "~/components/ui"
import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { PermissionOnboardingDialog } from "~/features/OptionsOverview/components/dialogs/PermissionOnboardingDialog"
import { setLastSeenOptionalPermissions } from "~/services/permissions/optionalPermissionState"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_EVENTS,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
  PRODUCT_ANALYTICS_TARGET_KINDS,
  trackProductAnalyticsEvent,
} from "~/services/productAnalytics/events"
import { pushWithinOptionsPage } from "~/utils/navigation"

import { OptionsOverviewGrid } from "./components/OptionsOverviewGrid"
import { OPTIONS_OVERVIEW_TEST_IDS } from "./testIds"
import type { OptionsOverviewNavigationIntent } from "./types"
import { useOptionsOverviewData } from "./useOptionsOverviewData"

const overviewWidgetSurfaceIds = {
  statusSummary: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsOverviewStatusSummary,
  needsAttention: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsOverviewAttentionList,
  automationOverview:
    PRODUCT_ANALYTICS_SURFACE_IDS.OptionsOverviewAutomationOverview,
  recentUsage: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsOverviewRecentUsage,
  actionCenter: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsOverviewActionCenter,
} as const

/**
 * Reads the Overview-owned permissions onboarding state from the current URL.
 */
export function getPermissionsOnboardingReasonFromUrl(): string | null {
  if (typeof window === "undefined") {
    return null
  }

  const url = new URL(window.location.href)
  if (url.hash !== `#${MENU_ITEM_IDS.OVERVIEW}`) {
    return null
  }

  return url.searchParams.get("onboarding") === "permissions"
    ? url.searchParams.get("reason") ?? ""
    : null
}

/**
 * Options default overview workbench for local account, usage, and setup status.
 */
export default function OptionsOverview() {
  const { t } = useTranslation(["optionsOverview", "common"])
  const { isLoading, error, viewModel, reload } = useOptionsOverviewData()
  const [permissionsOnboardingReason, setPermissionsOnboardingReason] =
    useState<string | null>(() => getPermissionsOnboardingReasonFromUrl())
  const showPermissionsOnboarding = permissionsOnboardingReason !== null

  useEffect(() => {
    const applyUrlState = () => {
      setPermissionsOnboardingReason(getPermissionsOnboardingReasonFromUrl())
    }

    applyUrlState()
    window.addEventListener("popstate", applyUrlState)
    window.addEventListener("hashchange", applyUrlState)
    return () => {
      window.removeEventListener("popstate", applyUrlState)
      window.removeEventListener("hashchange", applyUrlState)
    }
  }, [])

  const handleClosePermissionsOnboarding = useCallback(() => {
    setPermissionsOnboardingReason(null)
    void setLastSeenOptionalPermissions()

    const url = new URL(window.location.href)
    url.searchParams.delete("onboarding")
    url.searchParams.delete("reason")
    window.history.replaceState(null, "", url.toString())
  }, [])

  const handleRetry = () => {
    void trackProductAnalyticsEvent(
      PRODUCT_ANALYTICS_EVENTS.FeatureActionCompleted,
      {
        feature_id: PRODUCT_ANALYTICS_FEATURE_IDS.OptionsOverview,
        action_id: PRODUCT_ANALYTICS_ACTION_IDS.RefreshOptionsOverviewData,
        surface_id: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsOverviewStatusSummary,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
        result: PRODUCT_ANALYTICS_RESULTS.Success,
      },
    )
    reload()
  }

  const handleNavigate = ({
    target,
    sourceWidgetId,
  }: OptionsOverviewNavigationIntent) => {
    void trackProductAnalyticsEvent(
      PRODUCT_ANALYTICS_EVENTS.FeatureActionCompleted,
      {
        feature_id: PRODUCT_ANALYTICS_FEATURE_IDS.OptionsOverview,
        action_id: PRODUCT_ANALYTICS_ACTION_IDS.OpenOptionsOverviewTarget,
        surface_id: overviewWidgetSurfaceIds[sourceWidgetId],
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
        result: PRODUCT_ANALYTICS_RESULTS.Success,
        target_kind: PRODUCT_ANALYTICS_TARGET_KINDS.OptionsPage,
        target_page_id: target.menuItemId,
        route_params_present: Boolean(
          target.params && Object.keys(target.params).length > 0,
        ),
      },
    )
    pushWithinOptionsPage(`#${target.menuItemId}`, target.params ?? {})
  }

  return (
    <div className="space-y-6 p-6" data-testid={OPTIONS_OVERVIEW_TEST_IDS.page}>
      <PageHeader
        icon={LayoutDashboard}
        title={t("optionsOverview:title")}
        description={t("optionsOverview:description")}
      />

      {isLoading && !viewModel ? (
        <div className="dark:text-dark-text-secondary flex min-h-64 items-center justify-center gap-3 text-sm text-gray-600">
          <Spinner size="default" aria-label={t("common:status.loading")} />
          <span>{t("optionsOverview:states.loading")}</span>
        </div>
      ) : null}

      {error ? (
        <Alert
          variant="warning"
          compact
          title={t("optionsOverview:states.loadedWithError")}
          showIcon
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-sm">{error}</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleRetry}
              leftIcon={<AlertTriangle className="h-4 w-4" />}
            >
              {t("common:actions.retry")}
            </Button>
          </div>
        </Alert>
      ) : null}

      {viewModel ? (
        <OptionsOverviewGrid
          viewModel={viewModel}
          t={t}
          onNavigate={handleNavigate}
        />
      ) : null}

      <PermissionOnboardingDialog
        open={showPermissionsOnboarding}
        onClose={handleClosePermissionsOnboarding}
        reason={permissionsOnboardingReason}
      />
    </div>
  )
}
