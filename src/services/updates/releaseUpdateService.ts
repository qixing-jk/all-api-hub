import { Storage } from "@plasmohq/storage"

import {
  EXTENSION_STORE_IDS,
  EXTENSION_STORE_LISTING_URLS,
} from "~/constants/extensionStores"
import { STORAGE_KEYS, STORAGE_LOCKS } from "~/services/core/storageKeys"
import { withExtensionStorageWriteLock } from "~/services/core/storageWriteLock"
import { createRuntimeMessageFailure } from "~/services/runtimeMessaging/result"
import {
  createAlarm,
  getAlarm,
  hasAlarmsAPI,
  onAlarm,
} from "~/utils/browser/alarms"
import {
  getExtensionURL,
  getExtensionVersion,
  getManagementSelf,
  getRuntimeId,
} from "~/utils/browser/runtime"
import { requestRuntimeUpdateCheck } from "~/utils/browser/runtimeUpdateCheck"
import { getBuildRevision, isBuildRevision } from "~/utils/core/buildRevision"
import {
  DISTRIBUTION_CHANNEL,
  getDistributionChannel,
} from "~/utils/core/distributionChannel"
import { getErrorMessage } from "~/utils/core/error"
import { createLogger } from "~/utils/core/logger"

import {
  onReleaseUpdateMessage,
  ReleaseUpdateMessageTypes,
  type ReleaseUpdateRuntimeResponse,
} from "./messaging"
import {
  BROWSER_STORE_UPDATE_STATUSES,
  createDefaultBrowserStoreUpdateState,
  createDefaultReleaseUpdateStatus,
  LATEST_NIGHTLY_RELEASE_URL,
  LATEST_STABLE_RELEASE_URL,
  RELEASE_UPDATE_REASONS,
  type BrowserStoreUpdateState,
  type ReleaseUpdateReason,
  type ReleaseUpdateStatus,
} from "./releaseUpdateStatus"
import { parseReleaseUpdateStatus } from "./statusCodec"

const logger = createLogger("ReleaseUpdateService")
const GITHUB_LATEST_RELEASE_API_URL =
  "https://api.github.com/repos/qixing-jk/all-api-hub/releases/latest"
const DAILY_CHECK_PERIOD_MINUTES = 24 * 60

type DetectInstallEligibilityResult = {
  eligible: boolean
  reason: ReleaseUpdateReason
}

type LatestReleaseInfo = {
  latestVersion: string
  releaseUrl: string
  updateAvailable?: boolean
}

class ReleaseUpdateService {
  static readonly ALARM_NAME = "releaseUpdateDailyCheck"

  private storage: Storage
  private isInitialized = false
  private initializationPromise: Promise<void> | null = null

  constructor() {
    this.storage = new Storage({
      area: "local",
    })
  }

  async initialize() {
    if (this.isInitialized) {
      logger.debug("Release update service already initialized")
      return
    }

    if (this.initializationPromise) {
      await this.initializationPromise
      return
    }

    const initializationPromise = (async () => {
      await this.ensureBaseStatus()

      if (hasAlarmsAPI()) {
        await this.setupAlarm()

        onAlarm(async (alarm) => {
          if (alarm.name !== ReleaseUpdateService.ALARM_NAME) {
            return
          }

          try {
            await this.runScheduledCheck()
          } catch (error) {
            logger.error("Scheduled release update check failed", error)
          }
        })
      } else {
        logger.warn(
          "Alarms API not available; automatic release checks disabled",
        )
      }
      this.isInitialized = true
    })()

    this.initializationPromise = initializationPromise

    try {
      await initializationPromise
    } finally {
      if (this.initializationPromise === initializationPromise) {
        this.initializationPromise = null
      }
    }
  }

  async getStatus(): Promise<ReleaseUpdateStatus> {
    return await this.ensureBaseStatus()
  }

  async checkNow(): Promise<ReleaseUpdateStatus> {
    const base = await this.ensureBaseStatus()

    return await this.refreshStatus(base, {
      includeBrowserStoreCheck: true,
    })
  }

  private async runScheduledCheck(): Promise<ReleaseUpdateStatus> {
    const base = await this.ensureBaseStatus()
    if (
      !base.eligible ||
      getDistributionChannel() === DISTRIBUTION_CHANNEL.LocalDevelopment
    ) {
      return base
    }

    return await this.refreshStatus(base)
  }

