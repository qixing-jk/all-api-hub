import { useTranslation } from "react-i18next"

import Tooltip from "~/components/Tooltip"
import { Badge } from "~/components/ui"
import { NEW_API, type ManagedSiteType } from "~/constants/siteType"
import { cn } from "~/lib/utils"
import type { ManagedSiteChannelAssessmentSignals } from "~/services/managedSites/channelAssessmentSignals"
import {
  MANAGED_SITE_CHANNEL_KEY_MATCH_REASONS,
  MANAGED_SITE_CHANNEL_MODELS_MATCH_REASONS,
} from "~/services/managedSites/channelMatch"

const getSignalBadgeVariant = (params: {
  assessment: ManagedSiteChannelAssessmentSignals
  signal: "url" | "key" | "models"
}) => {
  if (params.signal === "url") {
    return params.assessment.url.matched
      ? ("success" as const)
      : ("outline" as const)
  }

  if (params.signal === "key") {
    if (params.assessment.key.matched) {
      return "success" as const
    }

    if (
      params.assessment.key.reason ===
        MANAGED_SITE_CHANNEL_KEY_MATCH_REASONS.NO_KEY_PROVIDED ||
      params.assessment.key.reason ===
        MANAGED_SITE_CHANNEL_KEY_MATCH_REASONS.COMPARISON_UNAVAILABLE
    ) {
      return "warning" as const
    }

    return "outline" as const
  }

  if (params.assessment.models.matched) {
    return params.assessment.models.reason ===
      MANAGED_SITE_CHANNEL_MODELS_MATCH_REASONS.EXACT
      ? ("success" as const)
      : ("info" as const)
  }

  if (
    params.assessment.models.reason ===
      MANAGED_SITE_CHANNEL_MODELS_MATCH_REASONS.NO_MODELS_PROVIDED ||
    params.assessment.models.reason ===
      MANAGED_SITE_CHANNEL_MODELS_MATCH_REASONS.COMPARISON_UNAVAILABLE
  ) {
    return "warning" as const
  }

  return "outline" as const
}

const appendNewApiKeyHintToTooltip = (
  managedSiteType: ManagedSiteType,
  message: string,
  assessment: ManagedSiteChannelAssessmentSignals,
  t: ReturnType<typeof useTranslation>["t"],
) => {
  if (
    managedSiteType !== NEW_API ||
    assessment.key.reason !==
      MANAGED_SITE_CHANNEL_KEY_MATCH_REASONS.COMPARISON_UNAVAILABLE
  ) {
    return message
  }

  return `${message} ${t("keyManagement:managedSiteStatus.descriptions.newApiRetrieveKeyHint")}`
}

const getUrlSignalLabel = (
  t: ReturnType<typeof useTranslation>["t"],
  assessment: ManagedSiteChannelAssessmentSignals,
) =>
  assessment.url.matched
    ? t("keyManagement:managedSiteStatus.signals.url.matched")
    : t("keyManagement:managedSiteStatus.signals.url.noMatch")

const getKeySignalLabel = (
  t: ReturnType<typeof useTranslation>["t"],
  assessment: ManagedSiteChannelAssessmentSignals,
) => {
  switch (assessment.key.reason) {
    case MANAGED_SITE_CHANNEL_KEY_MATCH_REASONS.MATCHED:
      return t("keyManagement:managedSiteStatus.signals.key.matched")
    case MANAGED_SITE_CHANNEL_KEY_MATCH_REASONS.NO_KEY_PROVIDED:
      return t("keyManagement:managedSiteStatus.signals.key.notProvided")
    case MANAGED_SITE_CHANNEL_KEY_MATCH_REASONS.COMPARISON_UNAVAILABLE:
      return t("keyManagement:managedSiteStatus.signals.key.unavailable")
    default:
      return t("keyManagement:managedSiteStatus.signals.key.noMatch")
  }
}

