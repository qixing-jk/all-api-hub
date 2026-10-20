import { OPTIONS_OVERVIEW_AUTOMATION_STATUS_LABELS as STATUS_LABELS } from "~/features/OptionsOverview/ids"
import type {
  OptionsOverviewAutomationItem,
  OptionsOverviewAutomationStatusLabel,
  OptionsOverviewSeverity,
} from "~/features/OptionsOverview/types"

const severityByStatus = {
  [STATUS_LABELS.ready]: "success",
  [STATUS_LABELS.success]: "success",
  [STATUS_LABELS.partial]: "warning",
  [STATUS_LABELS.failed]: "error",
  [STATUS_LABELS.skipped]: "info",
  [STATUS_LABELS.notRun]: "info",
  [STATUS_LABELS.running]: "info",
  [STATUS_LABELS.unknown]: "info",
  [STATUS_LABELS.unsupported]: "info",
  [STATUS_LABELS.limited]: "warning",
  [STATUS_LABELS.disabled]: "info",
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
