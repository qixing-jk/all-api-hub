import { Storage } from "@plasmohq/storage"

import { EXTENSION_STORE_IDS } from "~/constants/extensionStores"
import { RuntimeActionIds } from "~/constants/runtimeActions"
import { STORAGE_KEYS, STORAGE_LOCKS } from "~/services/core/storageKeys"
import { withExtensionStorageWriteLock } from "~/services/core/storageWriteLock"
import {
  createAlarm,
  getAlarm,
  getManifest,
  hasAlarmsAPI,
  onAlarm,
} from "~/utils/browser/browserApi"
import { getErrorMessage } from "~/utils/core/error"
import { createLogger } from "~/utils/core/logger"

import {
  createDefaultReleaseUpdateStatus,
  LATEST_STABLE_RELEASE_URL,
  RELEASE_UPDATE_REASONS,
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
}

class ReleaseUpdateService {
  static readonly ALARM_NAME = "releaseUpdateDailyCheck"

  private storage: Storage
  private isInitialized = false

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

    if (hasAlarmsAPI()) {
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

      await this.setupAlarm()
    } else {
      logger.warn("Alarms API not available; automatic release checks disabled")
    }

    await this.ensureBaseStatus()
    this.isInitialized = true
  }

  async getStatus(): Promise<ReleaseUpdateStatus> {
    return await this.ensureBaseStatus()
  }

  async checkNow(): Promise<ReleaseUpdateStatus> {
    const base = await this.ensureBaseStatus()
    return await this.refreshStatus(base, { allowNetwork: true })
  }

  private async runScheduledCheck(): Promise<ReleaseUpdateStatus> {
    const base = await this.ensureBaseStatus()
    if (!base.eligible) {
      return base
    }

    return await this.refreshStatus(base, { allowNetwork: true })
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
    const stored = await this.readStoredStatus()
    const next = await this.buildBaseStatus(stored)

    if (!stored || !areStatusesEquivalent(stored, next)) {
      await this.writeStatus(next)
    }

    return next
  }

  private async refreshStatus(
    base: ReleaseUpdateStatus,
    options?: { allowNetwork?: boolean },
  ): Promise<ReleaseUpdateStatus> {
    if (!options?.allowNetwork) {
      return base
    }

    try {
      const latestRelease = await fetchLatestStableRelease()
      const next: ReleaseUpdateStatus = {
        ...base,
        latestVersion: latestRelease.latestVersion,
        updateAvailable:
          compareNormalizedVersions(
            normalizeVersion(base.currentVersion),
            latestRelease.latestVersion,
          ) < 0,
        releaseUrl: latestRelease.releaseUrl,
        checkedAt: Date.now(),
        lastError: null,
      }

      await this.writeStatus(next)
      return next
    } catch (error) {
      logger.warn("Failed to fetch latest stable release", error)

      const next: ReleaseUpdateStatus = {
        ...base,
        lastError: getErrorMessage(error),
      }

      await this.writeStatus(next)
      return next
    }
  }

  private async buildBaseStatus(
    stored: ReleaseUpdateStatus | null,
  ): Promise<ReleaseUpdateStatus> {
    const currentVersion = getCurrentManifestVersion()
    const detected = await detectInstallEligibility()
    const fallback = createDefaultReleaseUpdateStatus(currentVersion)
    const isSameVersion = stored?.currentVersion === currentVersion

    return {
      ...fallback,
      eligible: detected.eligible,
      reason: detected.reason,
      latestVersion: isSameVersion ? stored?.latestVersion ?? null : null,
      updateAvailable:
        isSameVersion && detected.eligible
          ? stored?.updateAvailable ?? false
          : false,
      releaseUrl: stored?.releaseUrl ?? fallback.releaseUrl,
      checkedAt: isSameVersion ? stored?.checkedAt ?? null : null,
      lastError: isSameVersion ? stored?.lastError ?? null : null,
    }
  }

  private async readStoredStatus(): Promise<ReleaseUpdateStatus | null> {
    const raw = (await this.storage.get(
      STORAGE_KEYS.RELEASE_UPDATE_STATUS,
    )) as unknown

    return parseReleaseUpdateStatus(raw)
  }

  private async writeStatus(status: ReleaseUpdateStatus): Promise<void> {
    await withExtensionStorageWriteLock(STORAGE_LOCKS.RELEASE_UPDATE, () =>
      this.storage.set(STORAGE_KEYS.RELEASE_UPDATE_STATUS, status),
    )
  }
}