  private async setupAlarm(): Promise<void> {
    const existingAlarm = await getAlarm(ReleaseUpdateService.ALARM_NAME)
    if (
      existingAlarm?.periodInMinutes != null &&
      Math.abs(existingAlarm.periodInMinutes - DAILY_CHECK_PERIOD_MINUTES) <
        0.001
    ) {
      return
    }

    await createAlarm(ReleaseUpdateService.ALARM_NAME, {
      periodInMinutes: DAILY_CHECK_PERIOD_MINUTES,
      delayInMinutes: DAILY_CHECK_PERIOD_MINUTES,
    })
  }

  private async ensureBaseStatus(): Promise<ReleaseUpdateStatus> {
    return await withExtensionStorageWriteLock(
      STORAGE_LOCKS.RELEASE_UPDATE,
      async () => {
        const stored = await this.readStoredStatus()
        const next = await this.buildBaseStatus(stored)

        if (!stored || !areStatusesEquivalent(stored, next)) {
          await this.writeStatusUnlocked(next)
        }

        return next
      },
    )
  }

  private async refreshStatus(
    base: ReleaseUpdateStatus,
    options?: { includeBrowserStoreCheck?: boolean },
  ): Promise<ReleaseUpdateStatus> {
    let latestRelease: LatestReleaseInfo | null = null
    let latestReleaseError: unknown = null
    let storeUpdate = base.storeUpdate
    const githubLookup =
      base.reason === RELEASE_UPDATE_REASONS.FirefoxAmo
        ? fetchLatestStableRelease()
            .then((info) => info.latestVersion)
            .catch(() => null)
        : Promise.resolve(undefined)

    try {
      latestRelease =
        base.reason === RELEASE_UPDATE_REASONS.FirefoxAmo
          ? await fetchLatestAmoRelease()
          : base.reason === RELEASE_UPDATE_REASONS.GithubNightly
            ? await fetchLatestNightlyRelease()
            : await fetchLatestStableRelease()
    } catch (error) {
      logger.warn("Failed to fetch latest stable release", error)
      latestReleaseError = error
    }

    if (
      options?.includeBrowserStoreCheck &&
      base.reason === RELEASE_UPDATE_REASONS.StoreBuild
    ) {
      storeUpdate = await checkBrowserStoreUpdate()
    }

    const githubLatestVersion = await githubLookup
    const next: ReleaseUpdateStatus = latestRelease
      ? {
          ...base,
          githubLatestVersion,
          latestVersion: latestRelease.latestVersion,
          updateAvailable:
            latestRelease.updateAvailable ??
            compareNormalizedVersions(
              normalizeVersion(base.currentVersion),
              latestRelease.latestVersion,
            ) < 0,
          releaseUrl: latestRelease.releaseUrl,
          checkedAt: Date.now(),
          lastError: null,
          storeUpdate,
        }
      : {
          ...base,
          githubLatestVersion,
          checkedAt: Date.now(),
          lastError: getErrorMessage(latestReleaseError),
          storeUpdate,
        }

    await this.writeStatus(next)
    return next
  }

