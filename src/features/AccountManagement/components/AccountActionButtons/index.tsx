import {
  Ban,
  Banknote,
  CalendarCheck2,
  ChartPie,
  CircleCheck,
  Cpu,
  Ellipsis,
  KeyRound,
  Link,
  List,
  MessageSquarePlus,
  PanelsTopLeft,
  Pencil,
  RefreshCw,
  Search,
  Share2,
  Trash2,
} from "lucide-react"
import { useTranslation } from "react-i18next"

import { IconButton } from "~/components/ui"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu"
import { CHECK_IN_DISCOVERY_DECISION_OUTCOMES } from "~/constants/checkIn"
import { ProductAnalyticsScope } from "~/contexts/ProductAnalyticsScopeContext"
import { ACCOUNT_MANAGEMENT_TEST_IDS } from "~/features/AccountManagement/testIds"
import { inspectAccountCheckIn } from "~/services/checkin/autoCheckin/inspection"
import { getAutoCheckinCandidateMethodIds } from "~/services/checkin/autoCheckin/providers/registry"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_FEATURE_IDS,
} from "~/services/productAnalytics/contracts"

import { InviteLinkManualCopyDialog } from "../InviteLinkManualCopyDialog"
import { AccountActionMenuItem } from "./AccountActionMenuItem"
import { AccountActionSubmenu } from "./AccountActionSubmenu"
import {
  useAccountRowActions,
  type ActionButtonsProps,
} from "./useAccountRowActions"