const getModelsSignalLabel = (
  t: ReturnType<typeof useTranslation>["t"],
  assessment: ManagedSiteChannelAssessmentSignals,
) => {
  switch (assessment.models.reason) {
    case MANAGED_SITE_CHANNEL_MODELS_MATCH_REASONS.EXACT:
      return t("keyManagement:managedSiteStatus.signals.models.exact")
    case MANAGED_SITE_CHANNEL_MODELS_MATCH_REASONS.CONTAINED:
      return t("keyManagement:managedSiteStatus.signals.models.contained")
    case MANAGED_SITE_CHANNEL_MODELS_MATCH_REASONS.SIMILAR:
      return t("keyManagement:managedSiteStatus.signals.models.similar")
    case MANAGED_SITE_CHANNEL_MODELS_MATCH_REASONS.NO_MODELS_PROVIDED:
      return t("keyManagement:managedSiteStatus.signals.models.notProvided")
    case MANAGED_SITE_CHANNEL_MODELS_MATCH_REASONS.COMPARISON_UNAVAILABLE:
      return t("keyManagement:managedSiteStatus.signals.models.unavailable")
    default:
      return t("keyManagement:managedSiteStatus.signals.models.noMatch")
  }
}

const getUrlSignalTooltip = (
  t: ReturnType<typeof useTranslation>["t"],
  assessment: ManagedSiteChannelAssessmentSignals,
) => {
  if (assessment.url.matched) {
    return t("keyManagement:managedSiteStatus.signals.url.tooltipMatched", {
      count: assessment.url.candidateCount,
      channelName: assessment.url.channel?.name ?? "",
    })
  }

  return t("keyManagement:managedSiteStatus.signals.url.tooltipNoMatch")
}

const getKeySignalTooltip = (
  t: ReturnType<typeof useTranslation>["t"],
  managedSiteType: ManagedSiteType,
  assessment: ManagedSiteChannelAssessmentSignals,
) => {
  switch (assessment.key.reason) {
    case MANAGED_SITE_CHANNEL_KEY_MATCH_REASONS.MATCHED:
      return t("keyManagement:managedSiteStatus.signals.key.tooltipMatched", {
        channelName: assessment.key.channel?.name ?? "",
      })
    case MANAGED_SITE_CHANNEL_KEY_MATCH_REASONS.NO_KEY_PROVIDED:
      return t("keyManagement:managedSiteStatus.signals.key.tooltipNotProvided")
    case MANAGED_SITE_CHANNEL_KEY_MATCH_REASONS.COMPARISON_UNAVAILABLE:
      return appendNewApiKeyHintToTooltip(
        managedSiteType,
        t("keyManagement:managedSiteStatus.signals.key.tooltipUnavailable"),
        assessment,
        t,
      )
    default:
      return t("keyManagement:managedSiteStatus.signals.key.tooltipNoMatch")
  }
}

const getModelsSignalTooltip = (
  t: ReturnType<typeof useTranslation>["t"],
  assessment: ManagedSiteChannelAssessmentSignals,
) => {
  switch (assessment.models.reason) {
    case MANAGED_SITE_CHANNEL_MODELS_MATCH_REASONS.EXACT:
      return t("keyManagement:managedSiteStatus.signals.models.tooltipExact", {
        channelName: assessment.models.channel?.name ?? "",
      })
    case MANAGED_SITE_CHANNEL_MODELS_MATCH_REASONS.CONTAINED:
      return t(
        "keyManagement:managedSiteStatus.signals.models.tooltipContained",
        {
          channelName: assessment.models.channel?.name ?? "",
        },
      )
    case MANAGED_SITE_CHANNEL_MODELS_MATCH_REASONS.SIMILAR:
      return t(
        "keyManagement:managedSiteStatus.signals.models.tooltipSimilar",
        {
          channelName: assessment.models.channel?.name ?? "",
          score: Math.round((assessment.models.similarityScore ?? 0) * 100),
        },
      )
    case MANAGED_SITE_CHANNEL_MODELS_MATCH_REASONS.NO_MODELS_PROVIDED:
      return t(
        "keyManagement:managedSiteStatus.signals.models.tooltipNotProvided",
      )
    case MANAGED_SITE_CHANNEL_MODELS_MATCH_REASONS.COMPARISON_UNAVAILABLE:
      return t(
        "keyManagement:managedSiteStatus.signals.models.tooltipUnavailable",
      )
    default:
      return t("keyManagement:managedSiteStatus.signals.models.tooltipNoMatch")
  }
}

/**
 * Small tooltip-backed badge used by the managed-site signal row.
 */
function SignalBadge(props: {
  badgeText: string
  tooltipText: string
  variant: "success" | "info" | "outline" | "warning"
}) {
  return (
    <Tooltip content={props.tooltipText} position="top">
      <span title={props.tooltipText} className="inline-flex">
        <Badge variant={props.variant} size="sm" className="cursor-help">
          {props.badgeText}
        </Badge>
      </span>
    </Tooltip>
  )
}

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
