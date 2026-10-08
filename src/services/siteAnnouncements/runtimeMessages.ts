import { accountQueries } from "~/services/accounts/accountStorage/accountQueries"
import { SiteAnnouncementsMessageTypes } from "~/services/runtimeMessaging/messageTypes"
import { createRuntimeMessageFailure } from "~/services/runtimeMessaging/result"
import type { RuntimeMessageResponse } from "~/services/runtimeMessaging/result"
import {
  createHandlerRequest,
  TRIGGER_REQUEST_PRIORITIES,
} from "~/services/siteAnnouncements/handlerRequest"
import { siteAnnouncementScheduler } from "~/services/siteAnnouncements/scheduler"
import type {
  SiteAnnouncementCheckResult,
  SiteAnnouncementPreferences,
  SiteAnnouncementRecordView,
  SiteAnnouncementSiteState,
} from "~/types/siteAnnouncements"
import { SITE_ANNOUNCEMENT_CHECK_TRIGGERS } from "~/types/siteAnnouncements"
import { getErrorMessage } from "~/utils/core/error"
import { createLogger } from "~/utils/core/logger"

import {
  resolveSiteAnnouncementsDebugClearFixturesMessage,
  resolveSiteAnnouncementsDebugSeedFixturesMessage,
} from "./devFixtures"
import {
  onSiteAnnouncementsMessage,
  type SiteAnnouncementsCheckNowRequest,
  type SiteAnnouncementsMarkAllReadRequest,
  type SiteAnnouncementsMarkReadRequest,
  type SiteAnnouncementsUpdatePreferencesRequest,
} from "./messaging"
import {
  getAnnouncementRecordViews,
  resolveAnnouncementSource,
} from "./sources"
import { siteAnnouncementStorage } from "./storage"

const logger = createLogger("SiteAnnouncementScheduler")

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
    onSiteAnnouncementsMessage(
      SiteAnnouncementsMessageTypes.DebugSeedFixtures,
      ({ data }) => resolveSiteAnnouncementsDebugSeedFixturesMessage(data),
    ),
    onSiteAnnouncementsMessage(
      SiteAnnouncementsMessageTypes.DebugClearFixtures,
      () => resolveSiteAnnouncementsDebugClearFixturesMessage(),
    ),
  ]
}

/**
 * Mirrors read actions through the matching handler when it supports upstream acknowledgement.
 */
async function syncSiteAnnouncementRead(recordId: string): Promise<void> {
  const record = (await siteAnnouncementStorage.listRecords()).find(
    (item) => item.id === recordId,
  )
  if (!record?.upstreamId) {
    return
  }

  const account = await accountQueries.getAccountById(record.accountId)
  if (!account) {
    logger.warn("Cannot sync announcement read state; account missing", {
      recordId,
      accountId: record.accountId,
    })
    return
  }

  const source = resolveAnnouncementSource(record, account)
  if (!source?.handler.markRead) return
  await source.handler.markRead(
    createHandlerRequest(
      account,
      source.handler,
      TRIGGER_REQUEST_PRIORITIES[SITE_ANNOUNCEMENT_CHECK_TRIGGERS.Manual],
    ),
    [{ id: record.upstreamId }],
  )
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
  RuntimeMessageResponse<SiteAnnouncementRecordView[]>
> {
  try {
    return {
      success: true,
      data: getAnnouncementRecordViews(
        await siteAnnouncementStorage.listRecords(),
      ),
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
    await syncSiteAnnouncementRead(request.recordId)
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
