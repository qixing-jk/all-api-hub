import {
  OPTIONS_OVERVIEW_AUTO_CHECKIN_PANEL_STATUSES as AUTO_CHECKIN_PANEL_STATUSES,
  OPTIONS_OVERVIEW_CONFIGURATION_STATUSES as CONFIGURATION_STATUSES,
  OPTIONS_OVERVIEW_SEVERITIES,
} from "~/features/OptionsOverview/ids"
import type {
  OptionsOverviewActionCenterItem,
  OptionsOverviewAttentionItem,
  OptionsOverviewAutoCheckinPanel,
  OptionsOverviewSeverity,
} from "~/features/OptionsOverview/types"

export const OVERVIEW_NEUTRAL_PANEL_CLASSES =
  "border-border/80 bg-card/90 dark:border-foreground/10 dark:bg-foreground/[0.03]"

export const OVERVIEW_SEVERITY_BADGE_VARIANTS = {
  [OPTIONS_OVERVIEW_SEVERITIES.Success]: "success",
  [OPTIONS_OVERVIEW_SEVERITIES.Warning]: "warning",
  [OPTIONS_OVERVIEW_SEVERITIES.Info]: "info",
  [OPTIONS_OVERVIEW_SEVERITIES.Error]: "danger",
} as const satisfies Record<OptionsOverviewSeverity, string>

export const OVERVIEW_ATTENTION_BADGE_VARIANTS = {
  [OPTIONS_OVERVIEW_SEVERITIES.Error]: "danger",
  [OPTIONS_OVERVIEW_SEVERITIES.Warning]: "warning",
  [OPTIONS_OVERVIEW_SEVERITIES.Info]: "info",
} as const satisfies Record<OptionsOverviewAttentionItem["severity"], string>

export const OVERVIEW_SEVERITY_INDICATOR_CLASSES = {
  [OPTIONS_OVERVIEW_SEVERITIES.Error]: "bg-destructive-indicator",
  [OPTIONS_OVERVIEW_SEVERITIES.Warning]: "bg-warning-indicator",
  [OPTIONS_OVERVIEW_SEVERITIES.Info]: "bg-info-indicator",
  [OPTIONS_OVERVIEW_SEVERITIES.Success]: "bg-success-indicator",
} as const satisfies Record<OptionsOverviewSeverity, string>

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
  [AUTO_CHECKIN_PANEL_STATUSES.skipped]: "secondary",
  [AUTO_CHECKIN_PANEL_STATUSES.disabled]: "secondary",
  [AUTO_CHECKIN_PANEL_STATUSES.notRun]: "info",
} as const satisfies Record<OptionsOverviewAutoCheckinPanel["status"], string>
