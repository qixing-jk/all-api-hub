import { SITE_TYPES, type AccountSiteType } from "~/constants/siteType"
import type { SiteStructuredAnnouncement } from "~/services/apiAdapters/contracts/siteStructuredAnnouncements"
import { getSiteTypeCapabilities } from "~/services/apiAdapters/registry"
import type { Sub2ApiAnnouncementData } from "~/services/apiService/sub2api/type"
import type {
  SiteAnnouncement,
  SiteAnnouncementProvider,
  SiteAnnouncementProviderRequest,
  SiteAnnouncementProviderResult,
} from "~/types/siteAnnouncements"
import {
  SITE_ANNOUNCEMENT_PROVIDER_IDS,
  SITE_ANNOUNCEMENT_STATUS,
} from "~/types/siteAnnouncements"
import { getErrorMessage } from "~/utils/core/error"
import { createLogger } from "~/utils/core/logger"
import { normalizeUrlForOriginKey } from "~/utils/core/urlParsing"

import { fingerprintAnnouncement, normalizeAnnouncementText } from "./text"

const logger = createLogger("SiteAnnouncementProviders")

const createMissingCommonSiteAnnouncementCapabilitiesError = (
  siteType: AccountSiteType,
) =>
  new Error(
    `site announcement capabilities are not implemented for ${siteType}`,
  )

const createMissingSiteAnnouncementsCapabilityError = (
  siteType: AccountSiteType,
) => new Error(`siteAnnouncements is not implemented for ${siteType}`)

/**
 * Normalizes a site URL into the stable key segment used for announcement state.
 */
function normalizeBaseUrlKey(baseUrl: string): string {
  return normalizeUrlForOriginKey(baseUrl, {
    lowerCase: true,
    stripTrailingSlashes: true,
  })
}

/**
 * Creates the shared provider key for site-wide notice endpoints.
 */
export function createCommonSiteAnnouncementKey(input: {
  siteType: string
  baseUrl: string
}): string {
  return `notice:${input.siteType}:${normalizeBaseUrlKey(input.baseUrl)}`
}

/**
 * Creates the Sub2API provider key for account-scoped announcements.
 */
export function createSub2ApiSiteAnnouncementKey(input: {
  accountId: string
  baseUrl: string
}): string {
  return `sub2api:${input.accountId}:${normalizeBaseUrlKey(input.baseUrl)}`
}

/**
 * Parses upstream timestamp values into milliseconds since epoch.
 */
function parseTimestamp(value: unknown): number | undefined {
  // Values below 1e10 are treated as Unix seconds; larger values are already ms.
  if (typeof value === "number" && Number.isFinite(value)) {
    return value > 10_000_000_000 ? value : value * 1000
  }

  if (typeof value === "string" && value.trim()) {
    const parsedNumber = Number(value)
    if (Number.isFinite(parsedNumber)) {
      return parsedNumber > 10_000_000_000 ? parsedNumber : parsedNumber * 1000
    }

    const parsedDate = Date.parse(value)
    return Number.isFinite(parsedDate) ? parsedDate : undefined
  }

  return undefined
}

/**
 * Converts Sub2API announcement payloads into the local announcement contract.
 */
function normalizeSub2ApiAnnouncement(
  item: Sub2ApiAnnouncementData,
): SiteAnnouncement | null {
  const title = normalizeAnnouncementText(item.title)
  const content =
    normalizeAnnouncementText(item.content) ||
    normalizeAnnouncementText(item.message) ||
    normalizeAnnouncementText(item.body)

  if (!content && !title) {
    return null
  }

  const upstreamId =
    item.id === null || item.id === undefined ? undefined : String(item.id)
  const createdAt = parseTimestamp(item.created_at)
  const updatedAt = parseTimestamp(item.updated_at)
  const readAt = parseTimestamp(item.read_at)
  const fingerprint =
    upstreamId ??
    fingerprintAnnouncement([title, content, createdAt ?? "", updatedAt ?? ""])

  return {
    id: upstreamId,
    title,
    content,
    createdAt,
    updatedAt,
    readAt,
    fingerprint,
  }
}

/**
 * Converts New API-family structured announcement payloads into the local
 * announcement contract while preserving optional extra text in the body.
 */
function normalizeStructuredSiteAnnouncement(
  item: SiteStructuredAnnouncement,
): SiteAnnouncement | null {
  const content = normalizeAnnouncementText(item.content)
  const extra = normalizeAnnouncementText(item.extra)

  if (!content) {
    return null
  }

  const upstreamId =
    item.id === null || item.id === undefined ? undefined : String(item.id)
  const createdAt = parseTimestamp(item.publishDate)
  const fullContent = extra ? `${content}\n\n${extra}` : content
  const fingerprint = fingerprintAnnouncement([
    upstreamId ?? "",
    item.type ?? "",
    item.publishDate ?? "",
    content,
    extra,
  ])

  return {
    id: upstreamId,
    content: fullContent,
    createdAt,
    fingerprint,
  }
}

