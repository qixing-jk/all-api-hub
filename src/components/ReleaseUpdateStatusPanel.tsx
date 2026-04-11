import {
  ArrowDownTrayIcon,
  ArrowPathIcon,
  ArrowTopRightOnSquareIcon,
  CloudArrowDownIcon,
} from "@heroicons/react/24/outline"
import type { TFunction } from "i18next"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

import { BodySmall, Button, Card, CardItem, CardList } from "~/components/ui"
import { useReleaseUpdateStatus } from "~/contexts/ReleaseUpdateStatusContext"
import {
  deriveReleaseUpdateCheckOutcome,
  deriveReleaseUpdatePresentation,
  RELEASE_UPDATE_CHECK_OUTCOMES,
  RELEASE_UPDATE_PRESENTATION_STATES,
} from "~/services/updates/presentation"
import {
  LATEST_STABLE_RELEASE_URL,
  RELEASE_UPDATE_REASONS,
  type ReleaseUpdateReason,
} from "~/services/updates/releaseUpdateStatus"

/**
 * Format the last release-check timestamp for a localized status line.
 */
function formatCheckedAt(
  timestamp: number | null,
  locale: string,
): string | null {
  if (typeof timestamp !== "number" || !Number.isFinite(timestamp)) {
    return null
  }

  try {
    return new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(timestamp)
  } catch {
    return new Date(timestamp).toLocaleString()
  }
}

/**
 * Map install-eligibility reasons to localized title text for the panel.
 */
function getReasonDescription(
  reason: ReleaseUpdateReason,
  t: TFunction,
): string {
  switch (reason) {
    case RELEASE_UPDATE_REASONS.ChromiumDevelopment:
      return t("settings:releaseUpdate.reasons.chromium-development")
    case RELEASE_UPDATE_REASONS.StoreBuild:
      return t("settings:releaseUpdate.reasons.store-build")
    case RELEASE_UPDATE_REASONS.FirefoxAmbiguous:
      return t("settings:releaseUpdate.reasons.firefox-ambiguous")
    case RELEASE_UPDATE_REASONS.SafariUnsupported:
      return t("settings:releaseUpdate.reasons.safari-unsupported")
    case RELEASE_UPDATE_REASONS.ApiUnavailable:
      return t("settings:releaseUpdate.reasons.api-unavailable")
    case RELEASE_UPDATE_REASONS.Unknown:
    default:
      return t("settings:releaseUpdate.reasons.unknown")
  }
}

/**
 * Map the derived release-update state to the primary status title shown in the panel.
 */
function getStatusTitle(options: {
  state: ReturnType<typeof deriveReleaseUpdatePresentation>["state"]
  t: TFunction
  reason: ReleaseUpdateReason
}): string {
  const { state, t, reason } = options

  switch (state) {
    case RELEASE_UPDATE_PRESENTATION_STATES.Loading:
      return t("common:status.loading")
    case RELEASE_UPDATE_PRESENTATION_STATES.Unavailable:
      return t("settings:releaseUpdate.states.unavailable")
    case RELEASE_UPDATE_PRESENTATION_STATES.UpdateAvailable:
      return t("settings:releaseUpdate.states.updateAvailable")
    case RELEASE_UPDATE_PRESENTATION_STATES.CheckFailed:
      return t("settings:releaseUpdate.states.checkFailed")
    case RELEASE_UPDATE_PRESENTATION_STATES.UpToDate:
      return t("settings:releaseUpdate.states.upToDate")
    case RELEASE_UPDATE_PRESENTATION_STATES.NotChecked:
      return t("settings:releaseUpdate.states.notChecked")
    case RELEASE_UPDATE_PRESENTATION_STATES.Ineligible:
    default:
      return getReasonDescription(reason, t)
  }
}

/**
 * Map the derived release-update state to the secondary helper copy shown in the panel.
 */
function getStatusHelper(options: {
  state: ReturnType<typeof deriveReleaseUpdatePresentation>["state"]
  t: TFunction
  reason: ReleaseUpdateReason
}): string | undefined {
  const { state, t, reason } = options

  switch (state) {
    case RELEASE_UPDATE_PRESENTATION_STATES.Loading:
      return undefined
    case RELEASE_UPDATE_PRESENTATION_STATES.Unavailable:
      return t("settings:releaseUpdate.helpers.unavailable")
    case RELEASE_UPDATE_PRESENTATION_STATES.UpdateAvailable:
      switch (reason) {
        case RELEASE_UPDATE_REASONS.StoreBuild:
          return t("settings:releaseUpdate.helpers.storeUpdate")
        case RELEASE_UPDATE_REASONS.ChromiumDevelopment:
          return t("settings:releaseUpdate.helpers.manualUpdate")
        default:
          return t("settings:releaseUpdate.helpers.manualUpdateGeneric")
      }
    case RELEASE_UPDATE_PRESENTATION_STATES.CheckFailed:
      return t("settings:releaseUpdate.helpers.checkFailed")
    case RELEASE_UPDATE_PRESENTATION_STATES.UpToDate:
      return t("settings:releaseUpdate.helpers.upToDate")
    case RELEASE_UPDATE_PRESENTATION_STATES.NotChecked:
      return t("settings:releaseUpdate.helpers.notChecked")
    case RELEASE_UPDATE_PRESENTATION_STATES.Ineligible:
    default:
      return t("settings:releaseUpdate.helpers.openLatest")
  }
}

