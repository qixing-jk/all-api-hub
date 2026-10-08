import { accountQueries } from "~/services/accounts/accountStorage/accountQueries"
import { userPreferences } from "~/services/preferences/userPreferences"
import {
  createHandlerRequest,
  TRIGGER_REQUEST_PRIORITIES,
} from "~/services/siteAnnouncements/handlerRequest"
import {
  getAnnouncementCooldownExpiresAt,
  isWithinAnnouncementCooldown,
  type rescheduleAnnouncementAlarm,
} from "~/services/siteAnnouncements/pollingSchedule"
import type { SiteAccount } from "~/types"
import type {
  AnnouncementSourceHandlerRequest,
  SiteAnnouncement,
  SiteAnnouncementCheckResult,
  SiteAnnouncementRecord,
  SiteAnnouncementRecordInput,
  SiteAnnouncementSiteState,
} from "~/types/siteAnnouncements"
import {
  clampPollingIntervalMinutes,
  normalizeSiteAnnouncementPreferences,
  SITE_ANNOUNCEMENT_CHECK_TRIGGERS,
  SITE_ANNOUNCEMENT_STATUS,
  type SiteAnnouncementCheckTrigger,
} from "~/types/siteAnnouncements"
import { getErrorMessage } from "~/utils/core/error"
import { createLogger } from "~/utils/core/logger"

import { notifySiteAnnouncements } from "./notificationService"
import { resolveAnnouncementSources } from "./sources"
import { siteAnnouncementStorage } from "./storage"
import { fingerprintAnnouncement, normalizeAnnouncementText } from "./text"

const logger = createLogger("SiteAnnouncementScheduler")

const MS_PER_DAY = 24 * 60 * 60 * 1000

/**
 * Normalizes a fetched announcement into a persisted record input.
 */
function createRecordInput(params: {
  request: AnnouncementSourceHandlerRequest
  siteKey: string
  announcement: SiteAnnouncement
}): SiteAnnouncementRecordInput {
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
    sourceScope: params.request.sourceScope,
    upstreamId: params.announcement.id,
    title,
    content,
    createdAt: params.announcement.createdAt,
    updatedAt: params.announcement.updatedAt,
    readAt: params.announcement.readAt,
    read: params.announcement.read,
    fingerprint,
  }
}

/**
 * Splits freshly stored records into news and history.
 *
 * A site's first successful scan only establishes a baseline: everything it
 * returns predates the user's decision to track that site, so none of it is
 * news. On later scans, announcements published before the notification age
 * window are history too. Records without an upstream timestamp cannot be aged
 * and stay news, because their handler only ever reports the current notice.
 */
function partitionAnnouncementRecords(params: {
  records: SiteAnnouncementRecord[]
  isFirstScan: boolean
  maxAgeDays: number
  now: number
}): {
  news: SiteAnnouncementRecord[]
  history: SiteAnnouncementRecord[]
} {
  if (params.isFirstScan) {
    return { news: [], history: [...params.records] }
  }

  const oldestNewsAt = params.now - params.maxAgeDays * MS_PER_DAY
  const news: SiteAnnouncementRecord[] = []
  const history: SiteAnnouncementRecord[] = []

  for (const record of params.records) {
    const isOutdated =
      typeof record.createdAt === "number" && record.createdAt < oldestNewsAt
    if (isOutdated) {
      history.push(record)
    } else {
      news.push(record)
    }
  }

  return { news, history }
}

/**
 * Creates the persisted status snapshot for a checked site.
 */
