import { useTranslation } from "react-i18next"

import { Badge } from "~/components/ui"
import {
  API_CREDENTIAL_ALLOWANCE_LEVEL_CLASSES,
  API_CREDENTIAL_ALLOWANCE_LEVELS,
  getAllowanceCountdown,
  getPrimaryAllowanceSignal,
  type ApiCredentialAllowanceLevel,
} from "~/features/ApiCredentialProfiles/allowance/apiCredentialAllowance"
import {
  formatAllowanceCountdown,
  formatAllowanceSignalLabel,
} from "~/features/ApiCredentialProfiles/allowance/apiCredentialTelemetryFormatting"
import { useAllowanceClock } from "~/features/ApiCredentialProfiles/allowance/useAllowanceClock"
import { API_CREDENTIAL_PROFILES_TEST_IDS } from "~/features/ApiCredentialProfiles/testIds"
import { cn } from "~/lib/utils"
import type { ApiCredentialTelemetryFacts } from "~/types/apiCredentialProfiles"

const ALLOWANCE_BADGE_VARIANTS: Record<
  ApiCredentialAllowanceLevel,
  "outline" | "danger" | "warning" | "success"
> = {
  [API_CREDENTIAL_ALLOWANCE_LEVELS.Critical]: "danger",
  [API_CREDENTIAL_ALLOWANCE_LEVELS.Low]: "warning",
  [API_CREDENTIAL_ALLOWANCE_LEVELS.Normal]: "success",
  [API_CREDENTIAL_ALLOWANCE_LEVELS.Unknown]: "outline",
}

type ApiCredentialProfileAllowanceBadgeProps = {
  facts: ApiCredentialTelemetryFacts | undefined
}

/**
 * Shows the most urgent allowance of a credential on its collapsed header, so
 * a draining key is visible without expanding the telemetry panel.
 */
export function ApiCredentialProfileAllowanceBadge({
  facts,
}: ApiCredentialProfileAllowanceBadgeProps) {
  const { t } = useTranslation(["apiCredentialProfiles", "common"])
  const now = useAllowanceClock()
  const signal = getPrimaryAllowanceSignal(facts)

  if (!signal) return null

  const label = formatAllowanceSignalLabel(t, signal)
  const countdown =
    signal.kind === "quota-window"
      ? getAllowanceCountdown(signal.resetTime, now)
      : undefined
  const title = [
    t("apiCredentialProfiles:telemetry.allowance.title"),
    label,
    countdown ? formatAllowanceCountdown(t, countdown) : "",
  ]
    .filter(Boolean)
    .join(": ")

  return (
    <Badge
      variant={ALLOWANCE_BADGE_VARIANTS[signal.level]}
      size="sm"
      className="max-w-full"
      title={title}
      aria-label={title}
      data-testid={API_CREDENTIAL_PROFILES_TEST_IDS.allowanceBadge}
    >
      <span
        className={cn(
          "h-1.5 w-1.5 shrink-0 rounded-full",
          API_CREDENTIAL_ALLOWANCE_LEVEL_CLASSES[signal.level].indicator,
        )}
        aria-hidden="true"
      />
      <span className="truncate">{label}</span>
    </Badge>
  )
}
