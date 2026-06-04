import {
  OPTIONS_OVERVIEW_AUTO_CHECKIN_PANEL_STATUSES as AUTO_CHECKIN_PANEL_STATUSES,
  OPTIONS_OVERVIEW_CONFIGURATION_STATUSES as CONFIGURATION_STATUSES,
} from "../ids"
import type {
  OptionsOverviewActionCenterItem,
  OptionsOverviewAttentionItem,
  OptionsOverviewAutoCheckinPanel,
  OptionsOverviewSeverity,
} from "../types"

export const OVERVIEW_NEUTRAL_PANEL_CLASSES =
  "border-slate-200/80 bg-white/90 dark:border-white/10 dark:bg-white/[0.03]"

export const OVERVIEW_SEVERITY_BADGE_VARIANTS = {
  success: "success",
  warning: "warning",
  info: "info",
  error: "danger",
} as const satisfies Record<OptionsOverviewSeverity, string>

export const OVERVIEW_ATTENTION_BADGE_VARIANTS = {
  error: "danger",
  warning: "warning",
  info: "info",
} as const satisfies Record<OptionsOverviewAttentionItem["severity"], string>

export const OVERVIEW_CONFIGURATION_BADGE_VARIANTS = {
  [CONFIGURATION_STATUSES.configured]: "success",
  [CONFIGURATION_STATUSES.disabled]: "secondary",
  [CONFIGURATION_STATUSES.needsSetup]: "warning",
  [CONFIGURATION_STATUSES.notApplicable]: "outline",
} as const satisfies Record<OptionsOverviewActionCenterItem["status"], string>

export const AUTO_CHECKIN_STATUS_BADGE_VARIANTS = {
  [AUTO_CHECKIN_PANEL_STATUSES.ready]: "success",
  [AUTO_CHECKIN_PANEL_STATUSES.success]: "success",
  [AUTO_CHECKIN_PANEL_STATUSES.partial]: "warning",
  [AUTO_CHECKIN_PANEL_STATUSES.failed]: "danger",
  [AUTO_CHECKIN_PANEL_STATUSES.disabled]: "secondary",
  [AUTO_CHECKIN_PANEL_STATUSES.notRun]: "info",
} as const satisfies Record<OptionsOverviewAutoCheckinPanel["status"], string>
