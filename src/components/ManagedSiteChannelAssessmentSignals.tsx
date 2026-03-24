import { useTranslation } from "react-i18next"

import {
  getKeySignalLabel,
  getKeySignalTooltip,
  getModelsSignalLabel,
  getModelsSignalTooltip,
  getSignalBadgeVariant,
  getUrlSignalLabel,
  getUrlSignalTooltip,
  SignalBadge,
  type ManagedSiteChannelAssessmentSignals,
  type ManagedSiteType,
} from "~/components/ManagedSiteChannelAssessmentSignalHelpers"
import { cn } from "~/lib/utils"

/**
 * Reusable signal badge row showing URL / key / models matching status using
 * the same wording as Key Management.
 */
export function ManagedSiteChannelAssessmentSignalsRow(props: {
  assessment: ManagedSiteChannelAssessmentSignals
  managedSiteType: ManagedSiteType
  className?: string
}) {
  const { t } = useTranslation("keyManagement")

  return (
    <div className={cn("flex flex-wrap items-center gap-2", props.className)}>
      <SignalBadge
        badgeText={getUrlSignalLabel(t, props.assessment)}
        tooltipText={getUrlSignalTooltip(t, props.assessment)}
        variant={getSignalBadgeVariant({
          assessment: props.assessment,
          signal: "url",
        })}
      />
      <SignalBadge
        badgeText={getKeySignalLabel(t, props.assessment)}
        tooltipText={getKeySignalTooltip(
          t,
          props.managedSiteType,
          props.assessment,
        )}
        variant={getSignalBadgeVariant({
          assessment: props.assessment,
          signal: "key",
        })}
      />
      <SignalBadge
        badgeText={getModelsSignalLabel(t, props.assessment)}
        tooltipText={getModelsSignalTooltip(t, props.assessment)}
        variant={getSignalBadgeVariant({
          assessment: props.assessment,
          signal: "models",
        })}
      />
    </div>
  )
}
