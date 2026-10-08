import { Gauge } from "lucide-react"
import { useMemo } from "react"
import { useTranslation } from "react-i18next"

import { Badge } from "~/components/ui"
import {
  buildAllowanceOverview,
  type ApiCredentialAllowanceLevel,
} from "~/features/ApiCredentialProfiles/allowance/apiCredentialAllowance"
import { formatAllowanceSignalLabel } from "~/features/ApiCredentialProfiles/allowance/apiCredentialTelemetryFormatting"
import { API_CREDENTIAL_PROFILES_TEST_IDS } from "~/features/ApiCredentialProfiles/testIds"
import { cn } from "~/lib/utils"
import type { ApiCredentialProfile } from "~/types/apiCredentialProfiles"

const URGENT_LEVEL_BADGE_VARIANTS: Partial<
  Record<ApiCredentialAllowanceLevel, "danger" | "warning">
> = {
  critical: "danger",
  low: "warning",
}

type ApiCredentialProfilesAllowanceOverviewProps = {
  profiles: ApiCredentialProfile[]
  onFocusProfile?: (profileId: string) => void
}

/**
 * Summarizes the whole library as "how much is left, and what is worst", which
 * is the part of a monitoring dashboard a user actually scans for.
 */
export function ApiCredentialProfilesAllowanceOverview({
  profiles,
  onFocusProfile,
}: ApiCredentialProfilesAllowanceOverviewProps) {
  const { t } = useTranslation(["apiCredentialProfiles"])
  const overview = useMemo(() => buildAllowanceOverview(profiles), [profiles])

  if (overview.monitoredCount === 0) return null

  // Full coverage is the normal case and says nothing actionable, so the
  // count only appears while some credential is still missing allowance data
  // and the denominator actually explains the smaller total.
  const hasUncoveredProfiles = overview.monitoredCount < overview.totalCount

  const urgentCounts = [
    {
      level: "critical" as const,
      count: overview.criticalCount,
      label: t("apiCredentialProfiles:telemetry.allowance.overview.critical", {
        count: overview.criticalCount,
      }),
    },
    {
      level: "low" as const,
      count: overview.lowCount,
      label: t("apiCredentialProfiles:telemetry.allowance.overview.low", {
        count: overview.lowCount,
      }),
    },
  ].filter((entry) => entry.count > 0)

  // A fully-covered library where every signal reads normal or unknown has
  // nothing for a monitor to scan, so drop the whole box instead of leaving a
  // bare border behind.
  if (
    !hasUncoveredProfiles &&
    urgentCounts.length === 0 &&
    !overview.mostUrgent
  ) {
    return null
  }

  return (
    <div
      data-testid={API_CREDENTIAL_PROFILES_TEST_IDS.allowanceOverview}
      className="dark:bg-secondary/60 bg-surface-subtle border-border-subtle gap-x-density-3 gap-y-density-2 flex min-w-0 flex-wrap items-center rounded-lg border px-3 py-2"
    >
      {hasUncoveredProfiles ? (
        <span className="gap-density-1-5 text-secondary-foreground flex shrink-0 items-center text-xs font-medium">
          <Gauge className="h-3.5 w-3.5" aria-hidden="true" />
          {t("apiCredentialProfiles:telemetry.allowance.overview.monitored", {
            monitored: overview.monitoredCount,
            total: overview.totalCount,
          })}
        </span>
      ) : null}

      {urgentCounts.map((entry) => (
        <Badge
          key={entry.level}
          variant={URGENT_LEVEL_BADGE_VARIANTS[entry.level]}
          size="sm"
          className="shrink-0"
        >
          {entry.label}
        </Badge>
      ))}

      {overview.mostUrgent ? (
        <button
          type="button"
          onClick={() => onFocusProfile?.(overview.mostUrgent!.profileId)}
          className="gap-density-1-5 focus-visible:ring-ring text-muted-foreground hover:text-secondary-foreground ml-auto flex min-w-0 items-center rounded outline-none focus-visible:ring-2"
          aria-label={[
            t("apiCredentialProfiles:telemetry.allowance.overview.focus", {
              name: overview.mostUrgent.profileName,
            }),
            formatAllowanceSignalLabel(t, overview.mostUrgent.signal),
          ].join(": ")}
          data-testid={API_CREDENTIAL_PROFILES_TEST_IDS.allowanceOverviewFocus}
        >
          <span className="shrink-0 text-xs">
            {t("apiCredentialProfiles:telemetry.allowance.overview.mostUrgent")}
          </span>
          <span
            className={cn(
              "truncate text-xs font-semibold",
              overview.mostUrgent.signal.level === "critical" &&
                "text-destructive-text",
              overview.mostUrgent.signal.level === "low" && "text-warning-text",
            )}
          >
            {formatAllowanceSignalLabel(t, overview.mostUrgent.signal)}
          </span>
        </button>
      ) : null}
    </div>
  )
}