/** Render the feature through its state and command owner. */
export default function AccountActionButtons({
  site,
  onCopyKey,
  onDeleteAccount,
}: ActionButtonsProps) {
  const { t } = useTranslation([
    "account",
    "shareSnapshots",
    "messages",
    "common",
    "autoCheckin",
  ])
  const {
    refreshingAccountId,
    isPinFeatureEnabled,
    openFeedback,
    feedbackDialog,
    redetect,
    isRedetectingCheckIn,
    selectionDialog,
    onMenuCloseAutoFocus,
    openEditAccount,
    isCheckingTokens,
    isRefreshMenuPending,
    isMoreActionsOpen,
    setIsMoreActionsOpen,
    isCopyingInviteLink,
    manualInviteLinkPayload,
    setManualInviteLinkPayload,
    moreActionsTriggerRef,
    suppressMoreActionsFocusRestoreRef,
    isAccountDisabled,
    primaryKeyActionLabel,
    canCopyInviteLink,
    isQuickCheckinEligible,
    canLocateManagedSiteChannel,
    isManagedSiteChannelLookupSupported,
    pinLabel,
    PinToggleIcon,
    handleTogglePin,
    handlePrimaryKeyAction,
    handleCopyUrlLocal,
    handleNavigateToKeyManagement,
    handleNavigateToModelManagement,
    canOpenUsagePage,
    canOpenRedeemPage,
    handleNavigateToUsageManagement,
    handleNavigateToRedeemPage,
    handleLocateManagedSiteChannel,
    handleOpenKeyList,
    handleRefreshLocal,
    handleDeleteLocal,
    handleDisableToggle,
    handleShareSnapshot,
    handleCopyInviteLink,
    handleQuickCheckin,
    optionsEntrypoint,
    rowActionsSurface,
  } = useAccountRowActions({ site, onCopyKey, onDeleteAccount })
  return (
    <ProductAnalyticsScope
      entrypoint={optionsEntrypoint}
      featureId={PRODUCT_ANALYTICS_FEATURE_IDS.AccountManagement}
      surfaceId={rowActionsSurface}
    >
      <div className="gap-y-density-2 grid grid-cols-2 justify-end gap-x-2 sm:grid-cols-4">
        {/* Primary Level - Standalone buttons */}
        <IconButton
          onClick={handleCopyUrlLocal}
          variant="ghost"
          size="sm"
          className="touch-manipulation"
          disabled={isAccountDisabled}
          aria-label={t("actions.copyUrl")}
          data-testid={ACCOUNT_MANAGEMENT_TEST_IDS.rowCopyUrlButton}
          title={t("actions.copyUrl")}
          analyticsAction={PRODUCT_ANALYTICS_ACTION_IDS.CopyAccountSiteUrl}
        >
          <Link className="h-4 w-4" />
        </IconButton>

        <IconButton
          onClick={handlePrimaryKeyAction}
          variant="ghost"
          size="sm"
          className="touch-manipulation"
          loading={isCheckingTokens}
          disabled={isAccountDisabled}
          aria-label={primaryKeyActionLabel}
          data-testid={ACCOUNT_MANAGEMENT_TEST_IDS.rowCopyKeyButton}
          title={primaryKeyActionLabel}
        >
          <KeyRound className="h-4 w-4" />
        </IconButton>

        <IconButton
          onClick={(e) => {
            e.stopPropagation()
            openEditAccount(site)
          }}
          variant="ghost"
          size="sm"
          className="touch-manipulation"
          disabled={isAccountDisabled}
          aria-label={t("actions.edit")}
          data-testid={ACCOUNT_MANAGEMENT_TEST_IDS.rowEditButton}
          title={t("actions.edit")}
          analyticsAction={PRODUCT_ANALYTICS_ACTION_IDS.OpenUpdateAccountDialog}
        >
          <Pencil className="h-4 w-4" />
        </IconButton>

        {/* Secondary Level - Dropdown menu */}
        <DropdownMenu
          open={isMoreActionsOpen}
          onOpenChange={setIsMoreActionsOpen}
        >
          <DropdownMenuTrigger asChild>
            <IconButton
              variant="ghost"
              size="sm"
              aria-label={t("common:actions.more")}
              ref={moreActionsTriggerRef}
              data-testid={ACCOUNT_MANAGEMENT_TEST_IDS.rowMoreActionsButton}
            >
              <Ellipsis className="h-4 w-4" />
            </IconButton>
          </DropdownMenuTrigger>

          <DropdownMenuContent
            align="end"
            onCloseAutoFocus={(event) => {
              onMenuCloseAutoFocus(event)
              if (suppressMoreActionsFocusRestoreRef.current) {
                event.preventDefault()
                suppressMoreActionsFocusRestoreRef.current = false
              }
            }}
            className="border-border bg-card py-density-1 z-50 rounded-lg border shadow-lg focus:outline-none"
          >
            {isAccountDisabled ? (
              <>
                <AccountActionMenuItem
                  onClick={handleDisableToggle}
                  icon={CircleCheck}
                  label={t("actions.enableAccount")}
                  closeOnSelect={false}
                  testId={ACCOUNT_MANAGEMENT_TEST_IDS.rowDisableToggleMenuItem}
                />

                <DropdownMenuSeparator className="bg-secondary my-density-1" />

                <AccountActionMenuItem
                  onClick={handleDeleteLocal}
                  icon={Trash2}
                  label={t("actions.delete")}
                  isDestructive={true}
                  testId={ACCOUNT_MANAGEMENT_TEST_IDS.rowDeleteMenuItem}
                />
              </>
            ) : (
              <>
                <AccountActionMenuItem
                  onClick={handleOpenKeyList}
                  icon={List}
                  label={t("actions.keyList")}
                  analyticsAction={PRODUCT_ANALYTICS_ACTION_IDS.OpenKeyList}
                />

                <AccountActionMenuItem
                  onClick={handleNavigateToKeyManagement}
                  icon={KeyRound}
                  label={t("actions.keyManagement")}
                  testId={ACCOUNT_MANAGEMENT_TEST_IDS.rowKeyManagementMenuItem}
                  analyticsAction={
                    PRODUCT_ANALYTICS_ACTION_IDS.OpenKeyManagement
                  }
                />

                <ProductAnalyticsScope
                  featureId={PRODUCT_ANALYTICS_FEATURE_IDS.ModelList}
                >
                  <AccountActionMenuItem
                    onClick={handleNavigateToModelManagement}
                    icon={Cpu}
                    label={t("actions.modelManagement")}
                    testId={
                      ACCOUNT_MANAGEMENT_TEST_IDS.rowModelManagementMenuItem
                    }
                    analyticsAction={
                      PRODUCT_ANALYTICS_ACTION_IDS.OpenModelManagement
                    }
                  />
                </ProductAnalyticsScope>

                {canLocateManagedSiteChannel && (
                  <ProductAnalyticsScope
                    featureId={
                      PRODUCT_ANALYTICS_FEATURE_IDS.ManagedSiteChannels
                    }
                  >
                    <AccountActionMenuItem
                      onClick={handleLocateManagedSiteChannel}
                      icon={Search}
                      label={t("actions.locateManagedSiteChannel")}
                      hint={
                        !isManagedSiteChannelLookupSupported
                          ? t("actions.locateManagedSiteChannelUnsupportedHint")
                          : undefined
                      }
                      description={
                        !isManagedSiteChannelLookupSupported
                          ? t("actions.locateManagedSiteChannelUnsupported")
                          : undefined
                      }
                      disabled={!isManagedSiteChannelLookupSupported}
                      analyticsAction={
                        PRODUCT_ANALYTICS_ACTION_IDS.LocateManagedSiteChannel
                      }
                    />
                  </ProductAnalyticsScope>
                )}

                <DropdownMenuSeparator className="bg-secondary my-density-1" />

                <AccountActionMenuItem
                  onClick={handleRefreshLocal}
                  icon={RefreshCw}
                  label={t("actions.refresh")}
                  loading={isRefreshMenuPending}
                  loadingLabel={t("common:status.refreshing")}
                  disabled={refreshingAccountId === site.id}
                  testId={ACCOUNT_MANAGEMENT_TEST_IDS.rowRefreshMenuItem}
                />

                {getAutoCheckinCandidateMethodIds(site.siteType, site.baseUrl)
                  .length > 0 && (
                  <AccountActionMenuItem
                    onClick={() => {
                      setIsMoreActionsOpen(false)
                      void redetect(moreActionsTriggerRef.current ?? undefined)
                    }}
                    icon={CalendarCheck2}
                    label={t("accountDialog:form.redetectCheckInMethods")}
                    loading={isRedetectingCheckIn}
                    loadingLabel={t(
                      "accountDialog:form.redetectingCheckInMethods",
                    )}
                  />
                )}

                {isQuickCheckinEligible && (
                  <ProductAnalyticsScope
                    featureId={PRODUCT_ANALYTICS_FEATURE_IDS.AutoCheckin}
                  >
                    <AccountActionMenuItem
                      onClick={handleQuickCheckin}
                      icon={CalendarCheck2}
                      label={t("actions.quickCheckin")}
                      testId={
                        ACCOUNT_MANAGEMENT_TEST_IDS.rowQuickCheckinMenuItem
                      }
                    />
                  </ProductAnalyticsScope>
                )}

                <DropdownMenuSeparator className="bg-secondary my-density-1" />

                {(canOpenUsagePage || canOpenRedeemPage) && (
                  <AccountActionSubmenu
                    icon={PanelsTopLeft}
                    label={t("actions.relatedPages")}
                  >
                    <ProductAnalyticsScope
                      featureId={PRODUCT_ANALYTICS_FEATURE_IDS.UsageAnalytics}
                    >
                      {canOpenUsagePage && (
                        <AccountActionMenuItem
                          onClick={handleNavigateToUsageManagement}
                          icon={ChartPie}
                          label={t("actions.usageLog")}
                          testId={
                            ACCOUNT_MANAGEMENT_TEST_IDS.rowUsageLogMenuItem
                          }
                          analyticsAction={
                            PRODUCT_ANALYTICS_ACTION_IDS.OpenAccountUsageLog
                          }
                        />
                      )}
                    </ProductAnalyticsScope>
                    {canOpenRedeemPage && (
                      <AccountActionMenuItem
                        onClick={handleNavigateToRedeemPage}
                        icon={Banknote}
                        label={t("actions.redeemPage")}
                        testId={ACCOUNT_MANAGEMENT_TEST_IDS.rowRedeemMenuItem}
                        analyticsAction={
                          PRODUCT_ANALYTICS_ACTION_IDS.OpenRedeemPage
                        }
                      />
                    )}
                  </AccountActionSubmenu>
                )}

                <AccountActionSubmenu icon={Share2} label={t("actions.share")}>
                  <AccountActionMenuItem
                    onClick={handleCopyInviteLink}
                    icon={Link}
                    label={t("actions.copyInviteLink")}
                    hint={
                      !canCopyInviteLink
                        ? t("actions.copyInviteLinkUnsupportedHint")
                        : undefined
                    }
                    description={
                      !canCopyInviteLink
                        ? t("actions.copyInviteLinkUnsupported")
                        : undefined
                    }
                    disabled={!canCopyInviteLink}
                    loading={isCopyingInviteLink}
                    loadingLabel={t("actions.copyingInviteLink")}
                    testId={
                      ACCOUNT_MANAGEMENT_TEST_IDS.rowCopyInviteLinkMenuItem
                    }
                  />

                  <AccountActionMenuItem
                    onClick={handleShareSnapshot}
                    icon={Share2}
                    label={t("shareSnapshots:actions.shareAccountSnapshot")}
                  />
                </AccountActionSubmenu>

                <AccountActionMenuItem
                  onClick={() => openFeedback({ accountId: site.id })}
                  icon={MessageSquarePlus}
                  label={
                    inspectAccountCheckIn({
                      config: site.checkIn,
                      siteType: site.siteType,
                    }).decision.outcome ===
                    CHECK_IN_DISCOVERY_DECISION_OUTCOMES.Unsupported
                      ? t("accountDialog:checkInFeedback.request")
                      : t("accountDialog:checkInFeedback.feedback")
                  }
                />

                <DropdownMenuSeparator className="bg-secondary my-density-1" />

                {/* Pin/Unpin */}
                {isPinFeatureEnabled && (
                  <AccountActionMenuItem
                    onClick={handleTogglePin}
                    icon={PinToggleIcon}
                    label={pinLabel}
                    testId={ACCOUNT_MANAGEMENT_TEST_IDS.rowPinToggleMenuItem}
                  />
                )}

                {/* Place Disable immediately above Delete for clarity and consistency. */}
                <AccountActionMenuItem
                  onClick={handleDisableToggle}
                  icon={Ban}
                  label={t("actions.disableAccount")}
                  tone="warning"
                  closeOnSelect={false}
                  testId={ACCOUNT_MANAGEMENT_TEST_IDS.rowDisableToggleMenuItem}
                />

                <AccountActionMenuItem
                  onClick={handleDeleteLocal}
                  icon={Trash2}
                  label={t("actions.delete")}
                  isDestructive={true}
                  testId={ACCOUNT_MANAGEMENT_TEST_IDS.rowDeleteMenuItem}
                />
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {feedbackDialog}
      {selectionDialog}
      {manualInviteLinkPayload !== null ? (
        <InviteLinkManualCopyDialog
          payload={manualInviteLinkPayload}
          onClose={() => setManualInviteLinkPayload(null)}
        />
      ) : null}
    </ProductAnalyticsScope>
  )
}
