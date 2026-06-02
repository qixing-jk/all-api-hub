import { SITE_TYPES } from "~/constants/siteType"
import { accountStorage } from "~/services/accounts/accountStorage"
import type { ApiServiceRequest } from "~/services/apiService/common/type"
import { userPreferences } from "~/services/preferences/userPreferences"
import { SiteAnnouncementsMessageTypes } from "~/services/runtimeMessaging/messageTypes"
import { createRuntimeMessageFailure } from "~/services/runtimeMessaging/result"
import type { RuntimeMessageResponse } from "~/services/runtimeMessaging/result"
import type { SiteAccount } from "~/types"
import type {
  SiteAnnouncement,
  SiteAnnouncementCheckResult,
  SiteAnnouncementPreferences,
  SiteAnnouncementProvider,
  SiteAnnouncementProviderRequest,
  SiteAnnouncementRecord,
  SiteAnnouncementSiteState,
} from "~/types/siteAnnouncements"
import {
  DEFAULT_SITE_ANNOUNCEMENT_PREFERENCES,
  normalizeSiteAnnouncementPreferences,
  SITE_ANNOUNCEMENT_PROVIDER_IDS,
  SITE_ANNOUNCEMENT_STATUS,
} from "~/types/siteAnnouncements"
import {
  clearAlarm,
  createAlarm,
  getAlarm,
  hasAlarmsAPI,
  onAlarm,
} from "~/utils/browser/browserApi"
import { getErrorMessage } from "~/utils/core/error"
import { createLogger } from "~/utils/core/logger"

import { SITE_ANNOUNCEMENTS_ALARM_NAME } from "./constants"
import {
  onSiteAnnouncementsMessage,
  type SiteAnnouncementsCheckNowRequest,
  type SiteAnnouncementsMarkAllReadRequest,
  type SiteAnnouncementsMarkReadRequest,
  type SiteAnnouncementsUpdatePreferencesRequest,
} from "./messaging"
import { notifySiteAnnouncements } from "./notificationService"
import { getSiteAnnouncementProvider } from "./providers"
import { siteAnnouncementStorage } from "./storage"
import { fingerprintAnnouncement, normalizeAnnouncementText } from "./text"

const logger = createLogger("SiteAnnouncementScheduler")

/**
 * Constrains user-configured polling intervals to the supported range.
 */
function clampIntervalMinutes(value: unknown): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    return DEFAULT_SITE_ANNOUNCEMENT_PREFERENCES.intervalMinutes
  }

  return Math.min(24 * 60, Math.max(15, Math.trunc(parsed)))
}

/**
 * Builds the API request object from a stored account record.
 */
function createApiRequestFromAccount(account: SiteAccount): ApiServiceRequest {
  return {
    baseUrl: account.site_url,
    accountId: account.id,
    auth: {
      authType: account.authType,
      userId: account.account_info?.id,
      accessToken: account.account_info?.access_token,
      cookie: account.cookieAuth?.sessionCookie,
      refreshToken: account.sub2apiAuth?.refreshToken,
      tokenExpiresAt: account.sub2apiAuth?.tokenExpiresAt,
    },
  }
}

/**
 * Creates the provider request context for a specific account.
 */
function createProviderRequest(
  account: SiteAccount,
  provider: SiteAnnouncementProvider,
): SiteAnnouncementProviderRequest {
  return {
    accountId: account.id,
    siteName: account.site_name,
    siteType: account.site_type,
    baseUrl: account.site_url,
    providerId: provider.id,
    apiRequest: createApiRequestFromAccount(account),
  }
}

/**
 * Normalizes a fetched announcement into a persisted record input.
 */
