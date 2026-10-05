import type { AccountSiteType } from "~/constants/siteType"
import type { SiteAnnouncementsCapability } from "~/services/apiAdapters/contracts/siteAnnouncements"
import type { SiteNoticeCapability } from "~/services/apiAdapters/contracts/siteNotice"
import { getSiteTypeCapabilities } from "~/services/apiAdapters/registry"
import type {
  AnnouncementSourceHandler,
  AnnouncementSourceScope,
  SiteAnnouncement,
} from "~/types/siteAnnouncements"
import {
  ANNOUNCEMENT_SOURCE_SCOPES,
  SITE_ANNOUNCEMENT_STATUS,
} from "~/types/siteAnnouncements"
import { getErrorMessage } from "~/utils/core/error"
import { createLogger } from "~/utils/core/logger"

import { createAnnouncementSourceIdentity } from "./identity"
import { fingerprintAnnouncement, normalizeAnnouncementText } from "./text"

const logger = createLogger("AnnouncementSourceHandlers")

/** Applies product text and fallback identity rules to already canonical data. */
function normalizeAnnouncement(
  item: SiteAnnouncement,
): SiteAnnouncement | null {
  const title = normalizeAnnouncementText(item.title)
  const content = normalizeAnnouncementText(item.content)
  if (!content && !title) return null
  return {
    ...item,
    title: item.title === undefined ? undefined : title,
    content,
    fingerprint:
      item.fingerprint ??
      item.id ??
      fingerprintAnnouncement([
        title,
        content,
        item.createdAt ?? "",
        item.updatedAt ?? "",
      ]),
  }
}

/** Binds real operations once; historical identities never select behavior. */
function createAnnouncementHandler(
  siteType: AccountSiteType,
  scope: AnnouncementSourceScope,
  announcements?: SiteAnnouncementsCapability,
  notice?: SiteNoticeCapability,
): AnnouncementSourceHandler {
  const identity = createAnnouncementSourceIdentity(siteType, scope)
  const markRead = announcements?.markRead?.bind(announcements)
  return {
    ...identity,
    async fetch(request) {
      const siteKey = identity.createSiteKey(request)
      const resultIdentity = { sourceScope: identity.scope, siteKey }
      if (!announcements && !notice) {
        return {
          ...resultIdentity,
          status: SITE_ANNOUNCEMENT_STATUS.Unsupported,
          announcements: [],
          error: `site announcement capabilities are not implemented for ${siteType}`,
        }
      }
      try {
        const items = announcements
          ? await announcements.fetch(request.apiRequest)
          : []
        const normalized = items
          .map(normalizeAnnouncement)
          .filter((item): item is SiteAnnouncement => item !== null)
        let noticeError: string | undefined
        if (notice) {
          try {
            const content = normalizeAnnouncementText(
              await notice.fetch(request.apiRequest),
            )
            if (content)
              normalized.push({
                content,
                fingerprint: fingerprintAnnouncement([content]),
              })
          } catch (error) {
            if (!announcements) throw error
            noticeError = getErrorMessage(error)
            logger.warn("Failed to fetch site notice", {
              siteType,
              baseUrl: request.baseUrl,
              error: noticeError,
            })
          }
        }
        return {
          ...resultIdentity,
          status: noticeError
            ? SITE_ANNOUNCEMENT_STATUS.Error
            : SITE_ANNOUNCEMENT_STATUS.Success,
          announcements: normalized,
          ...(noticeError ? { error: noticeError } : {}),
        }
      } catch (error) {
        return {
          ...resultIdentity,
          status: SITE_ANNOUNCEMENT_STATUS.Error,
          announcements: [],
          error: getErrorMessage(error),
        }
      }
    },
    ...(markRead
      ? {
          async markRead(request, items) {
            const ids = items
              .map((item) => item.id)
              .filter((id): id is string => Boolean(id))
            if (!ids.length) return
            const results = await Promise.allSettled(
              ids.map(async (id) => {
                if (!(await markRead({ request: request.apiRequest, id })))
                  throw new Error("Failed to mark announcement read")
              }),
            )
            const failures = results.flatMap((result, index) =>
              result.status === "rejected"
                ? [{ id: ids[index]!, reason: result.reason }]
                : [],
            )
            for (const failure of failures) {
              logger.warn("Failed to mark announcement as read", {
                accountId: request.accountId,
                announcementId: failure.id,
                error: getErrorMessage(failure.reason),
              })
            }
            if (failures.length === ids.length) {
              const reason = failures[0]!.reason
              throw reason instanceof Error
                ? reason
                : new Error(getErrorMessage(reason))
            }
          },
        }
      : {}),
  }
}

/** Resolves independent sources and binds their capabilities at the adapter seam. */
export function getAnnouncementSourceHandlers(
  siteType: AccountSiteType,
): AnnouncementSourceHandler[] {
  const capabilities = getSiteTypeCapabilities(siteType)
  const handlers: AnnouncementSourceHandler[] = []
  if (capabilities.site?.announcements || capabilities.site?.notice) {
    handlers.push(
      createAnnouncementHandler(
        siteType,
        ANNOUNCEMENT_SOURCE_SCOPES.Site,
        capabilities.site.announcements,
        capabilities.site.notice,
      ),
    )
  }
  if (capabilities.account?.announcements) {
    handlers.push(
      createAnnouncementHandler(
        siteType,
        ANNOUNCEMENT_SOURCE_SCOPES.Account,
        capabilities.account.announcements,
      ),
    )
  }
  return handlers.length
    ? handlers
    : [createAnnouncementHandler(siteType, ANNOUNCEMENT_SOURCE_SCOPES.Site)]
}
