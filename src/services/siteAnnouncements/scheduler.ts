import { RuntimeActionIds } from "~/constants/runtimeActions"
import { SITE_TYPES } from "~/constants/siteType"
import { accountStorage } from "~/services/accounts/accountStorage"
import type { ApiServiceRequest } from "~/services/apiService/common/type"
import { userPreferences } from "~/services/preferences/userPreferences"
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
  hasAlarmsAPI,
  onAlarm,
} from "~/utils/browser/browserApi"
import { getErrorMessage } from "~/utils/core/error"
import { createLogger } from "~/utils/core/logger"

import { SITE_ANNOUNCEMENTS_ALARM_NAME } from "./constants"
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

/**
 * Reads the master polling switch. Manual checks bypass this so users can
 * refresh the announcement page on demand even when automatic polling is off.
 */
async function isAutomaticPollingEnabled(): Promise<boolean> {
  const prefs = await userPreferences.getPreferences()
  return normalizeSiteAnnouncementPreferences(
    prefs.siteAnnouncementNotifications,
  ).enabled
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

    if (!config.enabled) {
      await clearAlarm(SITE_ANNOUNCEMENTS_ALARM_NAME)
      return
    }

    await createAlarm(SITE_ANNOUNCEMENTS_ALARM_NAME, {
      periodInMinutes: clampIntervalMinutes(config.intervalMinutes),
      delayInMinutes: 1,
    })
  }

  private async applyScheduleFromPreferences(): Promise<void> {
    const prefs = await userPreferences.getPreferences()
    await this.applySchedule(
      normalizeSiteAnnouncementPreferences(prefs.siteAnnouncementNotifications),
    )
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
      if (params.trigger === "alarm" && !(await isAutomaticPollingEnabled())) {
        return result
      }

      const accounts = params.accountIds?.length
        ? await Promise.all(
            params.accountIds.map((id) => accountStorage.getAccountById(id)),
          ).then((items) =>
            items
              .filter((item): item is SiteAccount => Boolean(item))
              .filter((account) => account.disabled !== true),
          )
        : await accountStorage.getEnabledAccounts()

      for (const account of dedupeCommonAccounts(accounts)) {
        const provider = getSiteAnnouncementProvider(account.site_type)
        const request = createProviderRequest(account, provider)
        const siteKey = provider.createSiteKey({
          accountId: account.id,
          siteType: account.site_type,
          baseUrl: account.site_url,
        })
        const now = Date.now()
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

export const handleSiteAnnouncementMessage = async (
  request: any,
  sendResponse: (response: any) => void,
) => {
  try {
    switch (request.action) {
      case RuntimeActionIds.SiteAnnouncementsGetStatus: {
        sendResponse({
          success: true,
          data: await siteAnnouncementStorage.getStatus(),
        })
        break
      }
      case RuntimeActionIds.SiteAnnouncementsListRecords: {
        sendResponse({
          success: true,
          data: await siteAnnouncementStorage.listRecords(),
        })
        break
      }
      case RuntimeActionIds.SiteAnnouncementsCheckNow: {
        const accountIds = Array.isArray(request.accountIds)
          ? (request.accountIds as string[])
          : undefined
        sendResponse({
          success: true,
          data: await siteAnnouncementScheduler.runManualCheck(accountIds),
        })
        break
      }
      case RuntimeActionIds.SiteAnnouncementsMarkRead: {
        await syncSub2ApiAnnouncementRead(request.recordId)
        sendResponse({
          success: await siteAnnouncementStorage.markRead(request.recordId),
        })
        break
      }
      case RuntimeActionIds.SiteAnnouncementsMarkAllRead: {
        sendResponse({
          success: true,
          data: await siteAnnouncementStorage.markAllRead(request.siteKey),
        })
        break
      }
      case RuntimeActionIds.SiteAnnouncementsUpdatePreferences: {
        sendResponse({
          success: true,
          data: await siteAnnouncementScheduler.updateSettings(
            request.settings ?? {},
          ),
        })
        break
      }
      default:
        sendResponse({ success: false, error: "Unknown action" })
    }
  } catch (error) {
    logger.error("Message handling failed", error)
    sendResponse({ success: false, error: getErrorMessage(error) })
  }
}
