import { CheckCheck, Megaphone, RefreshCcw } from "lucide-react"
import { useCallback } from "react"
import { useTranslation } from "react-i18next"

import { OptionsPageSettingsTitleAction } from "~/components/OptionsPageSettingsTitleAction"
import { PageHeader } from "~/components/PageHeader"
import { Button, Notice } from "~/components/ui"
import { EmptyState } from "~/components/ui/EmptyState"
import { BASIC_SETTINGS_TAB_IDS } from "~/constants/basicSettingsTabs"
import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { SETTINGS_ANCHORS } from "~/constants/settingsAnchors"
import { ProductAnalyticsScope } from "~/contexts/ProductAnalyticsScopeContext"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import { useSiteAnnouncementsWorkspace } from "~/features/SiteAnnouncements/useSiteAnnouncementsWorkspace"
import {
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/contracts"
import { openSettingsTab } from "~/utils/navigation"
import { pushWithinOptionsPage } from "~/utils/navigation/optionsPage"

import { SiteAnnouncementsList } from "./components/SiteAnnouncementsList"
import { SiteAnnouncementsOverviewCard } from "./components/SiteAnnouncementsOverviewCard"
import { SiteAnnouncementsSearchBar } from "./components/SiteAnnouncementsSearchBar"
import { SiteAnnouncementsStatusAlert } from "./components/SiteAnnouncementsStatusAlert"

interface SiteAnnouncementsPageProps {
  routeParams?: Record<string, string>
  refreshKey?: number
}

const textLinkClassName =
  "font-medium text-theme-600 underline-offset-2 hover:underline focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none dark:text-theme-400"

/**
 * Options page for locally cached provider-site announcements.
 */
export default function SiteAnnouncementsPage({
  routeParams,
  refreshKey,
}: SiteAnnouncementsPageProps) {
  const { t } = useTranslation(["siteAnnouncements", "common"])
  const { siteAnnouncementNotifications } = useUserPreferencesContext()
  const {
    records,
    isLoading,
    isChecking,
    siteKey,
    setSiteKey,
    searchQuery,
    setSearchQuery,
    unreadFilter,
    setUnreadFilter,
    expandedIds,
    loadError,
    siteOptions,
    selectedStatus,
    aggregateFailedSiteCount,
    aggregateUnsupportedSiteCount,
    hasAggregateIssues,
    canRunManualCheck,
    totalCount,
    unreadCount,
    isPollingDisabled,
    hasCachedRecords,
    showNoAccountsSetup,
    showFilteredEmptyState,
    handleCheckNow,
    handleMarkRead,
    handleMarkAllRead,
    toggleExpanded,
    filteredRecords,
  } = useSiteAnnouncementsWorkspace({
    routeParams,
    refreshKey,
    pollingEnabled: siteAnnouncementNotifications.enabled,
  })

  const handleOpenPollingSettings = useCallback(() => {
    void openSettingsTab(BASIC_SETTINGS_TAB_IDS.SiteAnnouncements, {
      anchor: SETTINGS_ANCHORS.SITE_ANNOUNCEMENT_NOTIFICATIONS_ENABLED,
      preserveHistory: true,
    })
  }, [])

  const handleOpenAccountManagement = useCallback(() => {
    pushWithinOptionsPage(`#${MENU_ITEM_IDS.ACCOUNT}`)
  }, [])

  return (
    <div
      className="py-density-4 sm:py-density-6 px-4 sm:px-6"
      data-options-page-pending={isLoading ? "" : undefined}
    >
      <PageHeader
        icon={Megaphone}
        title={t("title")}
        titleActions={
          <OptionsPageSettingsTitleAction
            tabId={BASIC_SETTINGS_TAB_IDS.SiteAnnouncements}
            anchor={SETTINGS_ANCHORS.SITE_ANNOUNCEMENT_NOTIFICATIONS_ENABLED}
            label={t("actions.pollingSettings")}
          />
        }
        description={
          <>
            <span>
              {siteAnnouncementNotifications.enabled
                ? t("description.enabledSummary")
                : t("description.disabledSummary")}
            </span>{" "}
            {siteAnnouncementNotifications.enabled && (
              <>
                <span>
                  {t("description.enabledInterval", {
                    intervalMinutes:
                      siteAnnouncementNotifications.intervalMinutes,
                  })}
                </span>{" "}
              </>
            )}
            <button
              type="button"
              className={textLinkClassName}
              onClick={handleOpenPollingSettings}
            >
              {t("description.pollingSettingsLink")}
            </button>
          </>
        }
        className="mb-density-5"
        actions={
          <ProductAnalyticsScope
            entrypoint={PRODUCT_ANALYTICS_ENTRYPOINTS.Options}
            featureId={PRODUCT_ANALYTICS_FEATURE_IDS.SiteAnnouncements}
            surfaceId={
              PRODUCT_ANALYTICS_SURFACE_IDS.OptionsSiteAnnouncementsPage
            }
          >
            <Button
              size="sm"
              type="button"
              variant="outline"
              onClick={() => void handleMarkAllRead()}
              disabled={unreadCount === 0}
              leftIcon={<CheckCheck className="h-4 w-4" />}
            >
              {t("actions.markAllRead")}
            </Button>
            <Button
              size="sm"
              type="button"
              loading={isChecking}
              disabled={!canRunManualCheck}
              onClick={() =>
                void handleCheckNow(
                  PRODUCT_ANALYTICS_SURFACE_IDS.OptionsSiteAnnouncementsPage,
                )
              }
              leftIcon={<RefreshCcw className="h-4 w-4" />}
            >
              {isChecking ? t("common:status.checking") : t("actions.checkNow")}
            </Button>
          </ProductAnalyticsScope>
        }
      />

      <SiteAnnouncementsOverviewCard
        siteKey={siteKey}
        unreadFilter={unreadFilter}
        siteOptions={siteOptions}
        allSitesCount={records.length}
        totalCount={totalCount}
        unreadCount={unreadCount}
        onSiteKeyChange={setSiteKey}
        onUnreadFilterChange={setUnreadFilter}
      />

      <SiteAnnouncementsSearchBar
        value={searchQuery}
        resultCount={filteredRecords.length}
        onChange={setSearchQuery}
      />

      {siteKey === "all" && hasAggregateIssues ? (
        <Notice
          tone="warning"
          className="mb-density-4"
          title={t("status.aggregateIssuesTitle")}
          description={t("status.aggregateIssues", {
            failed: aggregateFailedSiteCount,
            unsupported: aggregateUnsupportedSiteCount,
          })}
        />
      ) : null}

      {selectedStatus && (
        <SiteAnnouncementsStatusAlert status={selectedStatus} />
      )}

      {isLoading ? (
        <EmptyState
          icon={<RefreshCcw className="h-10 w-10 animate-spin" />}
          title={t("loading")}
        />
      ) : loadError ? (
        <EmptyState
          icon={<Megaphone className="h-10 w-10" />}
          title={loadError}
          action={{
            label: t("actions.checkNow"),
            loadingLabel: t("common:status.checking"),
            onClick: () =>
              void handleCheckNow(
                PRODUCT_ANALYTICS_SURFACE_IDS.OptionsSiteAnnouncementsEmptyState,
              ),
            disabled: !canRunManualCheck,
            loading: isChecking,
            leftIcon: <RefreshCcw className="h-4 w-4" />,
          }}
        />
      ) : filteredRecords.length === 0 ? (
        <ProductAnalyticsScope
          entrypoint={PRODUCT_ANALYTICS_ENTRYPOINTS.Options}
          featureId={PRODUCT_ANALYTICS_FEATURE_IDS.SiteAnnouncements}
          surfaceId={
            PRODUCT_ANALYTICS_SURFACE_IDS.OptionsSiteAnnouncementsEmptyState
          }
        >
          <EmptyState
            icon={<Megaphone className="h-10 w-10" />}
            title={
              showNoAccountsSetup
                ? t("empty.noAccounts")
                : showFilteredEmptyState
                  ? t("empty.filtered")
                  : t("empty.title")
            }
            description={
              showNoAccountsSetup ? (
                t("empty.noAccountsDesc")
              ) : !hasCachedRecords ? (
                isPollingDisabled ? (
                  <>
                    <span>{t("empty.descriptionWhenPollingDisabled")}</span>{" "}
                    <button
                      type="button"
                      className={textLinkClassName}
                      onClick={handleOpenPollingSettings}
                    >
                      {t("empty.pollingSettingsLink")}
                    </button>
                  </>
                ) : (
                  t("empty.description")
                )
              ) : null
            }
            action={{
              label: showNoAccountsSetup
                ? t("empty.addAccount")
                : t("actions.checkNow"),
              loadingLabel: showNoAccountsSetup
                ? undefined
                : t("common:status.checking"),
              onClick: showNoAccountsSetup
                ? handleOpenAccountManagement
                : () =>
                    void handleCheckNow(
                      PRODUCT_ANALYTICS_SURFACE_IDS.OptionsSiteAnnouncementsEmptyState,
                    ),
              disabled: showNoAccountsSetup ? false : !canRunManualCheck,
              loading: showNoAccountsSetup ? false : isChecking,
              leftIcon: showNoAccountsSetup ? undefined : (
                <RefreshCcw className="h-4 w-4" />
              ),
            }}
          />
        </ProductAnalyticsScope>
      ) : (
        <SiteAnnouncementsList
          records={filteredRecords}
          expandedIds={expandedIds}
          navigationTargetId={routeParams?.recordId}
          onToggleExpanded={toggleExpanded}
          onMarkRead={handleMarkRead}
        />
      )}
    </div>
  )
}