  private async buildBaseStatus(
    stored: ReleaseUpdateStatus | null,
  ): Promise<ReleaseUpdateStatus> {
    const currentVersion = getExtensionVersion()
    const distributionChannel = getDistributionChannel()
    const detected = await detectInstallEligibility()
    const fallback = createDefaultReleaseUpdateStatus(currentVersion)
    if (detected.reason === RELEASE_UPDATE_REASONS.FirefoxAmo)
      fallback.releaseUrl = EXTENSION_STORE_LISTING_URLS.firefox
    if (detected.reason === RELEASE_UPDATE_REASONS.GithubNightly)
      fallback.releaseUrl = LATEST_NIGHTLY_RELEASE_URL
    const isSameVersion = stored?.currentVersion === currentVersion
    const canReuseStoredReleaseFields =
      isSameVersion &&
      stored?.reason === detected.reason &&
      (stored?.distributionChannel ?? DISTRIBUTION_CHANNEL.Unknown) ===
        distributionChannel &&
      (detected.reason !== RELEASE_UPDATE_REASONS.GithubNightly ||
        stored?.buildRevision === getBuildRevision())
    const reusableStatus = canReuseStoredReleaseFields ? stored : null
    const fallbackStoreUpdate =
      detected.reason === RELEASE_UPDATE_REASONS.StoreBuild
        ? createStoreBuildNotCheckedState()
        : fallback.storeUpdate

    return {
      ...fallback,
      distributionChannel,
      ...(detected.reason === RELEASE_UPDATE_REASONS.GithubNightly
        ? { buildRevision: getBuildRevision() }
        : {}),
      eligible: detected.eligible,
      reason: detected.reason,
      latestVersion: reusableStatus?.latestVersion ?? null,
      updateAvailable: reusableStatus?.updateAvailable ?? false,
      releaseUrl: reusableStatus?.releaseUrl ?? fallback.releaseUrl,
      checkedAt: reusableStatus?.checkedAt ?? null,
      lastError: reusableStatus?.lastError ?? null,
      githubLatestVersion: reusableStatus?.githubLatestVersion ?? null,
      storeUpdate: reusableStatus?.storeUpdate ?? fallbackStoreUpdate,
    }
  }

  private async readStoredStatus(): Promise<ReleaseUpdateStatus | null> {
    const raw = (await this.storage.get(
      STORAGE_KEYS.RELEASE_UPDATE_STATUS,
    )) as unknown

    return parseReleaseUpdateStatus(raw)
  }

  private async writeStatus(status: ReleaseUpdateStatus): Promise<void> {
    await withExtensionStorageWriteLock(
      STORAGE_LOCKS.RELEASE_UPDATE,
      async () => {
        await this.writeStatusUnlocked(status)
      },
    )
  }

  private async writeStatusUnlocked(
    status: ReleaseUpdateStatus,
  ): Promise<void> {
    await this.storage.set(STORAGE_KEYS.RELEASE_UPDATE_STATUS, status)
  }
}

/** Nightly can change without a package-version bump, so compare baked commit IDs. */
async function fetchLatestNightlyRelease(): Promise<LatestReleaseInfo> {
  const response = await fetch(
    "https://api.github.com/repos/qixing-jk/all-api-hub/git/ref/tags/nightly",
    {
      headers: { Accept: "application/vnd.github+json" },
    },
  )
  if (!response.ok)
    throw new Error(`Nightly request failed with HTTP ${response.status}`)
  const payload = (await response.json()) as {
    object?: { type?: unknown; sha?: unknown }
  } | null
  const revision =
    payload?.object?.type === "commit" && typeof payload.object.sha === "string"
      ? payload.object.sha
      : ""
  const currentRevision = getBuildRevision()
  if (!isBuildRevision(revision) || !currentRevision)
    throw new Error("Nightly revision unavailable")
  return {
    latestVersion: revision.slice(0, 7),
    updateAvailable: revision !== currentRevision,
    releaseUrl: LATEST_NIGHTLY_RELEASE_URL,
  }
}

/**
 * Detect whether the current installation can safely participate in automatic
 * new-version reminders.
 */