function createRecordInput(params: {
  request: SiteAnnouncementProviderRequest
  siteKey: string
  announcement: SiteAnnouncement
}): Omit<SiteAnnouncementRecord, "id" | "firstSeenAt" | "lastSeenAt" | "read"> {
  const title = normalizeAnnouncementText(params.announcement.title)
  const content = normalizeAnnouncementText(params.announcement.content)
  const fingerprint =
    params.announcement.fingerprint ??
    fingerprintAnnouncement([
      params.announcement.id ?? "",
      title,
      content,
      params.announcement.createdAt ?? "",
      params.announcement.updatedAt ?? "",
    ])

  return {
    siteKey: params.siteKey,
    siteName: params.request.siteName,
    siteType: params.request.siteType,
    baseUrl: params.request.baseUrl,
    accountId: params.request.accountId,
    providerId: params.request.providerId,
    upstreamId: params.announcement.id,
    title,
    content,
    createdAt: params.announcement.createdAt,
    updatedAt: params.announcement.updatedAt,
    fingerprint,
  }
}

/**
 * Creates the persisted status snapshot for a checked site.
 */
function createSiteState(params: {
  request: SiteAnnouncementProviderRequest
  siteKey: string
  status: SiteAnnouncementSiteState["status"]
  error?: string
  now: number
}): Omit<SiteAnnouncementSiteState, "records"> {
  return {
    siteKey: params.siteKey,
    siteName: params.request.siteName,
    siteType: params.request.siteType,
    baseUrl: params.request.baseUrl,
    accountId: params.request.accountId,
    providerId: params.request.providerId,
    status: params.status,
    lastCheckedAt: params.now,
    lastSuccessAt:
      params.status === SITE_ANNOUNCEMENT_STATUS.Success
        ? params.now
        : undefined,
    lastError: params.error,
  }
}

/**
 * Returns the timestamp when a site's cooldown expires, if it has been checked.
 */
function getAnnouncementCooldownExpiresAt(params: {
  siteState: Pick<SiteAnnouncementSiteState, "lastCheckedAt">
  intervalMinutes: number
}): number | null {
  const lastCheckedAt = params.siteState.lastCheckedAt
  if (typeof lastCheckedAt !== "number") {
    return null
  }

  return (
    lastCheckedAt + clampIntervalMinutes(params.intervalMinutes) * 60 * 1000
  )
}

/**
 * Returns whether a site announcement check is still inside its cooldown window.
 */
function isWithinAnnouncementCooldown(params: {
  siteState: Pick<SiteAnnouncementSiteState, "lastCheckedAt">
  now: number
  intervalMinutes: number
}): boolean {
  const expiresAt = getAnnouncementCooldownExpiresAt(params)
  return expiresAt != null && params.now < expiresAt
}

/**
 * Recreates the site announcement alarm with a specific first-run delay.
 */
async function rescheduleAnnouncementAlarm(params: {
  intervalMinutes: number
  delayInMinutes: number
}): Promise<void> {
  await clearAlarm(SITE_ANNOUNCEMENTS_ALARM_NAME)
  await createAlarm(SITE_ANNOUNCEMENTS_ALARM_NAME, {
    periodInMinutes: params.intervalMinutes,
    delayInMinutes: params.delayInMinutes,
  })
}

/**
 * Chooses the next alarm delay from persisted site cooldowns.
 */
function getAnnouncementAlarmDelayMinutes(params: {
  intervalMinutes: number
  siteStates: SiteAnnouncementSiteState[]
  accounts: SiteAccount[]
}): number {
  const now = Date.now()
  let nextDelayMinutes = Number.POSITIVE_INFINITY
  const accounts = dedupeCommonAccounts(params.accounts)
  const enabledSiteKeys = new Set(
    accounts.map((account) => {
      const provider = getSiteAnnouncementProvider(account.site_type)
      return provider.createSiteKey({
        accountId: account.id,
        siteType: account.site_type,
        baseUrl: account.site_url,
      })
    }),
  )
  const siteKeysWithStatus = new Set(
    params.siteStates
      .filter((siteState) => enabledSiteKeys.has(siteState.siteKey))
      .map((siteState) => siteState.siteKey),
  )

  for (const account of accounts) {
    const provider = getSiteAnnouncementProvider(account.site_type)
    const siteKey = provider.createSiteKey({
      accountId: account.id,
      siteType: account.site_type,
      baseUrl: account.site_url,
    })
    if (!siteKeysWithStatus.has(siteKey)) {
      return 1
    }
  }

  for (const siteState of params.siteStates) {
    if (!enabledSiteKeys.has(siteState.siteKey)) {
      continue
    }

    const expiresAt = getAnnouncementCooldownExpiresAt({
      siteState,
      intervalMinutes: params.intervalMinutes,
    })
    if (expiresAt == null) {
      continue
    }

    nextDelayMinutes = Math.min(
      nextDelayMinutes,
      Math.max(1, Math.ceil((expiresAt - now) / 60_000)),
    )
  }

  return Number.isFinite(nextDelayMinutes) ? nextDelayMinutes : 1
}

