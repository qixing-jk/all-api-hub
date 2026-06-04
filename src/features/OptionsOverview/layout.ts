import { OPTIONS_OVERVIEW_WIDGET_IDS } from "./ids"
import type { OptionsOverviewWidgetLayoutItem } from "./types"

export const OVERVIEW_WIDGET_LAYOUT: OptionsOverviewWidgetLayoutItem[] = [
  {
    id: OPTIONS_OVERVIEW_WIDGET_IDS.statusSummary,
    columnSpan: 3,
    persisted: false,
  },
  {
    id: OPTIONS_OVERVIEW_WIDGET_IDS.needsAttention,
    columnSpan: 2,
    persisted: false,
  },
  {
    id: OPTIONS_OVERVIEW_WIDGET_IDS.automationOverview,
    columnSpan: 1,
    persisted: false,
  },
  {
    id: OPTIONS_OVERVIEW_WIDGET_IDS.recentUsage,
    columnSpan: 3,
    persisted: false,
  },
  {
    id: OPTIONS_OVERVIEW_WIDGET_IDS.actionCenter,
    columnSpan: 3,
    persisted: false,
  },
]
