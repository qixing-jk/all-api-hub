import {
  CalendarDays,
  CircleDollarSign,
  Cpu,
  KeyRound,
  Plus,
} from "lucide-react"
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
} from "~/services/productAnalytics/contracts"
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
  primaryActionTestId?: string
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
  primaryActionTestId,
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
  // Use a neutral indicator while any external check-in is still pending today.
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
      className={`py-density-2 sm:py-density-3 px-3 sm:px-5 ${COLORS.background.secondary} ${COLORS.border.default} border-b`}
    >
      <ProductAnalyticsScope
        entrypoint={entrypoint}
        surfaceId={actionBarSurface}
      >
        <div className="gap-y-density-1-5 sm:gap-y-density-2 flex gap-x-1.5 sm:gap-x-2">
          <Button
            onClick={onPrimaryAction}
            data-testid={primaryActionTestId}
            className="flex-1 touch-manipulation"
            size="default"
            leftIcon={<Plus className="h-4 w-4" />}
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
                <KeyRound className="h-4 w-4" />
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
                <Cpu className="h-4 w-4" />
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
                <CalendarDays className="h-4 w-4" />
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
                  {/* Match per-account indicators: neutral while pending, success when done. */}
                  <CircleDollarSign
                    className={`h-4 w-4 ${
                      hasUncheckedExternalCheckIns
                        ? "text-neutral-indicator"
                        : "text-success-indicator"
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