/**
 * Removes duplicate common-provider accounts that share one announcement source.
 */
function dedupeCommonAccounts(accounts: SiteAccount[]): SiteAccount[] {
  const seen = new Set<string>()
  const result: SiteAccount[] = []

  for (const account of accounts) {
    if (account.site_type === SITE_TYPES.SUB2API) {
      result.push(account)
      continue
    }

    const provider = getSiteAnnouncementProvider(account.site_type)
    const key = provider.createSiteKey({
      accountId: account.id,
      siteType: account.site_type,
      baseUrl: account.site_url,
    })
    if (seen.has(key)) {
      continue
    }

    seen.add(key)
    result.push(account)
  }

  return result
}

class SiteAnnouncementScheduler {
  private isInitialized = false
  private isRunning = false

  async initialize() {
    if (this.isInitialized) {
      return
    }

    onAlarm(async (alarm) => {
      if (alarm.name !== SITE_ANNOUNCEMENTS_ALARM_NAME) {
        return
      }

      await this.runCheck({ trigger: "alarm" })
    })

    await this.applyScheduleFromPreferences()
    this.isInitialized = true
  }

  private async applySchedule(
    config: SiteAnnouncementPreferences,
  ): Promise<void> {
    if (!hasAlarmsAPI()) {
      logger.warn("Alarms API unavailable; site announcement polling disabled")
      return
    }

    const intervalMinutes = clampIntervalMinutes(config.intervalMinutes)

    if (!config.enabled) {
      await clearAlarm(SITE_ANNOUNCEMENTS_ALARM_NAME)
      return
    }

    const siteStates = await siteAnnouncementStorage.getStatus()
    const accounts = await accountStorage.getEnabledAccounts()
    const delayInMinutes = getAnnouncementAlarmDelayMinutes({
      intervalMinutes,
      siteStates,
      accounts,
    })
    const existingAlarm = await getAlarm(SITE_ANNOUNCEMENTS_ALARM_NAME)
    if (
      existingAlarm &&
      existingAlarm.periodInMinutes != null &&
      Math.abs(existingAlarm.periodInMinutes - intervalMinutes) < 0.001 &&
      existingAlarm.scheduledTime != null &&
      existingAlarm.scheduledTime <= Date.now() + delayInMinutes * 60_000
    ) {
      return
    }

    await rescheduleAnnouncementAlarm({
      intervalMinutes,
      delayInMinutes,
    })
  }

  private async applyScheduleFromPreferences(): Promise<void> {
    const prefs = await userPreferences.getPreferences()
    await this.applySchedule(
      normalizeSiteAnnouncementPreferences(prefs.siteAnnouncementNotifications),
    )
  }

  async reconcileScheduleFromPreferences(): Promise<void> {
    await this.applyScheduleFromPreferences()
  }

