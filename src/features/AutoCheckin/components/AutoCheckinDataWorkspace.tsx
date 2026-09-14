import { CircleAlert, ClipboardCheck, ListChecks } from "lucide-react"
import { useState, type ReactNode } from "react"
import { useTranslation } from "react-i18next"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui"
import { CORNERS } from "~/constants/designTokens"
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
  "flex min-h-10 min-w-0 items-center justify-center gap-2 rounded-md px-2.5 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:outline-none data-[state=active]:bg-card data-[state=active]:font-semibold data-[state=active]:text-foreground data-[state=active]:shadow-sm sm:flex-none sm:px-3"

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
          : "bg-secondary text-muted-foreground dark:text-secondary-foreground",
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
  const {
    failed: failedCount,
    uncertain: uncertainCount,
    skipped: skippedCount,
  } = countAutoCheckinResults(results)
  const attentionCount = failedCount + uncertainCount + skippedCount
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
        <TabsList
          className={`corners-concentric bg-muted dark:bg-background grid w-full grid-cols-2 gap-1 rounded-lg p-1 [--corner-inset:4px] sm:inline-flex sm:w-auto ${CORNERS.buttonItems}`}
        >
          <TabsTrigger
            value={AUTO_CHECKIN_DATA_VIEW.Results}
            className={DATA_VIEW_TRIGGER_CLASS_NAME}
          >
            <ListChecks className="h-4 w-4 shrink-0" />
            <span className="min-w-0 leading-tight">
              {t("workspace.resultsTab")}
            </span>
            <WorkspaceTabCount
              attentionCount={attentionCount}
              totalCount={results.length}
              attentionLabel={`${t("execution.filters.needsAttention")}: ${attentionCount}`}
              totalLabel={t("execution.filters.countTotal", {
                total: results.length,
              })}
              attentionClassName="bg-destructive-soft text-destructive-soft-foreground"
            />
          </TabsTrigger>
          <TabsTrigger
            value={AUTO_CHECKIN_DATA_VIEW.Readiness}
            className={DATA_VIEW_TRIGGER_CLASS_NAME}
          >
            {setupRequiredCount > 0 ? (
              <CircleAlert className="text-warning-text h-4 w-4 shrink-0" />
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
              attentionClassName="bg-warning-soft text-warning-soft-foreground"
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
          <p className="text-muted-foreground px-1 text-sm">
            {t("snapshot.description")}
          </p>
          {readinessContent}
        </TabsContent>
      </Tabs>
    </section>
  )
}