/**
 * Detect whether the current installation can safely participate in automatic
 * new-version reminders.
 */
async function detectInstallEligibility(): Promise<DetectInstallEligibilityResult> {
  const runtimeUrl = getRuntimeBaseUrl()
  if (runtimeUrl.startsWith("safari-web-extension://")) {
    return { eligible: false, reason: RELEASE_UPDATE_REASONS.SafariUnsupported }
  }

  const getSelf = (browser as any)?.management?.getSelf as
    | (() => Promise<{ installType?: string }>)
    | undefined

  if (typeof getSelf !== "function") {
    return {
      eligible: false,
      reason: runtimeUrl.startsWith("moz-extension://")
        ? RELEASE_UPDATE_REASONS.FirefoxAmbiguous
        : RELEASE_UPDATE_REASONS.ApiUnavailable,
    }
  }

  try {
    const info = await getSelf()
    const installType = info?.installType

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
      return { eligible: false, reason: RELEASE_UPDATE_REASONS.StoreBuild }
    }

    return { eligible: false, reason: RELEASE_UPDATE_REASONS.Unknown }
  } catch (error) {
    logger.debug("management.getSelf failed", error)
    return {
      eligible: false,
      reason: runtimeUrl.startsWith("moz-extension://")
        ? RELEASE_UPDATE_REASONS.FirefoxAmbiguous
        : RELEASE_UPDATE_REASONS.ApiUnavailable,
    }
  }
}

/**
 * Read the packaged extension version from the runtime manifest.
 */
function getCurrentManifestVersion(): string {
  return getManifest().version?.trim() || "0.0.0"
}

/**
 * Resolve the runtime base URL for browser-family detection.
 */
function getRuntimeBaseUrl(): string {
  try {
    return browser.runtime.getURL("")
  } catch {
    return ""
  }
}

/**
 * Check whether the current Chromium runtime ID matches a known store build.
 */
function isKnownChromiumStoreBuild(): boolean {
  const runtimeId = browser.runtime?.id
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

/**
 * Normalize semver-like version strings into a comparable dotted form.
 */
function normalizeVersion(value: string | null | undefined): string | null {
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
    left.currentVersion === right.currentVersion &&
    left.latestVersion === right.latestVersion &&
    left.updateAvailable === right.updateAvailable &&
    left.releaseUrl === right.releaseUrl &&
    left.checkedAt === right.checkedAt &&
    left.lastError === right.lastError
  )
}

export const releaseUpdateService = new ReleaseUpdateService()

/**
 * Background runtime handler for release-update status queries and manual checks.
 */
export const handleReleaseUpdateMessage = async (
  request: { action?: string },
  sendResponse: (response: {
    success: boolean
    data?: ReleaseUpdateStatus
    error?: string
  }) => void,
) => {
  try {
    switch (request.action) {
      case RuntimeActionIds.ReleaseUpdateGetStatus: {
        sendResponse({
          success: true,
          data: await releaseUpdateService.getStatus(),
        })
        break
      }
      case RuntimeActionIds.ReleaseUpdateCheckNow: {
        sendResponse({
          success: true,
          data: await releaseUpdateService.checkNow(),
        })
        break
      }
      default:
        sendResponse({ success: false, error: "Unknown action" })
    }
  } catch (error) {
    logger.error("Release update message handling failed", error)
    sendResponse({
      success: false,
      error: getErrorMessage(error),
    })
  }
}