  async updateSettings(
    updates: Partial<SiteAnnouncementPreferences>,
  ): Promise<SiteAnnouncementPreferences> {
    const prefs = await userPreferences.getPreferences()
    const current = normalizeSiteAnnouncementPreferences(
      prefs.siteAnnouncementNotifications,
    )
    const next: SiteAnnouncementPreferences = {
      ...current,
      ...updates,
      intervalMinutes: clampIntervalMinutes(
        updates.intervalMinutes ?? current.intervalMinutes,
      ),
    }

    await userPreferences.savePreferences({
      siteAnnouncementNotifications: next,
    })
    await this.applySchedule(next)
    return next
  }

  async runManualCheck(accountIds?: string[]) {
    return await this.runCheck({ trigger: "manual", accountIds })
  }

  private async runCheck(params: {
    trigger: "alarm" | "manual"
    accountIds?: string[]
  }): Promise<SiteAnnouncementCheckResult | null> {
    if (this.isRunning) {
      return null
    }

    this.isRunning = true
    const result: SiteAnnouncementCheckResult = {
      checked: 0,
      created: 0,
      notified: 0,
      failed: 0,
      unsupported: 0,
      records: [],
    }

    try {
      const automaticPollingPreferences =
        params.trigger === "alarm"
          ? normalizeSiteAnnouncementPreferences(
              (await userPreferences.getPreferences())
                .siteAnnouncementNotifications,
            )
          : undefined

      if (params.trigger === "alarm" && !automaticPollingPreferences?.enabled) {
        return result
      }

      const siteStatesByKey =
        params.trigger === "alarm"
          ? new Map(
              (await siteAnnouncementStorage.getStatus()).map((site) => [
                site.siteKey,
                site,
              ]),
            )
          : undefined

      const accounts = params.accountIds?.length
        ? await Promise.all(
            params.accountIds.map((id) => accountStorage.getAccountById(id)),
          ).then((items) =>
            items
              .filter((item): item is SiteAccount => Boolean(item))
              .filter((account) => account.disabled !== true),
          )
        : await accountStorage.getEnabledAccounts()
      let nextCooldownExpiresAt: number | undefined

      for (const account of dedupeCommonAccounts(accounts)) {
        const provider = getSiteAnnouncementProvider(account.site_type)
        const request = createProviderRequest(account, provider)
        const siteKey = provider.createSiteKey({
          accountId: account.id,
          siteType: account.site_type,
          baseUrl: account.site_url,
        })
        const now = Date.now()
        const existingSiteState = siteStatesByKey?.get(siteKey)

        if (
          params.trigger === "alarm" &&
          automaticPollingPreferences &&
          existingSiteState &&
          isWithinAnnouncementCooldown({
            siteState: existingSiteState,
            now,
            intervalMinutes: automaticPollingPreferences.intervalMinutes,
          })
        ) {
          const cooldownExpiresAt = getAnnouncementCooldownExpiresAt({
            siteState: existingSiteState,
            intervalMinutes: automaticPollingPreferences.intervalMinutes,
          })
          if (cooldownExpiresAt != null) {
            nextCooldownExpiresAt = Math.min(
              nextCooldownExpiresAt ?? cooldownExpiresAt,
              cooldownExpiresAt,
            )
          }

          logger.debug("Skipping site announcement check within cooldown", {
            siteKey,
            intervalMinutes: automaticPollingPreferences.intervalMinutes,
            lastCheckedAt: existingSiteState.lastCheckedAt ?? null,
          })
          continue
        }

        result.checked += 1

        try {
          const checkResult = await provider.fetch(request)
          const siteState = createSiteState({
            request,
            siteKey,
            status: checkResult.status,
            error: checkResult.error,
            now,
          })

          if (checkResult.status === SITE_ANNOUNCEMENT_STATUS.Error) {
            result.failed += 1
          } else if (
            checkResult.status === SITE_ANNOUNCEMENT_STATUS.Unsupported
          ) {
            result.unsupported += 1
          }

          const createdRecords =
            await siteAnnouncementStorage.upsertDiscoveredRecords({
              site: siteState,
              records: checkResult.announcements.map((announcement) =>
                createRecordInput({
                  request,
                  siteKey,
                  announcement,
                }),
              ),
              now,
            })

          result.created += createdRecords.length
          result.records.push(...createdRecords)

          if (createdRecords.length > 0) {
            const notification = await notifySiteAnnouncements(createdRecords)
            await siteAnnouncementStorage.updateNotificationState(
              siteKey,
              createdRecords.map((record) => record.id),
              {
                notifiedAt: notification.success ? Date.now() : undefined,
                notificationError: notification.error,
              },
            )

            if (notification.success) {
              result.notified += createdRecords.length
              // Ack every item in checkResult.announcements, not just createdRecords,
              // so provider.markRead can stop returning already-seen unread payloads.
              await provider.markRead?.(request, checkResult.announcements)
            }
          }
        } catch (error) {
          result.failed += 1
          await siteAnnouncementStorage.recordFailure({
            siteKey,
            siteName: account.site_name,
            siteType: account.site_type,
            baseUrl: account.site_url,
            accountId: account.id,
            providerId: provider.id,
            status: SITE_ANNOUNCEMENT_STATUS.Error,
            error: getErrorMessage(error),
            now,
          })
        }
      }

      if (
        params.trigger === "alarm" &&
        automaticPollingPreferences?.enabled &&
        nextCooldownExpiresAt != null
      ) {
        const intervalMinutes = clampIntervalMinutes(
          automaticPollingPreferences.intervalMinutes,
        )
        const delayInMinutes = Math.max(
          1,
          Math.ceil((nextCooldownExpiresAt - Date.now()) / 60_000),
        )
        await rescheduleAnnouncementAlarm({
          intervalMinutes,
          delayInMinutes,
        })
      }

      return result
    } catch (error) {
      logger.error("Site announcement check failed", error)
      return null
    } finally {
      this.isRunning = false
    }
  }
}

