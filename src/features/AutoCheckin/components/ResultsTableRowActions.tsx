import {
  Ban,
  CalendarDays,
  Ellipsis,
  MessageSquarePlus,
  RefreshCw,
  Trash2,
} from "lucide-react"
import type { ComponentProps } from "react"
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
import { useCheckInFeedback } from "~/features/CheckInFeedback/useCheckInFeedback"
import { supportsCheckInStatusReadback } from "~/services/checkin/autoCheckin/providers/registry"
import { canAutomaticallyRetryCheckinResult } from "~/services/checkin/autoCheckin/resultPolicy"
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

/** Keeps the direct action's icon and label breakpoints consistent across result states. */
function DirectResultActionButton({
  children,
  ...props
}: Pick<
  ComponentProps<typeof Button>,
  "children" | "type" | "variant" | "onClick" | "title" | "leftIcon" | "loading"
>) {
  return (
    <Button
      {...props}
      size="sm"
      className="hidden w-8 shrink-0 px-0 whitespace-nowrap [@container(min-width:48rem)]:inline-flex [@container(min-width:64rem)]:w-auto [@container(min-width:64rem)]:px-3"
    >
      <span className="sr-only [@container(min-width:64rem)]:not-sr-only [@container(min-width:64rem)]:whitespace-nowrap">
        {children}
      </span>
    </Button>
  )
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
  const { t } = useTranslation([
    "autoCheckin",
    "account",
    "accountDialog",
    "common",
  ])
  const { openFeedback, feedbackDialog } = useCheckInFeedback()
  const accountId = result.accountId
  const forceShowActions = Boolean(showDevActions)
  const isOpeningSite = pendingOpeningSiteAccountIds?.has(accountId) ?? false
  const isFailedResult = result.status === CHECKIN_RESULT_STATUS.FAILED
  const isUncertainResult = result.status === CHECKIN_RESULT_STATUS.UNCERTAIN
  /**
   * The button asks the policy the execution path applies, so a provider's own
   * `retryable` flag can neither hide nor invent the action. The queue reads the
   * decision the row stored instead; for every row this version produced the two
   * agree, which the execution tests assert, and the status-unavailable clause
   * keeps a manual attempt available for rows stored before that contract.
   */
  const canRetryResult =
    canAutomaticallyRetryCheckinResult(result, result.methodId) ||
    result.reasonCode === AUTO_CHECKIN_SKIP_REASON.STATUS_UNAVAILABLE
  const canOpenExternalCheckIn =
    externalCheckInAccountIds?.has(accountId) ?? false
  const showRetryAction = Boolean(
    onRetryAccount && (forceShowActions || canRetryResult),
  )
  const showVerifyAction = Boolean(
    onVerifyAccountStatus &&
      isUncertainResult &&
      supportsCheckInStatusReadback(result.methodId),
  )
  const showManualAction = Boolean(
    onOpenManualSignIn && (forceShowActions || isFailedResult),
  )
  const showExternalAction = Boolean(
    onOpenExternalCheckIn && canOpenExternalCheckIn,
  )
  const hasSecondaryActions = Boolean(
    onOpenAccountSite ||
      (isFailedResult && (onDisableAccount || onDeleteAccount)),
  )
  const showDirectFeedback =
    result.reasonCode === AUTO_CHECKIN_SKIP_REASON.METHOD_UNSUPPORTED ||
    result.reasonCode === AUTO_CHECKIN_SKIP_REASON.NO_PROVIDER
  // Reserve one direct action; every other action remains available in More.
  const showDirectVerifyAction = !showDirectFeedback && showVerifyAction
  const showDirectRetryAction =
    !showDirectFeedback && !showDirectVerifyAction && showRetryAction
  const showDirectExternalAction =
    !showDirectFeedback &&
    !showDirectVerifyAction &&
    !showDirectRetryAction &&
    showExternalAction
  const feedbackLabel = showDirectFeedback
    ? t("accountDialog:checkInFeedback.request")
    : t("accountDialog:checkInFeedback.feedback")
  const handleFeedback = () => openFeedback({ accountId, execution: result })
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
      {feedbackDialog}
      <div className="gap-y-density-1-5 flex items-center justify-end gap-x-1.5 whitespace-nowrap">
        {showDirectFeedback && (
          <DirectResultActionButton
            type="button"
            variant="ghost"
            onClick={handleFeedback}
            title={feedbackLabel}
            leftIcon={<MessageSquarePlus className="h-4 w-4" />}
          >
            {feedbackLabel}
          </DirectResultActionButton>
        )}
        <ProductAnalyticsScope
          featureId={PRODUCT_ANALYTICS_FEATURE_IDS.AutoCheckin}
        >
          {showDirectRetryAction && onRetryAccount && (
            <DirectResultActionButton
              variant="secondary"
              loading={retryingAccountId === accountId}
              onClick={() => onRetryAccount(accountId)}
              leftIcon={<RefreshCw className="h-3.5 w-3.5" />}
            >
              {retryingAccountId === accountId
                ? t("common:status.retrying")
                : t("execution.actions.retryAccount")}
            </DirectResultActionButton>
          )}
          {showDirectVerifyAction && onVerifyAccountStatus && (
            <DirectResultActionButton
              variant="secondary"
              loading={verifyingAccountId === accountId}
              onClick={() => onVerifyAccountStatus(accountId)}
              leftIcon={<RefreshCw className="h-3.5 w-3.5" />}
            >
              {verifyingAccountId === accountId
                ? t("common:status.refreshing")
                : t("execution.actions.verifyStatus")}
            </DirectResultActionButton>
          )}
          {showDirectExternalAction && onOpenExternalCheckIn && (
            <DirectResultActionButton
              variant="outline"
              loading={openingExternalCheckInAccountId === accountId}
              onClick={() => onOpenExternalCheckIn(accountId)}
              leftIcon={<CalendarDays className="h-3.5 w-3.5" />}
            >
              {openingExternalCheckInAccountId === accountId
                ? t("common:status.opening")
                : t("execution.actions.openExternal")}
            </DirectResultActionButton>
          )}
        </ProductAnalyticsScope>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="icon-sm"
              variant="ghost"
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
            <DropdownMenuItem onClick={handleFeedback}>
              <MessageSquarePlus className="h-4 w-4" />
              {feedbackLabel}
            </DropdownMenuItem>
            {hasSecondaryActions ? <DropdownMenuSeparator /> : null}
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
      </div>
    </ProductAnalyticsScope>
  )
}
