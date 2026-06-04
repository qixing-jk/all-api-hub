import type { TFunction } from "i18next"
import type { ReactNode } from "react"

import { OPTIONS_OVERVIEW_WIDGET_IDS } from "../ids"
import { OVERVIEW_WIDGET_LAYOUT } from "../layout"
import { OPTIONS_OVERVIEW_TEST_IDS } from "../testIds"
import type {
  OptionsOverviewNavigationIntent,
  OptionsOverviewNavigationTarget,
  OptionsOverviewViewModel,
  OptionsOverviewWidgetId,
  OptionsOverviewWidgetLayoutItem,
} from "../types"
import { getOverviewSectionTitle } from "./gridText"
import { OverviewActionCenter } from "./OverviewActionCenter"
import { OverviewAttentionList } from "./OverviewAttentionList"
import { OverviewAutomationPanel } from "./OverviewAutomationPanel"
import { OverviewStatusSummary } from "./OverviewStatusCard"
import { OverviewUsageSnapshot } from "./OverviewUsageSnapshot"

interface OptionsOverviewGridProps {
  viewModel: OptionsOverviewViewModel
  t: TFunction
  onNavigate: (intent: OptionsOverviewNavigationIntent) => void
}

const columnSpanClass: Record<
  OptionsOverviewWidgetLayoutItem["columnSpan"],
  string
> = {
  1: "flex h-full min-h-0 flex-col xl:col-span-1",
  2: "flex h-full min-h-0 flex-col xl:col-span-2",
  3: "flex h-full min-h-0 flex-col xl:col-span-3",
}

/**
 * Owns the static overview widget layout and keeps the page shell thin.
 */
export function OptionsOverviewGrid({
  viewModel,
  t,
  onNavigate,
}: OptionsOverviewGridProps) {
  return (
    <div className="grid grid-cols-1 items-stretch gap-6 xl:grid-cols-3">
      {OVERVIEW_WIDGET_LAYOUT.map((item) => (
        <section key={item.id} className={columnSpanClass[item.columnSpan]}>
          {item.id === OPTIONS_OVERVIEW_WIDGET_IDS.statusSummary ? null : (
            <h3 className="dark:text-dark-text-secondary mb-3 text-xs font-semibold text-gray-500 uppercase">
              {getOverviewSectionTitle(item.id, t)}
            </h3>
          )}
          {renderWidget(item.id, viewModel, t, onNavigate)}
        </section>
      ))}
    </div>
  )
}

/**
 * Dispatches each static layout slot to its matching overview widget.
 */
function renderWidget(
  id: OptionsOverviewWidgetId,
  viewModel: OptionsOverviewViewModel,
  t: TFunction,
  onNavigate: (intent: OptionsOverviewNavigationIntent) => void,
) {
  const navigateFromWidget = (target: OptionsOverviewNavigationTarget) => {
    onNavigate({ target, sourceWidgetId: id })
  }

  switch (id) {
    case OPTIONS_OVERVIEW_WIDGET_IDS.statusSummary:
      return (
        <OverviewStatusSummary
          items={viewModel.statusCards}
          t={t}
          onNavigate={navigateFromWidget}
          data-testid={OPTIONS_OVERVIEW_TEST_IDS.statusSummary}
        />
      )
    case OPTIONS_OVERVIEW_WIDGET_IDS.needsAttention:
      return (
        <WidgetBody testId={OPTIONS_OVERVIEW_TEST_IDS.needsAttention}>
          <OverviewAttentionList
            items={viewModel.attentionItems}
            t={t}
            onNavigate={navigateFromWidget}
          />
        </WidgetBody>
      )
    case OPTIONS_OVERVIEW_WIDGET_IDS.automationOverview:
      return (
        <WidgetBody testId={OPTIONS_OVERVIEW_TEST_IDS.automationOverview}>
          <OverviewAutomationPanel
            overview={viewModel.automationOverview}
            t={t}
            onNavigate={navigateFromWidget}
          />
        </WidgetBody>
      )
    case OPTIONS_OVERVIEW_WIDGET_IDS.recentUsage:
      return (
        <WidgetBody testId={OPTIONS_OVERVIEW_TEST_IDS.recentUsage}>
          <OverviewUsageSnapshot
            snapshot={viewModel.usageSnapshot}
            t={t}
            onNavigate={navigateFromWidget}
          />
        </WidgetBody>
      )
    case OPTIONS_OVERVIEW_WIDGET_IDS.actionCenter:
      return (
        <WidgetBody testId={OPTIONS_OVERVIEW_TEST_IDS.actionCenter}>
          <OverviewActionCenter
            items={viewModel.configurationOverviewItems}
            t={t}
            onNavigate={navigateFromWidget}
          />
        </WidgetBody>
      )
  }
}

/**
 * Provides the shared flex wrapper for overview widgets that need stretchable bodies.
 */
function WidgetBody({
  testId,
  children,
}: {
  testId: string
  children: ReactNode
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid={testId}>
      {children}
    </div>
  )
}