export const siteAnnouncementScheduler = new SiteAnnouncementScheduler()

let siteAnnouncementsMessagingCleanup: (() => void)[] | null = null

/**
 * Register typed background listeners for site-announcement messages.
 */
export function setupSiteAnnouncementsMessagingListeners() {
  if (siteAnnouncementsMessagingCleanup) {
    return
  }

  siteAnnouncementsMessagingCleanup = [
    onSiteAnnouncementsMessage(SiteAnnouncementsMessageTypes.GetStatus, () =>
      resolveSiteAnnouncementsGetStatusMessage(),
    ),
    onSiteAnnouncementsMessage(SiteAnnouncementsMessageTypes.ListRecords, () =>
      resolveSiteAnnouncementsListRecordsMessage(),
    ),
    onSiteAnnouncementsMessage(
      SiteAnnouncementsMessageTypes.CheckNow,
      ({ data }) => resolveSiteAnnouncementsCheckNowMessage(data),
    ),
    onSiteAnnouncementsMessage(
      SiteAnnouncementsMessageTypes.MarkRead,
      ({ data }) => resolveSiteAnnouncementsMarkReadMessage(data),
    ),
    onSiteAnnouncementsMessage(
      SiteAnnouncementsMessageTypes.MarkAllRead,
      ({ data }) => resolveSiteAnnouncementsMarkAllReadMessage(data),
    ),
    onSiteAnnouncementsMessage(
      SiteAnnouncementsMessageTypes.UpdatePreferences,
      ({ data }) => resolveSiteAnnouncementsUpdatePreferencesMessage(data),
    ),
  ]
}

/**
 * Mirrors local Sub2API read actions back to the upstream announcement API.
 */
async function syncSub2ApiAnnouncementRead(recordId: string): Promise<void> {
  const record = (await siteAnnouncementStorage.listRecords()).find(
    (item) => item.id === recordId,
  )
  if (
    !record ||
    record.siteType !== SITE_TYPES.SUB2API ||
    record.providerId !== SITE_ANNOUNCEMENT_PROVIDER_IDS.Sub2Api ||
    !record.upstreamId
  ) {
    return
  }

  const account = await accountStorage.getAccountById(record.accountId)
  if (!account) {
    logger.warn(
      "Cannot sync Sub2API announcement read state; account missing",
      {
        recordId,
        accountId: record.accountId,
      },
    )
    return
  }

  const service = getSiteAnnouncementProvider(SITE_TYPES.SUB2API)
  await service.markRead?.(createProviderRequest(account, service), [
    { id: record.upstreamId },
  ])
}

