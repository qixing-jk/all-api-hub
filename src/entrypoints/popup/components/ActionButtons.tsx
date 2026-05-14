import {
  CalendarDaysIcon,
  CpuChipIcon,
  CurrencyYenIcon,
  KeyIcon,
  PlusIcon,
} from "@heroicons/react/24/outline"
import type { MouseEvent } from "react"
import { useTranslation } from "react-i18next"

import Tooltip from "~/components/Tooltip"
import { Button, IconButton } from "~/components/ui"
import { COLORS } from "~/constants/designTokens"
import { ProductAnalyticsScope } from "~/contexts/ProductAnalyticsScopeContext"
import { useAccountActionsContext } from "~/features/AccountManagement/hooks/AccountActionsContext"
import { useAccountDataContext } from "~/features/AccountManagement/hooks/AccountDataContext"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
  type ProductAnalyticsActionId,
  type ProductAnalyticsFeatureId,
} from "~/services/productAnalytics/events"
import { isExtensionSidePanel } from "~/utils/browser"
import { getExternalCheckInOpenOptions } from "~/utils/core/shortcutKeys"
import {
  openAutoCheckinPage,
  openKeysPage,
  openModelsPage,
} from "~/utils/navigation"

interface ActionButtonsProps {
  primaryActionLabel: string
  onPrimaryAction: () => void
  primaryAnalyticsAction?: {
    featureId: ProductAnalyticsFeatureId
    actionId: ProductAnalyticsActionId
  }
}

/**
 * Renders quick action buttons in popup header for the active view and navigation.
 * Uses a shared button group where only the primary CTA label/handler varies by view.
 */
export default function ActionButtons({
  primaryActionLabel,
  onPrimaryAction,
  primaryAnalyticsAction,
}: ActionButtonsProps) {
  const { t } = useTranslation("ui")
  const { displayData } = useAccountDataContext()
  const { handleOpenExternalCheckIns } = useAccountActionsContext()
  const inSidePanel = isExtensionSidePanel()
  const entrypoint = inSidePanel
    ? PRODUCT_ANALYTICS_ENTRYPOINTS.Sidepanel
    : PRODUCT_ANALYTICS_ENTRYPOINTS.Popup
  const actionBarSurface = inSidePanel
    ? PRODUCT_ANALYTICS_SURFACE_IDS.SidepanelActionBar
    : PRODUCT_ANALYTICS_SURFACE_IDS.PopupActionBar

  // Only enable the external check-in shortcut when at least one account has a custom URL.
  const externalCheckInAccounts = displayData.filter((account) => {
    const customUrl = account.checkIn?.customCheckIn?.url
    return typeof customUrl === "string" && customUrl.trim() !== ""
  })
  const canOpenExternalCheckIns = externalCheckInAccounts.length > 0
  // Highlight red when any external check-in is still pending today.
  const hasUncheckedExternalCheckIns = externalCheckInAccounts.some(
    (account) => !account.checkIn?.customCheckIn?.isCheckedInToday,
  )

  const handleOpenKeysPageClick = () => {
    openKeysPage()
  }

  const handleOpenModelsPageClick = () => {
    openModelsPage()
  }

  const handleQuickCheckinClick = () => {
    openAutoCheckinPage({ runNow: "true" })
  }

  const handleOpenExternalCheckInsClick = async (
    event: MouseEvent<HTMLButtonElement>,
  ) => {
    const { openAll, openInNewWindow } = getExternalCheckInOpenOptions(event)
    await handleOpenExternalCheckIns(externalCheckInAccounts, {
      openAll,
      openInNewWindow,
      analyticsContext: {
        featureId: PRODUCT_ANALYTICS_FEATURE_IDS.AutoCheckin,
        actionId: PRODUCT_ANALYTICS_ACTION_IDS.OpenPopupExternalCheckIns,
        surfaceId: actionBarSurface,
        entrypoint,
      },
    })
  }

  return (
    <section
      className={`px-3 py-2 sm:px-5 sm:py-3 ${COLORS.background.secondary} ${COLORS.border.default} border-b`}
    >
      <ProductAnalyticsScope
        entrypoint={entrypoint}
        surfaceId={actionBarSurface}
      >
        <div className="flex gap-1.5 sm:gap-2">
          <Button
            onClick={onPrimaryAction}
            className="flex-1 touch-manipulation"
            size="default"
            leftIcon={<PlusIcon className="h-4 w-4" />}
            analyticsAction={primaryAnalyticsAction}
          >
            {primaryActionLabel}
          </Button>

          <Tooltip content={t("navigation.keys")}>
            <ProductAnalyticsScope
              featureId={PRODUCT_ANALYTICS_FEATURE_IDS.AccountManagement}
            >
              <IconButton
                onClick={handleOpenKeysPageClick}
                variant="outline"
                size="default"
                className="touch-manipulation"
                aria-label={t("navigation.keys")}
                analyticsAction={
                  PRODUCT_ANALYTICS_ACTION_IDS.OpenPopupKeyManagement
                }
              >
                <KeyIcon className="h-4 w-4" />
              </IconButton>
            </ProductAnalyticsScope>
          </Tooltip>

          <Tooltip content={t("navigation.models")}>
            <ProductAnalyticsScope
              featureId={PRODUCT_ANALYTICS_FEATURE_IDS.ModelList}
            >
              <IconButton
                onClick={handleOpenModelsPageClick}
                variant="outline"
                size="default"
                className="touch-manipulation"
                aria-label={t("navigation.models")}
                analyticsAction={
                  PRODUCT_ANALYTICS_ACTION_IDS.OpenPopupModelManagement
                }
              >
                <CpuChipIcon className="h-4 w-4" />
              </IconButton>
            </ProductAnalyticsScope>
          </Tooltip>

          <ProductAnalyticsScope
            featureId={PRODUCT_ANALYTICS_FEATURE_IDS.AutoCheckin}
          >
            <Tooltip content={t("navigation.autoCheckinRunNow")}>
              <IconButton
                onClick={handleQuickCheckinClick}
                variant="outline"
                size="default"
                className="touch-manipulation"
                aria-label={t("navigation.autoCheckinRunNow")}
                analyticsAction={
                  PRODUCT_ANALYTICS_ACTION_IDS.RunPopupQuickCheckin
                }
              >
                <CalendarDaysIcon className="h-4 w-4" />
              </IconButton>
            </Tooltip>

            {canOpenExternalCheckIns && (
              <Tooltip content={t("navigation.externalCheckinAllHint")}>
                <IconButton
                  onClick={handleOpenExternalCheckInsClick}
                  variant="outline"
                  size="default"
                  className="touch-manipulation"
                  aria-label={t("navigation.externalCheckinAll")}
                >
                  {/* Match per-account indicator colors: red when not checked in today, green when done. */}
                  <CurrencyYenIcon
                    className={`h-4 w-4 ${
                      hasUncheckedExternalCheckIns
                        ? "text-red-500"
                        : "text-green-500"
                    }`}
                  />
                </IconButton>
              </Tooltip>
            )}
          </ProductAnalyticsScope>
        </div>
      </ProductAnalyticsScope>
    </section>
  )
}
