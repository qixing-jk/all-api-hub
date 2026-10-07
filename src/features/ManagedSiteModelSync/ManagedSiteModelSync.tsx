import { RefreshCcw } from "lucide-react"
import { useTranslation } from "react-i18next"

import ManagedSiteConfigRequiredState from "~/components/ManagedSiteConfigRequiredState"
import ManagedSiteTypeSwitcher from "~/components/ManagedSiteTypeSwitcher"
import { OptionsPageSettingsTitleAction } from "~/components/OptionsPageSettingsTitleAction"
import { PageHeader } from "~/components/PageHeader"
import { EmptyState } from "~/components/ui"
import { BASIC_SETTINGS_TAB_IDS } from "~/constants/basicSettingsTabs"
import { SETTINGS_ANCHORS } from "~/constants/settingsAnchors"
import LoadingSkeleton from "~/features/ManagedSiteModelSync/components/LoadingSkeleton"
import OverviewCard from "~/features/ManagedSiteModelSync/components/OverviewCard"
import ProgressCard from "~/features/ManagedSiteModelSync/components/ProgressCard"
import StatisticsCard from "~/features/ManagedSiteModelSync/components/StatisticsCard"
import {
  getManagedSiteConfigMissingMessage,
  getManagedSiteMessagesKeyFromSiteType,
  getManagedSiteUnsupportedModelSyncMessage,
} from "~/services/managedSites/utils/managedSite"
import { PRODUCT_ANALYTICS_ACTION_IDS } from "~/services/productAnalytics/contracts"
import { openSettingsTab } from "~/utils/navigation"

import { ManagedSiteModelSyncTabs } from "./components/ManagedSiteModelSyncTabs"
import type { ManagedSiteModelSyncProps } from "./contracts"
import { useManagedSiteModelSyncViewModel } from "./hooks/useManagedSiteModelSyncViewModel"
import { actionBarAnalyticsScope } from "./modelSyncAnalytics"

/** Render status and workspaces for the selected managed-site target. */
export default function ManagedSiteModelSync(props: ManagedSiteModelSyncProps) {
  const { t } = useTranslation([
    "managedSiteModelSync",
    "settings",
    "messages",
    "common",
  ])
  const model = useManagedSiteModelSyncViewModel(props)
  const {
    isInitialLoading,
    isConfigMissing,
    isModelSyncUnsupported,
    managedSiteType,
    isAutoSyncEnabled,
    intervalMs,
    nextScheduledAt,
    progress,
    lastExecution,
  } = model
  if (!isConfigMissing && isInitialLoading) return <LoadingSkeleton />
  return (
    <div className="py-density-4 sm:py-density-6 px-4 sm:px-6">
      <PageHeader
        icon={RefreshCcw}
        title={t("execution.title")}
        titleActions={
          <OptionsPageSettingsTitleAction
            tabId={BASIC_SETTINGS_TAB_IDS.ManagedSite}
            anchor={SETTINGS_ANCHORS.MANAGED_SITE_MODEL_SYNC}
          />
        }
        description={t("description")}
        actions={
          <ManagedSiteTypeSwitcher
            ariaLabel={t("settings:managedSite.siteTypeLabel")}
            hideWhenSingleOption
            size="sm"
            triggerClassName="w-auto min-w-[172px]"
          />
        }
        spacing="compact"
      />

      {!isModelSyncUnsupported && !isConfigMissing ? (
        <p className="text-muted-foreground mb-density-6 text-sm leading-6">
          {t("managedSiteModelSync:optionalGuidance.description")}
        </p>
      ) : null}

      {isModelSyncUnsupported ? (
        <EmptyState
          className="mt-density-6"
          icon={<RefreshCcw className="text-faint-foreground h-12 w-12" />}
          title={t("managedSiteModelSync:execution.unsupported.title")}
          description={getManagedSiteUnsupportedModelSyncMessage(
            t,
            managedSiteType,
          )}
        />
      ) : isConfigMissing ? (
        <ManagedSiteConfigRequiredState
          description={getManagedSiteConfigMissingMessage(
            t,
            getManagedSiteMessagesKeyFromSiteType(managedSiteType),
          )}
          className="mt-density-6"
        />
      ) : (
        <>
          <div className="mb-density-6">
            <OverviewCard
              enabled={isAutoSyncEnabled}
              intervalMs={intervalMs}
              nextScheduledAt={nextScheduledAt}
              lastRunAt={lastExecution?.statistics?.endedAt ?? null}
              configureAutoSyncAnalyticsAction={{
                ...actionBarAnalyticsScope,
                actionId:
                  PRODUCT_ANALYTICS_ACTION_IDS.OpenManagedSiteModelSyncSettings,
              }}
              onConfigureAutoSync={() => {
                void openSettingsTab(BASIC_SETTINGS_TAB_IDS.ManagedSite, {
                  preserveHistory: true,
                  anchor: SETTINGS_ANCHORS.MANAGED_SITE_MODEL_SYNC,
                })
              }}
            />
          </div>

          {progress?.isRunning && (
            <div className="mb-density-6">
              <ProgressCard progress={progress} />
            </div>
          )}

          {lastExecution?.statistics && (
            <div className="mb-density-6">
              <StatisticsCard statistics={lastExecution.statistics} />
            </div>
          )}

          <ManagedSiteModelSyncTabs model={model} />
        </>
      )}
    </div>
  )
}