/**
 * Resolve a typed request for site-announcement status.
 */
export async function resolveSiteAnnouncementsGetStatusMessage(): Promise<
  RuntimeMessageResponse<SiteAnnouncementSiteState[]>
> {
  try {
    try {
      await siteAnnouncementScheduler.reconcileScheduleFromPreferences()
    } catch (error) {
      logger.warn("Failed to reconcile site announcement schedule", error)
    }
    return {
      success: true,
      data: await siteAnnouncementStorage.getStatus(),
    }
  } catch (error) {
    logger.error("Message handling failed", error)
    return createRuntimeMessageFailure(getErrorMessage(error))
  }
}

/**
 * Resolve a typed request for locally cached announcement records.
 */
export async function resolveSiteAnnouncementsListRecordsMessage(): Promise<
  RuntimeMessageResponse<SiteAnnouncementRecord[]>
> {
  try {
    return {
      success: true,
      data: await siteAnnouncementStorage.listRecords(),
    }
  } catch (error) {
    logger.error("Message handling failed", error)
    return createRuntimeMessageFailure(getErrorMessage(error))
  }
}

/**
 * Resolve a typed request to check site announcements immediately.
 */
export async function resolveSiteAnnouncementsCheckNowMessage(
  request?: SiteAnnouncementsCheckNowRequest,
): Promise<RuntimeMessageResponse<SiteAnnouncementCheckResult | null>> {
  try {
    const accountIds = Array.isArray(request?.accountIds)
      ? request.accountIds
      : undefined
    return {
      success: true,
      data: await siteAnnouncementScheduler.runManualCheck(accountIds),
    }
  } catch (error) {
    logger.error("Message handling failed", error)
    return createRuntimeMessageFailure(getErrorMessage(error))
  }
}

/**
 * Resolve a typed request to mark one announcement record as read.
 */
export async function resolveSiteAnnouncementsMarkReadMessage(
  request: SiteAnnouncementsMarkReadRequest,
): Promise<RuntimeMessageResponse<undefined>> {
  try {
    await syncSub2ApiAnnouncementRead(request.recordId)
    return (await siteAnnouncementStorage.markRead(request.recordId))
      ? ({ success: true, data: undefined } as const)
      : createRuntimeMessageFailure("Failed to mark announcement as read")
  } catch (error) {
    logger.error("Message handling failed", error)
    return createRuntimeMessageFailure(getErrorMessage(error))
  }
}

/**
 * Resolve a typed request to mark all matching announcement records as read.
 */
export async function resolveSiteAnnouncementsMarkAllReadMessage(
  request: SiteAnnouncementsMarkAllReadRequest,
): Promise<RuntimeMessageResponse<number>> {
  try {
    return {
      success: true,
      data: await siteAnnouncementStorage.markAllRead(request.siteKey),
    }
  } catch (error) {
    logger.error("Message handling failed", error)
    return createRuntimeMessageFailure(getErrorMessage(error))
  }
}

/**
 * Resolve a typed request to update site-announcement preferences.
 */
export async function resolveSiteAnnouncementsUpdatePreferencesMessage(
  request: SiteAnnouncementsUpdatePreferencesRequest,
): Promise<RuntimeMessageResponse<SiteAnnouncementPreferences>> {
  try {
    return {
      success: true,
      data: await siteAnnouncementScheduler.updateSettings(
        request.settings ?? {},
      ),
    }
  } catch (error) {
    logger.error("Message handling failed", error)
    return createRuntimeMessageFailure(getErrorMessage(error))
  }
}