/**
 * Map the derived release-update state to the latest-version detail line.
 */
function getLatestVersionLine(options: {
  latestVersion: string | null
  state: ReturnType<typeof deriveReleaseUpdatePresentation>["state"]
  t: TFunction
}): string {
  const { latestVersion, state, t } = options

  if (latestVersion) {
    return t("about:releaseUpdate.latestVersion", {
      version: latestVersion,
    })
  }

  switch (state) {
    case RELEASE_UPDATE_PRESENTATION_STATES.Loading:
    case RELEASE_UPDATE_PRESENTATION_STATES.NotChecked:
      return t("settings:releaseUpdate.latestVersionPending")
    case RELEASE_UPDATE_PRESENTATION_STATES.Unavailable:
    case RELEASE_UPDATE_PRESENTATION_STATES.CheckFailed:
    case RELEASE_UPDATE_PRESENTATION_STATES.Ineligible:
    case RELEASE_UPDATE_PRESENTATION_STATES.UpdateAvailable:
    case RELEASE_UPDATE_PRESENTATION_STATES.UpToDate:
    default:
      return t("settings:releaseUpdate.latestVersionUnavailable")
  }
}

/**
 * Shared release-update status panel rendered in About and Settings surfaces.
 */
export function ReleaseUpdateStatusPanel() {
  const { t, i18n } = useTranslation(["settings", "about", "common"])
  const { status, isLoading, isChecking, checkNow } = useReleaseUpdateStatus()

  const lastChecked = formatCheckedAt(status?.checkedAt ?? null, i18n.language)
  const presentation = deriveReleaseUpdatePresentation({
    isLoading,
    status,
  })
  const latestVersion = presentation.latestVersion
  const latestVersionLine = getLatestVersionLine({
    latestVersion,
    state: presentation.state,
    t,
  })

  const statusReason = status?.reason ?? RELEASE_UPDATE_REASONS.Unknown
  const statusTitle = getStatusTitle({
    state: presentation.state,
    t,
    reason: statusReason,
  })
  const statusDescription = getStatusHelper({
    state: presentation.state,
    t,
    reason: statusReason,
  })
  const hasUpdate = presentation.hasUpdate
  const actionHref = status?.releaseUrl ?? LATEST_STABLE_RELEASE_URL
  const actionLabel = hasUpdate
    ? t("settings:releaseUpdate.downloadUpdate")
    : t("settings:releaseUpdate.openLatest")
  const actionIcon = hasUpdate ? (
    <ArrowDownTrayIcon className="h-4 w-4" />
  ) : (
    <ArrowTopRightOnSquareIcon className="h-4 w-4" />
  )

  const handleCheckNow = async () => {
    if (presentation.state === RELEASE_UPDATE_PRESENTATION_STATES.Ineligible) {
      toast.error(getReasonDescription(statusReason, t))
      return
    }

    const next = await checkNow()
    const outcome = deriveReleaseUpdateCheckOutcome(next)

    switch (outcome) {
      case RELEASE_UPDATE_CHECK_OUTCOMES.CheckFailed:
        toast.error(t("settings:releaseUpdate.states.checkFailed"))
        return
      case RELEASE_UPDATE_CHECK_OUTCOMES.UpdateAvailable:
        toast.success(t("settings:releaseUpdate.states.updateAvailable"))
        return
      case RELEASE_UPDATE_CHECK_OUTCOMES.UpToDate:
      default:
        toast.success(t("settings:releaseUpdate.states.upToDate"))
    }
  }

  return (
    <Card padding="none">
      <CardList>
        <CardItem
          icon={
            <CloudArrowDownIcon className="h-5 w-5 text-sky-600 dark:text-sky-400" />
          }
          title={statusTitle}
          description={statusDescription}
          leftContent={
            <div className="space-y-1">
              {status?.currentVersion && (
                <BodySmall>
                  {t("about:releaseUpdate.currentVersion", {
                    version: status.currentVersion,
                  })}
                </BodySmall>
              )}
              <BodySmall>{latestVersionLine}</BodySmall>
              {lastChecked && (
                <BodySmall>
                  {t("settings:releaseUpdate.lastChecked", {
                    time: lastChecked,
                  })}
                </BodySmall>
              )}
            </div>
          }
          rightContent={
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void handleCheckNow()}
                loading={isChecking}
                leftIcon={<ArrowPathIcon className="h-4 w-4" />}
              >
                {t("settings:releaseUpdate.checkNow")}
              </Button>
              <Button
                asChild
                variant={hasUpdate ? "default" : "secondary"}
                size="sm"
                rightIcon={actionIcon}
              >
                <a href={actionHref} target="_blank" rel="noopener noreferrer">
                  {actionLabel}
                </a>
              </Button>
            </div>
          }
        />
      </CardList>
    </Card>
  )
}
