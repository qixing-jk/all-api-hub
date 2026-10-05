import type {
  SiteAnnouncementIdentityMarker,
  SiteAnnouncementRecord,
  SiteAnnouncementStoreState,
} from "~/types/siteAnnouncements"
import { isPlainObject } from "~/utils/core/object"

import { compareStringsOrdinal } from "./identity"

/** Historical formats belong here; executable sources use only current keys. */
function migrateSourceKey(key: string) {
  if (key.startsWith("notice:")) return `site:${key.slice(7)}`
  if (key.startsWith("sub2api:")) return `account:sub2api:${key.slice(8)}`
  return key
}

/** Projects legacy fields before the ordinary storage validator handles them. */
export function migrateLegacySourceFields(
  value: unknown,
  siteKey: string,
): unknown {
  if (!isPlainObject(value)) return value
  const { providerId, ...current } = value
  const sourceScope =
    value.sourceScope === "site" || value.sourceScope === "account"
      ? value.sourceScope
      : providerId === "sub2api" ||
          providerId === "account" ||
          siteKey.startsWith("sub2api:") ||
          siteKey.startsWith("account:")
        ? "account"
        : "site"
  return {
    ...current,
    sourceScope,
    records: Array.isArray(value.records)
      ? value.records.map((record) =>
          migrateLegacySourceFields(record, siteKey),
        )
      : value.records,
  }
}

/** Preserves the most recent known timestamp without inventing missing values. */
function latestTimestamp(left?: number, right?: number) {
  if (left === undefined) return right
  if (right === undefined) return left
  return Math.max(left, right)
}

/** Combines discovery history and monotonic read state from both identities. */
function mergeMarker(
  left: SiteAnnouncementIdentityMarker,
  right: SiteAnnouncementIdentityMarker,
): SiteAnnouncementIdentityMarker {
  return {
    firstSeenAt: Math.min(left.firstSeenAt, right.firstSeenAt),
    lastSeenAt: Math.max(left.lastSeenAt, right.lastSeenAt),
    readAt: latestTimestamp(left.readAt, right.readAt),
  }
}

/** Rekeys validated state, merging collisions without losing historical facts. */
export function migrateLegacySources(
  oldSites: SiteAnnouncementStoreState["sites"],
  oldLedger: SiteAnnouncementStoreState["identityLedger"],
): Pick<SiteAnnouncementStoreState, "sites" | "identityLedger"> {
  const sites: SiteAnnouncementStoreState["sites"] = {}
  const identityLedger: SiteAnnouncementStoreState["identityLedger"] = {}
  for (const [key, markers] of Object.entries(oldLedger)) {
    const target = (identityLedger[migrateSourceKey(key)] ??= {})
    for (const [digest, marker] of Object.entries(markers)) {
      target[digest] = target[digest]
        ? mergeMarker(target[digest], marker)
        : marker
    }
  }
  // Historical records own stable local ids, even if a partially upgraded
  // store already contains duplicates under the current key.
  const orderedSites = Object.entries(oldSites).sort(
    ([left], [right]) =>
      Number(left === migrateSourceKey(left)) -
        Number(right === migrateSourceKey(right)) ||
      compareStringsOrdinal(left, right),
  )
  for (const [key, site] of orderedSites) {
    const siteKey = migrateSourceKey(key)
    const previous = sites[siteKey]
    const records = new Map<string, SiteAnnouncementRecord>()
    for (const record of [...(previous?.records ?? []), ...site.records]) {
      const existing = records.get(record.fingerprint)
      records.set(
        record.fingerprint,
        existing
          ? {
              ...(existing.lastSeenAt >= record.lastSeenAt ? existing : record),
              id: existing.id,
              siteKey,
              ...mergeMarker(existing, record),
              read: existing.read || record.read,
              notifiedAt: latestTimestamp(
                existing.notifiedAt,
                record.notifiedAt,
              ),
            }
          : { ...record, siteKey },
      )
    }
    const latest =
      previous && (previous.lastCheckedAt ?? 0) > (site.lastCheckedAt ?? 0)
        ? previous
        : site
    sites[siteKey] = {
      ...latest,
      siteKey,
      lastSuccessAt: latestTimestamp(
        previous?.lastSuccessAt,
        site.lastSuccessAt,
      ),
      lastNotifiedFingerprint:
        latest.lastNotifiedFingerprint ?? previous?.lastNotifiedFingerprint,
      records: [...records.values()],
    }
  }
  return { sites, identityLedger }
}
