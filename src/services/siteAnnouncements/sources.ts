import type { SiteAccount } from "~/types"
import type {
  AnnouncementSourceHandler,
  SiteAnnouncementRecord,
  SiteAnnouncementRecordView,
} from "~/types/siteAnnouncements"

import { getAnnouncementSourceHandlers } from "./sourceHandlers"

/**
 * Expands registered sources and deduplicates each at its own scope.
 */
export function resolveAnnouncementSources<
  TAccount extends Pick<SiteAccount, "id" | "site_type" | "site_url">,
>(
  accounts: TAccount[],
): Array<{
  account: TAccount
  handler: AnnouncementSourceHandler
  siteKey: string
}> {
  const seen = new Set<string>()
  const sources: Array<{
    account: TAccount
    handler: AnnouncementSourceHandler
    siteKey: string
  }> = []
  const handlersByType = new Map<
    SiteAccount["site_type"],
    AnnouncementSourceHandler[]
  >()
  for (const account of accounts) {
    let handlers = handlersByType.get(account.site_type)
    if (!handlers) {
      handlers = getAnnouncementSourceHandlers(account.site_type)
      handlersByType.set(account.site_type, handlers)
    }
    for (const handler of handlers) {
      const siteKey = handler.createSiteKey({
        accountId: account.id,
        siteType: account.site_type,
        baseUrl: account.site_url,
      })
      if (seen.has(siteKey)) continue
      seen.add(siteKey)
      sources.push({ account, handler, siteKey })
    }
  }
  return sources
}

/** Resolves cached identity against the account's current sources before a write. */
export function resolveAnnouncementSource(
  record: Pick<SiteAnnouncementRecord, "siteKey">,
  account: SiteAccount,
) {
  return resolveAnnouncementSources([account]).find(
    (source) => source.siteKey === record.siteKey,
  )
}

/** Projects current actions for display without persisting capability snapshots. */
export function getAnnouncementRecordViews(
  records: SiteAnnouncementRecord[],
): SiteAnnouncementRecordView[] {
  const sources = resolveAnnouncementSources(
    records.map((record) => ({
      id: record.accountId,
      site_type: record.siteType,
      site_url: record.baseUrl,
    })),
  )
  const sourcesByKey = new Map(
    sources.map((source) => [source.siteKey, source]),
  )
  return records.map((record) => ({
    ...record,
    canSyncRead: Boolean(
      record.upstreamId && sourcesByKey.get(record.siteKey)?.handler.markRead,
    ),
  }))
}