export const commonSiteAnnouncementProvider: SiteAnnouncementProvider = {
  id: SITE_ANNOUNCEMENT_PROVIDER_IDS.Common,
  createSiteKey: createCommonSiteAnnouncementKey,
  async fetch(
    request: SiteAnnouncementProviderRequest,
  ): Promise<SiteAnnouncementProviderResult> {
    const siteKey = createCommonSiteAnnouncementKey(request)
    try {
      const siteCapabilities = getSiteTypeCapabilities(request.siteType).site
      const structuredAnnouncementsCapability = siteCapabilities?.announcements
      const noticeCapability = siteCapabilities?.notice

      if (!structuredAnnouncementsCapability && !noticeCapability) {
        throw createMissingCommonSiteAnnouncementCapabilitiesError(
          request.siteType,
        )
      }

      const structuredAnnouncements = structuredAnnouncementsCapability
        ? await structuredAnnouncementsCapability
            .fetch(request.apiRequest)
            .then((items) =>
              items
                .map(normalizeStructuredSiteAnnouncement)
                .filter((item): item is SiteAnnouncement => Boolean(item)),
            )
        : []
      let notice: string | null = null
      if (noticeCapability && structuredAnnouncementsCapability) {
        try {
          notice = await noticeCapability.fetch(request.apiRequest)
        } catch (error) {
          logger.warn("Failed to fetch site notice", {
            siteType: request.siteType,
            baseUrl: request.baseUrl,
            error: getErrorMessage(error),
          })
        }
      } else if (noticeCapability) {
        notice = await noticeCapability.fetch(request.apiRequest)
      }
      const content = normalizeAnnouncementText(notice)
      return {
        providerId: SITE_ANNOUNCEMENT_PROVIDER_IDS.Common,
        siteKey,
        status: SITE_ANNOUNCEMENT_STATUS.Success,
        announcements: [
          ...structuredAnnouncements,
          ...(content
            ? [
                {
                  content,
                  fingerprint: fingerprintAnnouncement([content]),
                },
              ]
            : []),
        ],
      }
    } catch (error) {
      return {
        providerId: SITE_ANNOUNCEMENT_PROVIDER_IDS.Common,
        siteKey,
        status: SITE_ANNOUNCEMENT_STATUS.Unsupported,
        announcements: [],
        error: getErrorMessage(error),
      }
    }
  },
}

export const sub2ApiSiteAnnouncementProvider: SiteAnnouncementProvider = {
  id: SITE_ANNOUNCEMENT_PROVIDER_IDS.Sub2Api,
  createSiteKey: createSub2ApiSiteAnnouncementKey,
  async fetch(
    request: SiteAnnouncementProviderRequest,
  ): Promise<SiteAnnouncementProviderResult> {
    const siteKey = createSub2ApiSiteAnnouncementKey(request)
    try {
      const announcementsCapability = getSiteTypeCapabilities(
        SITE_TYPES.SUB2API,
      ).account?.announcements
      if (!announcementsCapability) {
        throw createMissingSiteAnnouncementsCapabilityError(SITE_TYPES.SUB2API)
      }

      const announcements = await announcementsCapability
        .fetch(request.apiRequest, { unreadOnly: true })
        .then((items) =>
          items
            .map(normalizeSub2ApiAnnouncement)
            .filter((item): item is SiteAnnouncement => Boolean(item)),
        )

      return {
        providerId: SITE_ANNOUNCEMENT_PROVIDER_IDS.Sub2Api,
        siteKey,
        status: SITE_ANNOUNCEMENT_STATUS.Success,
        announcements,
      }
    } catch (error) {
      return {
        providerId: SITE_ANNOUNCEMENT_PROVIDER_IDS.Sub2Api,
        siteKey,
        status: SITE_ANNOUNCEMENT_STATUS.Error,
        announcements: [],
        error: getErrorMessage(error),
      }
    }
  },
  async markRead(request, announcements) {
    const ids = announcements
      .map((announcement) => announcement.id)
      .filter((id): id is string => Boolean(id))

    if (ids.length === 0) {
      return
    }

    const announcementsCapability = getSiteTypeCapabilities(SITE_TYPES.SUB2API)
      .account?.announcements
    if (!announcementsCapability) {
      throw createMissingSiteAnnouncementsCapabilityError(SITE_TYPES.SUB2API)
    }

    const results = await Promise.allSettled(
      ids.map((id) =>
        announcementsCapability.markRead({
          request: request.apiRequest,
          id,
        }),
      ),
    )

    const failures = results.flatMap((result, index) =>
      result.status === "rejected"
        ? [{ announcementId: ids[index]!, reason: result.reason }]
        : [],
    )

    if (failures.length === 0) {
      return
    }

    for (const failure of failures) {
      logger.warn("Failed to mark Sub2API announcement as read", {
        accountId: request.accountId,
        announcementId: failure.announcementId,
        error: getErrorMessage(failure.reason),
      })
    }

    if (failures.length === ids.length) {
      const [firstFailure] = failures
      throw firstFailure?.reason instanceof Error
        ? firstFailure.reason
        : new Error(getErrorMessage(firstFailure?.reason))
    }
  },
}

/**
 * Selects the announcement provider implementation for a site type.
 */
export function getSiteAnnouncementProvider(
  siteType: AccountSiteType,
): SiteAnnouncementProvider {
  return siteType === SITE_TYPES.SUB2API
    ? sub2ApiSiteAnnouncementProvider
    : commonSiteAnnouncementProvider
}