async function detectInstallEligibility(): Promise<DetectInstallEligibilityResult> {
  switch (getDistributionChannel()) {
    case DISTRIBUTION_CHANNEL.FirefoxAmo:
      return { eligible: true, reason: RELEASE_UPDATE_REASONS.FirefoxAmo }
    case DISTRIBUTION_CHANNEL.ChromeWebStore:
    case DISTRIBUTION_CHANNEL.EdgeAddons:
      return { eligible: true, reason: RELEASE_UPDATE_REASONS.StoreBuild }
    case DISTRIBUTION_CHANNEL.GithubRelease:
      return { eligible: true, reason: RELEASE_UPDATE_REASONS.GithubRelease }
    case DISTRIBUTION_CHANNEL.GithubNightly:
      return { eligible: true, reason: RELEASE_UPDATE_REASONS.GithubNightly }
    case DISTRIBUTION_CHANNEL.LocalDevelopment:
      return {
        eligible: true,
        reason: RELEASE_UPDATE_REASONS.ChromiumDevelopment,
      }
  }
  const runtimeUrl = getRuntimeBaseUrl()
  if (runtimeUrl.startsWith("safari-web-extension://")) {
    return { eligible: false, reason: RELEASE_UPDATE_REASONS.SafariUnsupported }
  }

  let info: Awaited<ReturnType<typeof getManagementSelf>> = null
  try {
    info = await getManagementSelf()
  } catch (error) {
    logger.debug("management.getSelf failed", error)
    return {
      eligible: false,
      reason: runtimeUrl.startsWith("moz-extension://")
        ? RELEASE_UPDATE_REASONS.FirefoxAmbiguous
        : RELEASE_UPDATE_REASONS.ApiUnavailable,
    }
  }

  if (!info) {
    return {
      eligible: false,
      reason: runtimeUrl.startsWith("moz-extension://")
        ? RELEASE_UPDATE_REASONS.FirefoxAmbiguous
        : RELEASE_UPDATE_REASONS.ApiUnavailable,
    }
  }

  const installType = info.installType

  if (runtimeUrl.startsWith("moz-extension://")) {
    return {
      eligible: false,
      reason: RELEASE_UPDATE_REASONS.FirefoxAmbiguous,
    }
  }

  if (installType === "development") {
    return {
      eligible: true,
      reason: RELEASE_UPDATE_REASONS.ChromiumDevelopment,
    }
  }

  if (isKnownChromiumStoreBuild()) {
    return { eligible: true, reason: RELEASE_UPDATE_REASONS.StoreBuild }
  }

  return { eligible: false, reason: RELEASE_UPDATE_REASONS.Unknown }
}

/**
 * Initial browser-store state for known Chromium store installs.
 */
function createStoreBuildNotCheckedState(): BrowserStoreUpdateState {
  return {
    supported: true,
    status: BROWSER_STORE_UPDATE_STATUSES.NotChecked,
    version: null,
  }
}

/**
 * Ask the browser-managed store channel whether an update is already available.
 */
async function checkBrowserStoreUpdate(): Promise<BrowserStoreUpdateState> {
  try {
    const result = await requestRuntimeUpdateCheck()
    if (!result) {
      return createDefaultBrowserStoreUpdateState()
    }

    return {
      supported: true,
      status: result.status,
      version: normalizeVersion(result.version),
    }
  } catch (error) {
    logger.warn("Browser store update check failed", error)

    return {
      supported: true,
      status: BROWSER_STORE_UPDATE_STATUSES.Failed,
      version: null,
    }
  }
}

/**
 * Resolve the runtime base URL for browser-family detection.
 */
function getRuntimeBaseUrl(): string {
  try {
    return getExtensionURL("")
  } catch {
    return ""
  }
}

/**
 * Check whether the current Chromium runtime ID matches a known store build.
 */
function isKnownChromiumStoreBuild(): boolean {
  const runtimeId = getRuntimeId()
  if (typeof runtimeId !== "string" || !runtimeId) {
    return false
  }

  return Object.values(EXTENSION_STORE_IDS).includes(runtimeId)
}

/**
 * Fetch the latest stable GitHub release metadata used for comparisons.
 */
async function fetchLatestStableRelease(): Promise<LatestReleaseInfo> {
  const response = await fetch(GITHUB_LATEST_RELEASE_API_URL, {
    headers: {
      Accept: "application/vnd.github+json",
    },
  })

  if (!response.ok) {
    throw new Error(
      `GitHub release request failed with HTTP ${response.status}`,
    )
  }

  const payload = (await response.json()) as Record<string, unknown>
  const latestVersion = normalizeVersion(
    typeof payload.tag_name === "string" && payload.tag_name
      ? payload.tag_name
      : typeof payload.name === "string"
        ? payload.name
        : null,
  )

  if (!latestVersion) {
    throw new Error("Latest stable release payload did not contain a version.")
  }

  return {
    latestVersion,
    releaseUrl:
      typeof payload.html_url === "string" && payload.html_url
        ? payload.html_url
        : LATEST_STABLE_RELEASE_URL,
  }
}

