import type {
  SiteAnnouncementIdentityMarker,
  SiteAnnouncementStoreState,
} from "~/types/siteAnnouncements"

export interface SiteAnnouncementIdentityEntry {
  siteKey: string
  digest: string
  marker: SiteAnnouncementIdentityMarker
}

/** Compares strings by UTF-16 code unit order without locale collation. */
export function compareStringsOrdinal(left: string, right: string) {
  if (left < right) return -1
  if (left > right) return 1
  return 0
}

/** Returns a stable lowercase hexadecimal SHA-256 digest of UTF-8 bytes. */
export async function digestAnnouncementFingerprint(fingerprint: string) {
  const bytes = new TextEncoder().encode(fingerprint)
  const digest = await crypto.subtle.digest("SHA-256", bytes)
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("")
}

/** Orders identities oldest first by (lastSeenAt, siteKey, digest). */
export function compareIdentityEntriesOldestFirst(
  left: SiteAnnouncementIdentityEntry,
  right: SiteAnnouncementIdentityEntry,
) {
  return (
    left.marker.lastSeenAt - right.marker.lastSeenAt ||
    compareStringsOrdinal(left.siteKey, right.siteKey) ||
    compareStringsOrdinal(left.digest, right.digest)
  )
}

/** Prunes identity markers per site and globally, retaining the newest entries. */
export function pruneIdentityLedger(
  ledger: SiteAnnouncementStoreState["identityLedger"],
  limits: { identitiesPerSite: number; identitiesTotal: number },
): SiteAnnouncementStoreState["identityLedger"] {
  const identitiesPerSite = Math.max(0, Math.trunc(limits.identitiesPerSite))
  const identitiesTotal = Math.max(0, Math.trunc(limits.identitiesTotal))
  const perSite: SiteAnnouncementStoreState["identityLedger"] = {}

  for (const [siteKey, markers] of Object.entries(ledger)) {
    const entries = Object.entries(markers)
      .map(([digest, marker]) => ({
        siteKey,
        digest,
        marker: { ...marker },
      }))
      .sort(compareIdentityEntriesOldestFirst)
    const survivors = entries.slice(
      Math.max(0, entries.length - identitiesPerSite),
    )

    if (survivors.length > 0) {
      perSite[siteKey] = Object.fromEntries(
        survivors.map(({ digest, marker }) => [digest, marker]),
      )
    }
  }

  const entries = Object.entries(perSite)
    .flatMap(([siteKey, markers]) =>
      Object.entries(markers).map(([digest, marker]) => ({
        siteKey,
        digest,
        marker,
      })),
    )
    .sort(compareIdentityEntriesOldestFirst)
  const survivors = entries.slice(Math.max(0, entries.length - identitiesTotal))

  const result: SiteAnnouncementStoreState["identityLedger"] = {}
  for (const { siteKey, digest, marker } of survivors) {
    const siteMarkers = (result[siteKey] ??= {})
    siteMarkers[digest] = marker
  }
  return result
}