function createSiteState(params: {
  request: AnnouncementSourceHandlerRequest
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
    sourceScope: params.request.sourceScope,
    status: params.status,
    lastCheckedAt: params.now,
    lastSuccessAt:
      params.status === SITE_ANNOUNCEMENT_STATUS.Success
        ? params.now
        : undefined,
    lastError: params.error,
  }
}
export class SiteAnnouncementCheckWorkflow {
  private isRunning = false
  constructor(
    private readonly rescheduleAlarm: typeof rescheduleAnnouncementAlarm,
  ) {}
  async run(params: {
    trigger: SiteAnnouncementCheckTrigger
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
      const pollingPreferences = normalizeSiteAnnouncementPreferences(
        (await userPreferences.getPreferences()).siteAnnouncementNotifications,
      )

      if (
        params.trigger === SITE_ANNOUNCEMENT_CHECK_TRIGGERS.Alarm &&
        !pollingPreferences.enabled
      ) {
        return result
      }

      const siteStatesByKey = new Map(
        (await siteAnnouncementStorage.getStatus()).map((site) => [
          site.siteKey,
          site,
        ]),
      )

      const accounts = params.accountIds?.length
        ? await Promise.all(
            params.accountIds.map((id) => accountQueries.getAccountById(id)),
          ).then((items) =>
            items
              .filter((item): item is SiteAccount => Boolean(item))
              .filter((account) => account.disabled !== true),
          )
        : await accountQueries.getEnabledAccounts()
      let nextCooldownExpiresAt: number | undefined

      for (const { account, handler, siteKey } of resolveAnnouncementSources(
        accounts,
      )) {
        const request = createHandlerRequest(
          account,
          handler,
          TRIGGER_REQUEST_PRIORITIES[params.trigger],
        )
        const now = Date.now()
        const existingSiteState = siteStatesByKey.get(siteKey)
        // The first successful scan of a site only records what already exists
        // there; nothing it finds can be news the user has not seen.
        const isFirstScan = existingSiteState?.lastSuccessAt === undefined

        if (
          params.trigger === SITE_ANNOUNCEMENT_CHECK_TRIGGERS.Alarm &&
          existingSiteState &&
          isWithinAnnouncementCooldown({
            siteState: existingSiteState,
            now,
            intervalMinutes: pollingPreferences.intervalMinutes,
          })
        ) {
          const cooldownExpiresAt = getAnnouncementCooldownExpiresAt({
            siteState: existingSiteState,
            intervalMinutes: pollingPreferences.intervalMinutes,
          })
          if (cooldownExpiresAt != null) {
            nextCooldownExpiresAt = Math.min(
              nextCooldownExpiresAt ?? cooldownExpiresAt,
              cooldownExpiresAt,
            )
          }

          logger.debug("Skipping site announcement check within cooldown", {
            siteKey,
            intervalMinutes: pollingPreferences.intervalMinutes,
            lastCheckedAt: existingSiteState.lastCheckedAt ?? null,
          })
          continue
        }

        result.checked += 1

        try {
          const checkResult = await handler.fetch(request)
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
            const { news, history } = partitionAnnouncementRecords({
              records: createdRecords,
              isFirstScan,
              maxAgeDays: pollingPreferences.notificationMaxAgeDays,
              now,
            })

            if (history.length > 0) {
              await siteAnnouncementStorage.markRecordIdentitiesRead(history)
            }

            // A manual check means the user is already looking at the page it
            // refreshes, so it never notifies.
            if (
              news.length > 0 &&
              params.trigger !== SITE_ANNOUNCEMENT_CHECK_TRIGGERS.Manual
            ) {
              const notification = await notifySiteAnnouncements(news)
              await siteAnnouncementStorage.updateNotificationState(
                siteKey,
                news.map((record) => record.id),
                {
                  notifiedAt: notification.success ? Date.now() : undefined,
                  notificationError: notification.error,
                },
              )

              if (notification.success) {
                result.notified += news.length
                // Only an explicit opt-in acks the upstream unread state,
                // because delivering a notification is not the same as the user
                // having read the announcement.
                if (pollingPreferences.autoMarkUpstreamReadOnNotify) {
                  // Ack every item in checkResult.announcements, not just
                  // createdRecords, so handler.markRead can stop returning
                  // already-seen unread payloads.
                  await handler.markRead?.(request, checkResult.announcements)
                }
              }
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
            sourceScope: handler.scope,
            status: SITE_ANNOUNCEMENT_STATUS.Error,
            error: getErrorMessage(error),
            now,
          })
        }
      }

      if (
        params.trigger === SITE_ANNOUNCEMENT_CHECK_TRIGGERS.Alarm &&
        pollingPreferences.enabled &&
        nextCooldownExpiresAt != null
      ) {
        const intervalMinutes = clampPollingIntervalMinutes(
          pollingPreferences.intervalMinutes,
        )
        const delayInMinutes = Math.max(
          1,
          Math.ceil((nextCooldownExpiresAt - Date.now()) / 60_000),
        )
        await this.rescheduleAlarm({
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
