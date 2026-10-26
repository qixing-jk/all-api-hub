import type { TFunction } from "i18next"
import {
  Check,
  CircleAlert,
  CloudDownload,
  Download,
  RefreshCw,
} from "lucide-react"
import { useTranslation } from "react-i18next"

import { WorkflowTransitionIcon } from "~/components/icons/WorkflowTransitionIcon"
import { RELEASE_UPDATE_STATUS_PANEL_TEST_IDS } from "~/components/ReleaseUpdateStatusPanel.testIds"
import {
  ActionGroup,
  BodySmall,
  Button,
  Caption,
  Card,
  CardContent,
  Heading6,
} from "~/components/ui"
import { useReleaseUpdateStatus } from "~/contexts/ReleaseUpdateStatusContext"
import toast from "~/lib/notify"
import { cn } from "~/lib/utils"
import {
  deriveReleaseUpdateCheckOutcome,
  deriveReleaseUpdatePresentation,
  RELEASE_UPDATE_ACTION_KINDS,
  RELEASE_UPDATE_CHECK_OUTCOMES,
  RELEASE_UPDATE_PRESENTATION_STATES,
} from "~/services/updates/presentation"
import {
  LATEST_STABLE_RELEASE_URL,
  RELEASE_UPDATE_REASONS,
  type ReleaseUpdateReason,
} from "~/services/updates/releaseUpdateStatus"
import { reloadRuntime } from "~/utils/browser/runtime"
import { getDocsChangelogUrl } from "~/utils/navigation/docsLinks"

/**
 * Map the derived release-update state to the primary status title shown in the panel.
 */
function getStatusTitle(options: {
  state: ReturnType<typeof deriveReleaseUpdatePresentation>["state"]
  t: TFunction
}): string {
  const { state, t } = options

  switch (state) {
    case RELEASE_UPDATE_PRESENTATION_STATES.Loading:
      return t("common:status.loading")
    case RELEASE_UPDATE_PRESENTATION_STATES.Unavailable:
      return t("settings:releaseUpdate.states.unavailable")
    case RELEASE_UPDATE_PRESENTATION_STATES.StoreUpdateReady:
      return t("settings:releaseUpdate.states.storeUpdateReady")
    case RELEASE_UPDATE_PRESENTATION_STATES.StoreUpdatePending:
      return t("settings:releaseUpdate.states.storeUpdatePending")
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
      return t("settings:releaseUpdate.states.unavailable")
  }
}

/**
 * Map the derived release-update state to the secondary helper copy shown in the panel.
 */
