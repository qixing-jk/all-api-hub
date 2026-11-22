import {
  OPTIONS_OVERVIEW_SEVERITIES,
  OPTIONS_OVERVIEW_AUTOMATION_STATUS_LABELS as STATUS_LABELS,
} from "~/features/OptionsOverview/ids"
import type {
  OptionsOverviewAutomationItem,
  OptionsOverviewAutomationStatusLabel,
  OptionsOverviewSeverity,
} from "~/features/OptionsOverview/types"

const severityByStatus = {
  [STATUS_LABELS.ready]: OPTIONS_OVERVIEW_SEVERITIES.Success,
  [STATUS_LABELS.success]: OPTIONS_OVERVIEW_SEVERITIES.Success,
  [STATUS_LABELS.partial]: OPTIONS_OVERVIEW_SEVERITIES.Warning,
  [STATUS_LABELS.failed]: OPTIONS_OVERVIEW_SEVERITIES.Error,
  [STATUS_LABELS.skipped]: OPTIONS_OVERVIEW_SEVERITIES.Info,
  [STATUS_LABELS.notRun]: OPTIONS_OVERVIEW_SEVERITIES.Info,
  [STATUS_LABELS.running]: OPTIONS_OVERVIEW_SEVERITIES.Info,
  [STATUS_LABELS.unknown]: OPTIONS_OVERVIEW_SEVERITIES.Info,
  [STATUS_LABELS.unsupported]: OPTIONS_OVERVIEW_SEVERITIES.Info,
  [STATUS_LABELS.limited]: OPTIONS_OVERVIEW_SEVERITIES.Warning,
  [STATUS_LABELS.disabled]: OPTIONS_OVERVIEW_SEVERITIES.Info,
} as const satisfies Record<
  OptionsOverviewAutomationStatusLabel,
  OptionsOverviewSeverity
>

/** Keeps the badge's wording and color tied to the same operational state. */
export function resolveAutomationState(
  enabled: boolean | undefined,
  runStatus: OptionsOverviewAutomationStatusLabel,
): Pick<OptionsOverviewAutomationItem, "status" | "statusLabel" | "enabled"> {
  const statusLabel =
    enabled === false
      ? STATUS_LABELS.disabled
      : enabled === undefined
        ? STATUS_LABELS.unknown
        : runStatus
  return { enabled, statusLabel, status: severityByStatus[statusLabel] }
}
