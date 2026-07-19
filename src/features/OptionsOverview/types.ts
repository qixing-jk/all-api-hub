import type { OptionsMenuItemId } from "~/constants/optionsMenuIds"
import type { AccountMetricCoverage } from "~/types"

import type {
  OPTIONS_OVERVIEW_ACTION_CENTER_ITEM_IDS,
  OPTIONS_OVERVIEW_ATTENTION_KINDS,
  OPTIONS_OVERVIEW_AUTO_CHECKIN_ACTION_IDS,
  OPTIONS_OVERVIEW_AUTO_CHECKIN_PANEL_STATUSES,
  OPTIONS_OVERVIEW_AUTOMATION_ACTION_IDS,
  OPTIONS_OVERVIEW_AUTOMATION_ITEM_IDS,
  OPTIONS_OVERVIEW_AUTOMATION_STATUS_LABELS,
  OPTIONS_OVERVIEW_AUTOMATION_SUMMARY_ROW_IDS,
  OPTIONS_OVERVIEW_AUTOMATION_SUMMARY_VALUE_TYPES,
  OPTIONS_OVERVIEW_CONFIGURATION_STATUSES,
  OPTIONS_OVERVIEW_CONFIGURATION_SUB_ITEM_IDS,
  OPTIONS_OVERVIEW_STATUS_CARD_IDS,
  OPTIONS_OVERVIEW_WIDGET_IDS,
} from "./ids"

type ValueOf<T> = T[keyof T]

export type OptionsOverviewSeverity = "error" | "warning" | "info" | "success"

export type OptionsOverviewWidgetId = ValueOf<
  typeof OPTIONS_OVERVIEW_WIDGET_IDS
>

export interface OptionsOverviewWidgetLayoutItem {
  id: OptionsOverviewWidgetId
  columnSpan: 1 | 2 | 3
  persisted: false
}

export interface OptionsOverviewNavigationTarget {
  menuItemId: OptionsMenuItemId
  params?: Record<string, string | undefined>
}

export interface OptionsOverviewNavigationIntent {
  target: OptionsOverviewNavigationTarget
  sourceWidgetId: OptionsOverviewWidgetId
}

export interface OptionsOverviewStatusCard {
  id: ValueOf<typeof OPTIONS_OVERVIEW_STATUS_CARD_IDS>
  value: string
  severity: OptionsOverviewSeverity
  target?: OptionsOverviewNavigationTarget
  coverage?: AccountMetricCoverage
}

export type OptionsOverviewAttentionKind = ValueOf<
  typeof OPTIONS_OVERVIEW_ATTENTION_KINDS
>

export type OptionsOverviewConfigurationStatus = ValueOf<
  typeof OPTIONS_OVERVIEW_CONFIGURATION_STATUSES
>

export interface OptionsOverviewAttentionItem {
  id: string
  kind: OptionsOverviewAttentionKind
  severity: Exclude<OptionsOverviewSeverity, "success">
  titleOptions?: Record<string, unknown>
  descriptionOptions?: Record<string, unknown>
  target: OptionsOverviewNavigationTarget
}

export interface OptionsOverviewUsageSnapshot {
  todayRequests: number
  todayTokens: number
  todayCostText: string
  todayRequestsCoverage: AccountMetricCoverage
  todayTokensCoverage: AccountMetricCoverage
  todayCostCoverage: AccountMetricCoverage
  sevenDayRequests: number
  sevenDayTokens: number
  hasTodayUsageData: boolean
  hasSevenDayUsageData: boolean
  hasUsageData: boolean
  target: OptionsOverviewNavigationTarget
}

export interface OptionsOverviewActionCenterItem {
  id: ValueOf<typeof OPTIONS_OVERVIEW_ACTION_CENTER_ITEM_IDS>
  status: OptionsOverviewConfigurationStatus
  subItems: OptionsOverviewConfigurationSubItem[]
  isVisible: boolean
}

export interface OptionsOverviewConfigurationSubItem {
  id: ValueOf<typeof OPTIONS_OVERVIEW_CONFIGURATION_SUB_ITEM_IDS>
  status: OptionsOverviewConfigurationStatus
  target: OptionsOverviewNavigationTarget
}

export interface OptionsOverviewAutoCheckinAction {
  id: ValueOf<typeof OPTIONS_OVERVIEW_AUTO_CHECKIN_ACTION_IDS>
  target: OptionsOverviewNavigationTarget
  isVisible: boolean
}

export type OptionsOverviewAutoCheckinPanelStatus = ValueOf<
  typeof OPTIONS_OVERVIEW_AUTO_CHECKIN_PANEL_STATUSES
>

export interface OptionsOverviewAutoCheckinPanel {
  status: OptionsOverviewAutoCheckinPanelStatus
  severity: OptionsOverviewSeverity
  totalEligible: number
  executed: number
  successCount: number
  failedCount: number
  skippedCount: number
  needsRetry: boolean
  lastRunAt?: string
  nextRunAt?: string
  nextRetryAt?: string
  actions: OptionsOverviewAutoCheckinAction[]
}

export type OptionsOverviewAutomationSummaryRowId = ValueOf<
  typeof OPTIONS_OVERVIEW_AUTOMATION_SUMMARY_ROW_IDS
>

export interface OptionsOverviewAutomationSummaryRow {
  id: OptionsOverviewAutomationSummaryRowId
  value: string
  valueType?: ValueOf<typeof OPTIONS_OVERVIEW_AUTOMATION_SUMMARY_VALUE_TYPES>
}

export type OptionsOverviewAutomationActionId =
  | ValueOf<typeof OPTIONS_OVERVIEW_AUTO_CHECKIN_ACTION_IDS>
  | ValueOf<typeof OPTIONS_OVERVIEW_AUTOMATION_ACTION_IDS>

export interface OptionsOverviewAutomationAction {
  id: OptionsOverviewAutomationActionId
  target: OptionsOverviewNavigationTarget
  variant?: "default" | "outline"
}

export type OptionsOverviewAutomationStatusLabel = ValueOf<
  typeof OPTIONS_OVERVIEW_AUTOMATION_STATUS_LABELS
>

export interface OptionsOverviewAutomationItem {
  id: ValueOf<typeof OPTIONS_OVERVIEW_AUTOMATION_ITEM_IDS>
  status: Exclude<OptionsOverviewSeverity, "error"> | "error"
  statusLabel: OptionsOverviewAutomationStatusLabel
  primaryTarget: OptionsOverviewNavigationTarget
  summaryRows: OptionsOverviewAutomationSummaryRow[]
  actions: OptionsOverviewAutomationAction[]
  defaultExpanded: boolean
  autoCheckinPanel?: OptionsOverviewAutoCheckinPanel
}

export interface OptionsOverviewAutomationOverview {
  items: OptionsOverviewAutomationItem[]
}

export interface OptionsOverviewViewModel {
  statusCards: OptionsOverviewStatusCard[]
  attentionItems: OptionsOverviewAttentionItem[]
  autoCheckinPanel: OptionsOverviewAutoCheckinPanel
  automationOverview: OptionsOverviewAutomationOverview
  usageSnapshot: OptionsOverviewUsageSnapshot
  configurationOverviewItems: OptionsOverviewActionCenterItem[]
}