function getStatusHelper(options: {
  state: ReturnType<typeof deriveReleaseUpdatePresentation>["state"]
  t: TFunction
  reason: ReleaseUpdateReason
  selfUpdate: boolean
}): string | undefined {
  const { state, t, reason, selfUpdate } = options

  switch (state) {
    case RELEASE_UPDATE_PRESENTATION_STATES.Loading:
      return undefined
    case RELEASE_UPDATE_PRESENTATION_STATES.Unavailable:
      return t("settings:releaseUpdate.helpers.unavailable")
    case RELEASE_UPDATE_PRESENTATION_STATES.StoreUpdateReady:
      return t("settings:releaseUpdate.helpers.storeUpdateReady")
    case RELEASE_UPDATE_PRESENTATION_STATES.StoreUpdatePending:
      return t("settings:releaseUpdate.helpers.storeUpdate")
    case RELEASE_UPDATE_PRESENTATION_STATES.UpdateAvailable:
      if (selfUpdate) {
        return t("settings:releaseUpdate.helpers.selfUpdate")
      }
      switch (reason) {
        case RELEASE_UPDATE_REASONS.FirefoxAmo:
          return t("settings:releaseUpdate.helpers.amoUpdate")
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
    case RELEASE_UPDATE_PRESENTATION_STATES.NotChecked:
      return undefined
    case RELEASE_UPDATE_PRESENTATION_STATES.Ineligible:
    default:
      return undefined
  }
}

/**
 * Map the derived release-update state to the latest-version detail line.
 */
function getLatestVersionLine(options: {
  latestVersion: string | null
  t: TFunction
  reason: ReleaseUpdateReason
}): string {
  const { latestVersion, t, reason } = options

  if (latestVersion) {
    if (reason === RELEASE_UPDATE_REASONS.FirefoxAmo) {
      return t("settings:releaseUpdate.latestAmoVersion", {
        version: latestVersion,
      })
    }
    if (reason === RELEASE_UPDATE_REASONS.GithubNightly) {
      return t("settings:releaseUpdate.latestNightlyVersion", {
        version: latestVersion,
      })
    }
    return t("about:releaseUpdate.latestVersion", {
      version: latestVersion,
    })
  }

  return ""
}

/**
 * Map the derived release-update action kind to the action button label.
 */
function getActionLabel(
  actionKind: ReturnType<typeof deriveReleaseUpdatePresentation>["actionKind"],
  t: TFunction,
): string {
  switch (actionKind) {
    case RELEASE_UPDATE_ACTION_KINDS.ReloadToUpdate:
      return t("settings:releaseUpdate.reloadToUpdate")
    case RELEASE_UPDATE_ACTION_KINDS.ViewReleaseNotes:
      return t("settings:releaseUpdate.viewReleaseNotes")
    case RELEASE_UPDATE_ACTION_KINDS.DownloadUpdate:
      return t("settings:releaseUpdate.downloadUpdate")
    case RELEASE_UPDATE_ACTION_KINDS.OpenLatest:
    default:
      return t("settings:releaseUpdate.changelog")
  }
}

/**
 * Map the derived release-update action kind to the action button icon.
 */
function getActionIcon(
  actionKind: ReturnType<typeof deriveReleaseUpdatePresentation>["actionKind"],
) {
  switch (actionKind) {
    case RELEASE_UPDATE_ACTION_KINDS.ReloadToUpdate:
      return <RefreshCw className="h-4 w-4" />
    case RELEASE_UPDATE_ACTION_KINDS.ViewReleaseNotes:
    case RELEASE_UPDATE_ACTION_KINDS.DownloadUpdate:
      return <Download className="h-4 w-4" />
    case RELEASE_UPDATE_ACTION_KINDS.OpenLatest:
    default:
      return <WorkflowTransitionIcon className="h-4 w-4" />
  }
}

/**
 * Shared release-update status panel rendered in About and Settings surfaces.
 */
export function ReleaseUpdateStatusPanel() {
  const { t } = useTranslation(["settings", "about", "common"])
  const { status, isLoading, isChecking, checkNow } = useReleaseUpdateStatus()

  const presentation = deriveReleaseUpdatePresentation({
    isLoading,
    status,
  })
  const latestVersion = presentation.latestVersion
  const statusReason = status?.reason ?? RELEASE_UPDATE_REASONS.Unknown
  const latestVersionLine = getLatestVersionLine({
    latestVersion,
    reason: statusReason,
    t,
  })

  const isNotChecked =
    presentation.state === RELEASE_UPDATE_PRESENTATION_STATES.NotChecked
  const currentVersionLine = status?.currentVersion
    ? t("about:releaseUpdate.currentVersion", {
        version: status.currentVersion,
      })
    : undefined
  const statusTitle =
    isNotChecked && currentVersionLine
      ? currentVersionLine
      : getStatusTitle({
          state: presentation.state,
          t,
        })
  const helper = getStatusHelper({
    state: presentation.state,
    t,
    reason: statusReason,
    selfUpdate: status?.selfUpdate ?? false,
  })
  const hasUpdate = presentation.hasUpdate
  const isStoreUpdateReady =
    presentation.actionKind === RELEASE_UPDATE_ACTION_KINDS.ReloadToUpdate
  const actionHref = hasUpdate
    ? status?.releaseUrl ?? LATEST_STABLE_RELEASE_URL
    : getDocsChangelogUrl(status?.currentVersion)
  const actionLabel = getActionLabel(presentation.actionKind, t)
  const actionIcon = getActionIcon(presentation.actionKind)

  const handleCheckNow = async () => {
    const next = await checkNow()
    const outcome = deriveReleaseUpdateCheckOutcome(next)

    switch (outcome) {
      case RELEASE_UPDATE_CHECK_OUTCOMES.CheckFailed:
        toast.error(t("settings:releaseUpdate.states.checkFailed"))
        return
      case RELEASE_UPDATE_CHECK_OUTCOMES.StoreUpdateReady:
        toast.success(t("settings:releaseUpdate.states.storeUpdateReady"))
        return
      case RELEASE_UPDATE_CHECK_OUTCOMES.StoreUpdatePending:
        toast.success(t("settings:releaseUpdate.states.storeUpdatePending"))
        return
      case RELEASE_UPDATE_CHECK_OUTCOMES.UpdateAvailable:
        toast.success(t("settings:releaseUpdate.states.updateAvailable"))
        return
      case RELEASE_UPDATE_CHECK_OUTCOMES.SelfUpdatePending:
        toast.success(t("settings:releaseUpdate.states.selfUpdatePending"))
        return
      case RELEASE_UPDATE_CHECK_OUTCOMES.UpToDate:
      default:
        toast.success(t("settings:releaseUpdate.states.upToDate"))
    }
  }

  const isUpToDate =
    presentation.state === RELEASE_UPDATE_PRESENTATION_STATES.UpToDate
  const isCheckFailed =
    presentation.state === RELEASE_UPDATE_PRESENTATION_STATES.CheckFailed
  const StatusIcon = isUpToDate
    ? Check
    : isCheckFailed
      ? CircleAlert
      : hasUpdate
        ? Download
        : CloudDownload

  return (
    <Card
      padding="none"
      data-testid={RELEASE_UPDATE_STATUS_PANEL_TEST_IDS.panel}
      className={cn(
        "transition-colors",
        hasUpdate && "border-primary-soft-border bg-primary-soft/20",
      )}
    >
      <CardContent
        padding="none"
        spacing="none"
        className="flex flex-col gap-3 p-4 sm:p-5"
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 flex-1 items-center gap-3.5">
            <div
              aria-hidden="true"
              className={cn(
                "flex size-10 shrink-0 items-center justify-center rounded-xl transition-colors",
                isUpToDate
                  ? "bg-success-soft text-success-soft-foreground"
                  : isCheckFailed
                    ? "bg-destructive-soft text-destructive-soft-foreground"
                    : hasUpdate
                      ? "bg-primary-soft text-primary-soft-foreground"
                      : "bg-info-soft text-info-soft-foreground",
              )}
            >
              <StatusIcon className="size-5" />
            </div>
            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="space-y-0.5">
                <Heading6 as="h3" weight="semibold" className="text-foreground">
                  {statusTitle}
                </Heading6>
                {helper && (
                  <BodySmall className="dark:text-secondary-foreground text-muted-foreground leading-normal">
                    {helper}
                  </BodySmall>
                )}
              </div>
              {(!isNotChecked || latestVersion) && (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  {currentVersionLine && (
                    <Caption>{currentVersionLine}</Caption>
                  )}
                  {latestVersion &&
                    latestVersion !== status?.currentVersion && (
                      <Caption className="text-foreground font-medium">
                        {latestVersionLine}
                      </Caption>
                    )}
                </div>
              )}
            </div>
          </div>
          <ActionGroup className="w-full shrink-0 justify-start sm:w-auto sm:justify-end [&>*]:flex-1 sm:[&>*]:flex-none">
            <Button
              type="button"
              variant={hasUpdate ? "outline" : "default"}
              size="sm"
              onClick={() => void handleCheckNow()}
              loading={isChecking}
              leftIcon={<RefreshCw className="h-4 w-4" />}
              data-testid={RELEASE_UPDATE_STATUS_PANEL_TEST_IDS.checkNowButton}
            >
              {isChecking
                ? t("common:status.checking")
                : t("settings:releaseUpdate.checkNow")}
            </Button>
            {isStoreUpdateReady ? (
              <Button
                type="button"
                variant="default"
                size="sm"
                rightIcon={actionIcon}
                onClick={reloadRuntime}
                data-testid={RELEASE_UPDATE_STATUS_PANEL_TEST_IDS.primaryAction}
              >
                {actionLabel}
              </Button>
            ) : (
              <Button
                asChild
                variant={hasUpdate ? "default" : "ghost"}
                size="sm"
                rightIcon={actionIcon}
                data-testid={RELEASE_UPDATE_STATUS_PANEL_TEST_IDS.primaryAction}
              >
                <a href={actionHref} target="_blank" rel="noopener noreferrer">
                  {actionLabel}
                </a>
              </Button>
            )}
          </ActionGroup>
        </div>
      </CardContent>
    </Card>
  )
}