/** AMO's published version is actionable; it does not imply Firefox downloaded it. */
async function fetchLatestAmoRelease(): Promise<LatestReleaseInfo> {
  const response = await fetch(
    "https://addons.mozilla.org/api/v5/addons/addon/%7Bbc73541a-133d-4b50-b261-36ea20df0d24%7D/",
    { credentials: "omit" },
  )
  if (!response.ok)
    throw new Error(`AMO version request failed with HTTP ${response.status}`)
  const payload = (await response.json()) as {
    current_version?: { version?: unknown }
  } | null
  const latestVersion = normalizeVersion(payload?.current_version?.version)
  if (!latestVersion) throw new Error("AMO did not return a published version")
  return { latestVersion, releaseUrl: EXTENSION_STORE_LISTING_URLS.firefox }
}

/**
 * Normalize semver-like version strings into a comparable dotted form.
 */
function normalizeVersion(value: unknown): string | null {
  if (typeof value !== "string") {
    return null
  }

  const normalized = value.trim().replace(/^v/i, "")
  if (!/^\d+(?:\.\d+)*$/.test(normalized)) {
    return null
  }

  return normalized
}

/**
 * Compare two normalized dotted versions numerically.
 */
function compareNormalizedVersions(
  left: string | null,
  right: string | null,
): number {
  if (!left && !right) return 0
  if (!left) return -1
  if (!right) return 1

  const leftParts = left.split(".").map((part) => Number.parseInt(part, 10))
  const rightParts = right.split(".").map((part) => Number.parseInt(part, 10))
  const length = Math.max(leftParts.length, rightParts.length)

  for (let index = 0; index < length; index++) {
    const leftPart = leftParts[index] ?? 0
    const rightPart = rightParts[index] ?? 0

    if (leftPart !== rightPart) {
      return leftPart - rightPart
    }
  }

  return 0
}

/**
 * Compare two release-update status objects for storage write deduplication.
 */
function areStatusesEquivalent(
  left: ReleaseUpdateStatus,
  right: ReleaseUpdateStatus,
): boolean {
  return (
    left.eligible === right.eligible &&
    left.reason === right.reason &&
    left.distributionChannel === right.distributionChannel &&
    left.buildRevision === right.buildRevision &&
    left.currentVersion === right.currentVersion &&
    left.latestVersion === right.latestVersion &&
    left.updateAvailable === right.updateAvailable &&
    left.releaseUrl === right.releaseUrl &&
    left.checkedAt === right.checkedAt &&
    left.lastError === right.lastError &&
    left.githubLatestVersion === right.githubLatestVersion &&
    left.storeUpdate.supported === right.storeUpdate.supported &&
    left.storeUpdate.status === right.storeUpdate.status &&
    left.storeUpdate.version === right.storeUpdate.version
  )
}

export const releaseUpdateService = new ReleaseUpdateService()

let releaseUpdateMessagingCleanup: (() => void)[] | null = null

/**
 * Background listeners for typed release-update messaging.
 */
export function setupReleaseUpdateMessagingListeners() {
  if (releaseUpdateMessagingCleanup) {
    return
  }

  releaseUpdateMessagingCleanup = [
    onReleaseUpdateMessage(ReleaseUpdateMessageTypes.GetStatus, () =>
      resolveReleaseUpdateRuntimeResponse(ReleaseUpdateMessageTypes.GetStatus),
    ),
    onReleaseUpdateMessage(ReleaseUpdateMessageTypes.CheckNow, () =>
      resolveReleaseUpdateRuntimeResponse(ReleaseUpdateMessageTypes.CheckNow),
    ),
  ]
}

type ReleaseUpdateMessageType =
  (typeof ReleaseUpdateMessageTypes)[keyof typeof ReleaseUpdateMessageTypes]

/**
 * Resolve typed release-update messages through the shared service logic.
 */
async function resolveReleaseUpdateRuntimeResponse(
  type: ReleaseUpdateMessageType,
): Promise<ReleaseUpdateRuntimeResponse> {
  try {
    switch (type) {
      case ReleaseUpdateMessageTypes.GetStatus:
        return {
          success: true,
          data: await releaseUpdateService.getStatus(),
        }
      case ReleaseUpdateMessageTypes.CheckNow:
        return {
          success: true,
          data: await releaseUpdateService.checkNow(),
        }
      default:
        return createRuntimeMessageFailure("Unknown message type")
    }
  } catch (error) {
    logger.error("Release update message handling failed", error)
    return createRuntimeMessageFailure(getErrorMessage(error))
  }
}
