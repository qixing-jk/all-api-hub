import { Ban, CalendarDays, Ellipsis, RefreshCw, Trash2 } from "lucide-react"
import { useTranslation } from "react-i18next"

import { WorkflowTransitionIcon } from "~/components/icons/WorkflowTransitionIcon"
import { Button } from "~/components/ui"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu"
import { ProductAnalyticsScope } from "~/contexts/ProductAnalyticsScopeContext"
import { cn } from "~/lib/utils"
import {
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/contracts"
import {
  AUTO_CHECKIN_SKIP_REASON,
  CHECKIN_RESULT_STATUS,
  type CheckinAccountResult,
} from "~/types/autoCheckin"

import type { ResultsTableActionsProps } from "./ResultsTable.types"

interface ResultsTableRowActionsProps extends ResultsTableActionsProps {
  result: CheckinAccountResult
}

/** Renders direct and overflow actions for one execution-result row. */
export default function ResultsTableRowActions({
  result,
  showDevActions,
  retryingAccountId,
  verifyingAccountId,
  pendingOpeningSiteAccountIds,
  openingManualAccountId,
  openingExternalCheckInAccountId,
  disablingAccountId,
  deletingAccountId,
  externalCheckInAccountIds,
  onRetryAccount,
  onVerifyAccountStatus,
  onOpenAccountSite,
  onOpenManualSignIn,
  onOpenExternalCheckIn,
  onDisableAccount,
  onDeleteAccount,
}: ResultsTableRowActionsProps) {
  const { t } = useTranslation(["autoCheckin", "account"])
  const accountId = result.accountId
  const forceShowActions = Boolean(showDevActions)
  const isOpeningSite = pendingOpeningSiteAccountIds?.has(accountId) ?? false
  const isFailedResult = result.status === CHECKIN_RESULT_STATUS.FAILED
  const isUncertainResult = result.status === CHECKIN_RESULT_STATUS.UNCERTAIN
  const canRetryResult =
    isFailedResult ||
    result.reasonCode === AUTO_CHECKIN_SKIP_REASON.STATUS_UNAVAILABLE
  const canOpenExternalCheckIn =
    externalCheckInAccountIds?.has(accountId) ?? false
  const showRetryAction = Boolean(
    onRetryAccount && (forceShowActions || canRetryResult),
  )
  const showVerifyAction = Boolean(onVerifyAccountStatus && isUncertainResult)
  const showManualAction = Boolean(
    onOpenManualSignIn && (forceShowActions || isFailedResult),
  )
  const showExternalAction = Boolean(
    onOpenExternalCheckIn && canOpenExternalCheckIn,
  )
  const hasPrimaryActions =
    showRetryAction ||
    showVerifyAction ||
    showManualAction ||
    showExternalAction
  const showDirectExternalAction = !showRetryAction && showExternalAction
  const hasExpandedPrimaryMenuActions =
    showVerifyAction ||
    showManualAction ||
    (showRetryAction && showExternalAction)
  const hasSecondaryActions = Boolean(
    onOpenAccountSite ||
      (isFailedResult && (onDisableAccount || onDeleteAccount)),
  )
  const hasAnyActions = hasPrimaryActions || hasSecondaryActions
  const hasExpandedMenuActions =
    hasExpandedPrimaryMenuActions || hasSecondaryActions
  const isPrimaryActionPending = Boolean(
    retryingAccountId === accountId ||
      verifyingAccountId === accountId ||
      openingManualAccountId === accountId ||
      openingExternalCheckInAccountId === accountId,
  )
  const isSecondaryActionPending =
    isOpeningSite ||
    disablingAccountId === accountId ||
    deletingAccountId === accountId
  const isAnyActionPending = isPrimaryActionPending || isSecondaryActionPending

  return (
    <ProductAnalyticsScope
      entrypoint={PRODUCT_ANALYTICS_ENTRYPOINTS.Options}
      surfaceId={PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAutoCheckinResultsTable}
    >
      <div className="flex items-center justify-end gap-1.5 whitespace-nowrap">
        <ProductAnalyticsScope
          featureId={PRODUCT_ANALYTICS_FEATURE_IDS.AutoCheckin}
        >
          {showRetryAction && onRetryAccount && (
            <Button
              size="sm"
              variant="secondary"
              className="hidden w-8 px-0 [@container(min-width:48rem)]:inline-flex [@container(min-width:64rem)]:w-auto [@container(min-width:64rem)]:px-3"
              loading={retryingAccountId === accountId}
              onClick={() => onRetryAccount(accountId)}
              leftIcon={<RefreshCw className="h-3.5 w-3.5" />}
            >
              <span className="sr-only [@container(min-width:64rem)]:not-sr-only">
                {retryingAccountId === accountId
                  ? t("common:status.retrying")
                  : t("execution.actions.retryAccount")}
              </span>
            </Button>
          )}
          {showVerifyAction && onVerifyAccountStatus && (
            <Button
              size="sm"
              variant="secondary"
              className="hidden w-8 px-0 [@container(min-width:48rem)]:inline-flex [@container(min-width:64rem)]:w-auto [@container(min-width:64rem)]:px-3"
              loading={verifyingAccountId === accountId}
              onClick={() => onVerifyAccountStatus(accountId)}
              leftIcon={<RefreshCw className="h-3.5 w-3.5" />}
            >
              <span className="sr-only [@container(min-width:64rem)]:not-sr-only">
                {verifyingAccountId === accountId
                  ? t("common:status.refreshing")
                  : t("execution.actions.verifyStatus")}
              </span>
            </Button>
          )}
          {showDirectExternalAction && onOpenExternalCheckIn && (
            <Button
              size="sm"
              variant="outline"
              className="hidden w-8 px-0 [@container(min-width:48rem)]:inline-flex [@container(min-width:64rem)]:w-auto [@container(min-width:64rem)]:px-3"
              loading={openingExternalCheckInAccountId === accountId}
              onClick={() => onOpenExternalCheckIn(accountId)}
              leftIcon={<CalendarDays className="h-3.5 w-3.5" />}
            >
              <span className="sr-only [@container(min-width:64rem)]:not-sr-only">
                {openingExternalCheckInAccountId === accountId
                  ? t("common:status.opening")
                  : t("execution.actions.openExternal")}
              </span>
            </Button>
          )}
        </ProductAnalyticsScope>
        {hasAnyActions ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="icon-sm"
                variant="ghost"
                className={cn(
                  !hasExpandedMenuActions &&
                    "[@container(min-width:48rem)]:hidden",
                )}
                aria-label={t("common:actions.more")}
                disabled={isAnyActionPending}
                loading={isAnyActionPending}
                leftIcon={<Ellipsis className="h-4 w-4" />}
              />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <ProductAnalyticsScope
                featureId={PRODUCT_ANALYTICS_FEATURE_IDS.AutoCheckin}
              >
                {showRetryAction && onRetryAccount ? (
                  <DropdownMenuItem
                    className="[@container(min-width:48rem)]:hidden"
                    disabled={retryingAccountId === accountId}
                    onClick={() => onRetryAccount(accountId)}
                  >
                    <RefreshCw className="h-4 w-4" />
                    {retryingAccountId === accountId
                      ? t("common:status.retrying")
                      : t("execution.actions.retryAccount")}
                  </DropdownMenuItem>
                ) : null}
                {showVerifyAction && onVerifyAccountStatus ? (
                  <DropdownMenuItem
                    disabled={verifyingAccountId === accountId}
                    onClick={() => onVerifyAccountStatus(accountId)}
                  >
                    <RefreshCw className="h-4 w-4" />
                    {verifyingAccountId === accountId
                      ? t("common:status.refreshing")
                      : t("execution.actions.verifyStatus")}
                  </DropdownMenuItem>
                ) : null}
                {showManualAction && onOpenManualSignIn ? (
                  <DropdownMenuItem
                    disabled={openingManualAccountId === accountId}
                    onClick={() => onOpenManualSignIn(accountId)}
                  >
                    <WorkflowTransitionIcon className="h-4 w-4" />
                    {openingManualAccountId === accountId
                      ? t("common:status.opening")
                      : t("execution.actions.openManual")}
                  </DropdownMenuItem>
                ) : null}
                {showExternalAction && onOpenExternalCheckIn ? (
                  <DropdownMenuItem
                    className={cn(
                      showDirectExternalAction &&
                        "[@container(min-width:48rem)]:hidden",
                    )}
                    disabled={openingExternalCheckInAccountId === accountId}
                    onClick={() => onOpenExternalCheckIn(accountId)}
                  >
                    <CalendarDays className="h-4 w-4" />
                    {openingExternalCheckInAccountId === accountId
                      ? t("common:status.opening")
                      : t("execution.actions.openExternal")}
                  </DropdownMenuItem>
                ) : null}
              </ProductAnalyticsScope>
              {hasPrimaryActions && hasSecondaryActions ? (
                <DropdownMenuSeparator
                  className={cn(
                    !hasExpandedPrimaryMenuActions &&
                      "[@container(min-width:48rem)]:hidden",
                  )}
                />
              ) : null}
              <ProductAnalyticsScope
                featureId={PRODUCT_ANALYTICS_FEATURE_IDS.AccountManagement}
              >
                {onOpenAccountSite ? (
                  <DropdownMenuItem
                    disabled={isOpeningSite}
                    onClick={() => onOpenAccountSite(accountId)}
                  >
                    <WorkflowTransitionIcon className="h-4 w-4" />
                    {isOpeningSite
                      ? t("common:status.opening")
                      : t("execution.actions.openSite")}
                  </DropdownMenuItem>
                ) : null}
                {onOpenAccountSite &&
                isFailedResult &&
                (onDisableAccount || onDeleteAccount) ? (
                  <DropdownMenuSeparator />
                ) : null}
                {onDisableAccount && isFailedResult ? (
                  <DropdownMenuItem
                    disabled={disablingAccountId === accountId}
                    onClick={() => onDisableAccount(accountId)}
                  >
                    <Ban className="h-4 w-4" />
                    {disablingAccountId === accountId
                      ? t("common:status.disabling")
                      : t("account:actions.disableAccount")}
                  </DropdownMenuItem>
                ) : null}
                {onDeleteAccount && isFailedResult ? (
                  <DropdownMenuItem
                    variant="destructive"
                    disabled={deletingAccountId === accountId}
                    onClick={() => onDeleteAccount(accountId)}
                  >
                    <Trash2 className="h-4 w-4" />
                    {deletingAccountId === accountId
                      ? t("common:status.deleting")
                      : t("account:actions.delete")}
                  </DropdownMenuItem>
                ) : null}
              </ProductAnalyticsScope>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>
    </ProductAnalyticsScope>
  )
}
