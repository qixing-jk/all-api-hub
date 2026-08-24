import { CircleAlert, ClipboardCheck, ListChecks } from "lucide-react"
import { useState, type ReactNode } from "react"
import { useTranslation } from "react-i18next"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui"
import { countAutoCheckinResults } from "~/features/AutoCheckin/utils/autoCheckin"
import {
  getAutoCheckinSnapshotReadinessCategory,
  SNAPSHOT_READINESS_FILTER,
} from "~/features/AutoCheckin/utils/snapshotFilters"
import { cn } from "~/lib/utils"
import { trackProductAnalyticsActionCompleted } from "~/services/productAnalytics/actions"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_MODE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
  PRODUCT_ANALYTICS_TARGET_KINDS,
} from "~/services/productAnalytics/contracts"
import type {
  AutoCheckinAccountSnapshot,
  CheckinAccountResult,
} from "~/types/autoCheckin"

const AUTO_CHECKIN_DATA_VIEW = {
  Results: "results",
  Readiness: "readiness",
} as const

const DATA_VIEW_TRIGGER_CLASS_NAME =
  "flex min-h-10 min-w-0 items-center justify-center gap-2 rounded-md px-2.5 py-1.5 text-sm font-medium text-gray-600 transition-colors hover:text-gray-900 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 focus-visible:outline-none data-[state=active]:bg-white data-[state=active]:font-semibold data-[state=active]:text-gray-950 data-[state=active]:shadow-sm sm:flex-none sm:px-3 dark:text-gray-400 dark:hover:text-gray-100 dark:data-[state=active]:bg-gray-800 dark:data-[state=active]:text-gray-50"

interface WorkspaceTabCountProps {
  attentionCount: number
  totalCount: number
  attentionLabel: string
  totalLabel: string
  attentionClassName: string
}

/** Displays a compact total, prioritizing the count that needs attention. */
function WorkspaceTabCount({
  attentionCount,
  totalCount,
  attentionLabel,
  totalLabel,
  attentionClassName,
}: WorkspaceTabCountProps) {
  const hasAttention = attentionCount > 0

  return (
    <span
      aria-label={hasAttention ? attentionLabel : totalLabel}
      className={cn(
        "shrink-0 rounded-full px-2 py-0.5 text-xs",
        hasAttention
          ? attentionClassName
          : "bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-200",
      )}
    >
      {hasAttention ? attentionCount : totalCount}
    </span>
  )
}

interface AutoCheckinDataWorkspaceProps {
  hasHistory: boolean
  results: CheckinAccountResult[]
  snapshots: AutoCheckinAccountSnapshot[]
  resultsContent: ReactNode
  readinessContent: ReactNode
}

/** Keeps execution history and readiness equally discoverable without stacking two long tables. */
export default function AutoCheckinDataWorkspace({
  hasHistory,
  results,
  snapshots,
  resultsContent,
  readinessContent,
}: AutoCheckinDataWorkspaceProps) {
  const { t } = useTranslation("autoCheckin")
  const [activeView, setActiveView] = useState(
    hasHistory
      ? AUTO_CHECKIN_DATA_VIEW.Results
      : AUTO_CHECKIN_DATA_VIEW.Readiness,
  )
  const { failed: failedCount } = countAutoCheckinResults(results)
  const setupRequiredCount = snapshots.filter(
    (snapshot) =>
      getAutoCheckinSnapshotReadinessCategory(snapshot) ===
      SNAPSHOT_READINESS_FILTER.SETUP_REQUIRED,
  ).length
  const handleViewChange = (nextView: string) => {
    const isResultsView = nextView === AUTO_CHECKIN_DATA_VIEW.Results
    setActiveView(
      isResultsView
        ? AUTO_CHECKIN_DATA_VIEW.Results
        : AUTO_CHECKIN_DATA_VIEW.Readiness,
    )
    void trackProductAnalyticsActionCompleted({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.AutoCheckin,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.SelectAutoCheckinDataView,
      surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAutoCheckinDataWorkspace,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
      result: PRODUCT_ANALYTICS_RESULTS.Success,
      insights: {
        targetKind: PRODUCT_ANALYTICS_TARGET_KINDS.AutoCheckinDataView,
        mode: isResultsView
          ? PRODUCT_ANALYTICS_MODE_IDS.AutoCheckinResultsView
          : PRODUCT_ANALYTICS_MODE_IDS.AutoCheckinReadinessView,
        resultCount: isResultsView ? results.length : snapshots.length,
      },
    })
  }

  return (
    <section aria-label={t("workspace.label")} className="space-y-3">
      <Tabs value={activeView} onValueChange={handleViewChange}>
        <TabsList className="grid w-full grid-cols-2 gap-1 rounded-lg bg-gray-100 p-1 sm:inline-flex sm:w-auto dark:bg-gray-900">
          <TabsTrigger
            value={AUTO_CHECKIN_DATA_VIEW.Results}
            className={DATA_VIEW_TRIGGER_CLASS_NAME}
          >
            <ListChecks className="h-4 w-4 shrink-0" />
            <span className="min-w-0 leading-tight">
              {t("workspace.resultsTab")}
            </span>
            <WorkspaceTabCount
              attentionCount={failedCount}
              totalCount={results.length}
              attentionLabel={`${t("execution.status.failed")}: ${failedCount}`}
              totalLabel={t("execution.filters.countTotal", {
                total: results.length,
              })}
              attentionClassName="bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-200"
            />
          </TabsTrigger>
          <TabsTrigger
            value={AUTO_CHECKIN_DATA_VIEW.Readiness}
            className={DATA_VIEW_TRIGGER_CLASS_NAME}
          >
            {setupRequiredCount > 0 ? (
              <CircleAlert className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-300" />
            ) : (
              <ClipboardCheck className="h-4 w-4 shrink-0" />
            )}
            <span className="min-w-0 leading-tight">{t("snapshot.title")}</span>
            <WorkspaceTabCount
              attentionCount={setupRequiredCount}
              totalCount={snapshots.length}
              attentionLabel={`${t("snapshot.filters.readinessSetupRequired")}: ${setupRequiredCount}`}
              totalLabel={t("snapshot.filters.countTotal", {
                total: snapshots.length,
              })}
              attentionClassName="bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-100"
            />
          </TabsTrigger>
        </TabsList>

        <TabsContent
          value={AUTO_CHECKIN_DATA_VIEW.Results}
          forceMount
          hidden={activeView !== AUTO_CHECKIN_DATA_VIEW.Results}
          className="mt-3 data-[state=inactive]:hidden"
        >
          {resultsContent}
        </TabsContent>
        <TabsContent
          value={AUTO_CHECKIN_DATA_VIEW.Readiness}
          forceMount
          hidden={activeView !== AUTO_CHECKIN_DATA_VIEW.Readiness}
          className="mt-3 space-y-3 data-[state=inactive]:hidden"
        >
          <p className="px-1 text-sm text-gray-500 dark:text-gray-400">
            {t("snapshot.description")}
          </p>
          {readinessContent}
        </TabsContent>
      </Tabs>
    </section>
  )
}
