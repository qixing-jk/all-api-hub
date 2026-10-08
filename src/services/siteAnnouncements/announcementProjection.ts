import {
  isAccountSiteType,
  SITE_TYPES,
  type AccountSiteType,
} from "~/constants/siteType"
import type {
  AnnouncementSourceScope,
  SiteAnnouncementIdentityMarker,
  SiteAnnouncementRecord,
  SiteAnnouncementRecordInput,
  SiteAnnouncementSiteState,
  SiteAnnouncementStatus,
  SiteAnnouncementStoreState,
} from "~/types/siteAnnouncements"
import {
  ANNOUNCEMENT_SOURCE_SCOPES,
  SITE_ANNOUNCEMENT_STATUS,
} from "~/types/siteAnnouncements"
import { safeRandomUUID } from "~/utils/core/identifier"
import { isPlainObject } from "~/utils/core/object"

import {
  SITE_ANNOUNCEMENTS_LIMITS,
  SITE_ANNOUNCEMENTS_STORE_SCHEMA_VERSION,
} from "./constants"
import {
  compareStringsOrdinal,
  digestAnnouncementFingerprint,
  pruneIdentityLedger,
} from "./identity"
import { migrateLegacySourceFields, migrateLegacySources } from "./migration"

const SHA256_HEX_DIGEST_PATTERN = /^[0-9a-f]{64}$/

/** Serializes stable record fields used to choose a duplicate representative. */
function serializeRecordInputForComparison(
  record: SiteAnnouncementRecordInput,
) {
  return JSON.stringify(
    Object.entries(record)
      // Read state is merged independently so it cannot affect content choice.
      .filter(([key]) => key !== "readAt" && key !== "read")
      .sort(([leftKey], [rightKey]) =>
        compareStringsOrdinal(leftKey, rightKey),
      ),
  )
}

/** Orders duplicate record inputs without depending on provider response order. */
function compareRecordInputs(
  left: SiteAnnouncementRecordInput,
  right: SiteAnnouncementRecordInput,
) {
  return compareStringsOrdinal(
    serializeRecordInputForComparison(left),
    serializeRecordInputForComparison(right),
  )
}

/** Orders cached records newest first with deterministic cache membership. */
function compareRecordsNewestFirst(
  left: SiteAnnouncementRecord,
  right: SiteAnnouncementRecord,
) {
  return (
    right.firstSeenAt - left.firstSeenAt ||
    compareStringsOrdinal(left.fingerprint, right.fingerprint)
  )
}

/** Serializes identity ledgers without depending on object insertion order. */
function serializeIdentityLedger(
  ledger: SiteAnnouncementStoreState["identityLedger"],
) {
  return JSON.stringify(
    Object.entries(ledger)
      .flatMap(([siteKey, markers]) =>
        Object.entries(markers).map(([digest, marker]) => [
          siteKey,
          digest,
          marker.firstSeenAt,
          marker.lastSeenAt,
          marker.readAt,
        ]),
      )
      .sort((left, right) =>
        compareStringsOrdinal(
          `${left[0]}\0${left[1]}`,
          `${right[0]}\0${right[1]}`,
        ),
      ),
  )
}

/**
 * Coerces persisted source scopes to supported visibility scopes.
 */
function normalizeSourceScope(value: unknown): AnnouncementSourceScope {
  return value === ANNOUNCEMENT_SOURCE_SCOPES.Account
    ? ANNOUNCEMENT_SOURCE_SCOPES.Account
    : ANNOUNCEMENT_SOURCE_SCOPES.Site
}

/**
 * Normalizes persisted site type values before storing or displaying records.
 */
function sanitizeSiteType(value: unknown): AccountSiteType {
  return isAccountSiteType(value) ? value : SITE_TYPES.UNKNOWN
}

/**
 * Creates an empty persisted announcement store with the current schema version.
 */
export function createEmptyStore(): SiteAnnouncementStoreState {
  return {
    schemaVersion: SITE_ANNOUNCEMENTS_STORE_SCHEMA_VERSION,
    sites: {},
    identityLedger: {},
  }
}

/** Checks persisted timestamps before they enter ordering and retention logic. */
function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value)
}

/**
 * Normalizes persisted status values to the supported status enum.
 */
function sanitizeStatus(value: unknown): SiteAnnouncementStatus {
  return value === SITE_ANNOUNCEMENT_STATUS.Success ||
    value === SITE_ANNOUNCEMENT_STATUS.Error ||
    value === SITE_ANNOUNCEMENT_STATUS.Unsupported
    ? value
    : SITE_ANNOUNCEMENT_STATUS.Never
}

/**
 * Validates and normalizes one persisted announcement record.
 */
function sanitizeRecord(value: unknown): SiteAnnouncementRecord | null {
  if (!isPlainObject(value)) {
    return null
  }

  const id = typeof value.id === "string" ? value.id : ""
  const siteKey = typeof value.siteKey === "string" ? value.siteKey : ""
  const fingerprint =
    typeof value.fingerprint === "string" ? value.fingerprint : ""
  const content = typeof value.content === "string" ? value.content : ""

  if (!id || !siteKey || !fingerprint) {
    return null
  }

  return {
    id,
    siteKey,
    siteName: typeof value.siteName === "string" ? value.siteName : "",
    siteType: sanitizeSiteType(value.siteType),
    baseUrl: typeof value.baseUrl === "string" ? value.baseUrl : "",
    accountId: typeof value.accountId === "string" ? value.accountId : "",
    sourceScope: normalizeSourceScope(value.sourceScope),
    upstreamId:
      typeof value.upstreamId === "string" ? value.upstreamId : undefined,
    title: typeof value.title === "string" ? value.title : "",
    content,
    fingerprint,
    firstSeenAt: isFiniteNumber(value.firstSeenAt)
      ? value.firstSeenAt
      : Date.now(),
    lastSeenAt: isFiniteNumber(value.lastSeenAt)
      ? value.lastSeenAt
      : isFiniteNumber(value.firstSeenAt)
        ? value.firstSeenAt
        : Date.now(),
    createdAt: isFiniteNumber(value.createdAt) ? value.createdAt : undefined,
    updatedAt: isFiniteNumber(value.updatedAt) ? value.updatedAt : undefined,
    notifiedAt: isFiniteNumber(value.notifiedAt) ? value.notifiedAt : undefined,
    notificationError:
      typeof value.notificationError === "string"
        ? value.notificationError
        : undefined,
    read: value.read === true,
    readAt: isFiniteNumber(value.readAt) ? value.readAt : undefined,
  }
}

/**
 * Validates and normalizes one persisted site announcement state.
 */
function sanitizeSiteState(
  siteKey: string,
  value: unknown,
): SiteAnnouncementSiteState | null {
  if (!siteKey || !isPlainObject(value)) {
    return null
  }

  const records = Array.isArray(value.records)
    ? value.records
        .map(sanitizeRecord)
        .filter((record): record is SiteAnnouncementRecord => Boolean(record))
    : []

  return {
    siteKey,
    siteName: typeof value.siteName === "string" ? value.siteName : "",
    siteType: sanitizeSiteType(value.siteType),
    baseUrl: typeof value.baseUrl === "string" ? value.baseUrl : "",
    accountId: typeof value.accountId === "string" ? value.accountId : "",
    sourceScope: normalizeSourceScope(value.sourceScope),
    status: sanitizeStatus(value.status),
    lastCheckedAt: isFiniteNumber(value.lastCheckedAt)
      ? value.lastCheckedAt
      : undefined,
    lastSuccessAt: isFiniteNumber(value.lastSuccessAt)
      ? value.lastSuccessAt
      : undefined,
    lastError:
      typeof value.lastError === "string" ? value.lastError : undefined,
    lastNotifiedFingerprint:
      typeof value.lastNotifiedFingerprint === "string"
        ? value.lastNotifiedFingerprint
        : undefined,
    records,
  }
}

/** Normalizes the persisted site map while retaining independently valid sites. */
function sanitizeSites(value: unknown, legacy: boolean) {
  const sites: Record<string, SiteAnnouncementSiteState> = {}
  if (isPlainObject(value)) {
    for (const [siteKey, siteValue] of Object.entries(value)) {
      const siteState = sanitizeSiteState(
        siteKey,
        legacy ? migrateLegacySourceFields(siteValue, siteKey) : siteValue,
      )
      if (siteState) {
        sites[siteKey] = siteState
      }
    }
  }

  return sites
}

/** Drops malformed identity markers while retaining independently valid entries. */
function sanitizeIdentityLedger(
  value: unknown,
): SiteAnnouncementStoreState["identityLedger"] {
  const identityLedger: SiteAnnouncementStoreState["identityLedger"] = {}
  if (!isPlainObject(value)) {
    return identityLedger
  }

  for (const [siteKey, markerValues] of Object.entries(value)) {
    if (!siteKey || !isPlainObject(markerValues)) {
      continue
    }

    const markers: Record<string, SiteAnnouncementIdentityMarker> = {}
    for (const [digest, markerValue] of Object.entries(markerValues)) {
      if (
        !SHA256_HEX_DIGEST_PATTERN.test(digest) ||
        !isPlainObject(markerValue) ||
        !isFiniteNumber(markerValue.firstSeenAt) ||
        !isFiniteNumber(markerValue.lastSeenAt) ||
        (markerValue.readAt !== undefined &&
          !isFiniteNumber(markerValue.readAt))
      ) {
        continue
      }

      markers[digest] = {
        firstSeenAt: markerValue.firstSeenAt,
        lastSeenAt: markerValue.lastSeenAt,
        readAt: markerValue.readAt,
      }
    }
    identityLedger[siteKey] = markers
  }

  return identityLedger
}

/** Migrates and self-heals persisted announcement state. */
export async function sanitizeStore(
  value: unknown,
): Promise<SiteAnnouncementStoreState> {
  if (value === undefined) {
    return createEmptyStore()
  }
  if (!isPlainObject(value)) {
    throw new Error("Malformed site announcement store")
  }
  if (
    value.schemaVersion !== 1 &&
    value.schemaVersion !== 2 &&
    value.schemaVersion !== SITE_ANNOUNCEMENTS_STORE_SCHEMA_VERSION
  ) {
    throw new Error("Unsupported site announcement store schema")
  }
  if (!isPlainObject(value.sites)) {
    throw new Error("Malformed site announcement store")
  }

  const legacy = value.schemaVersion !== SITE_ANNOUNCEMENTS_STORE_SCHEMA_VERSION
  const sanitizedSites = sanitizeSites(value.sites, legacy)
  const sanitizedLedger =
    value.schemaVersion !== 1
      ? sanitizeIdentityLedger(value.identityLedger)
      : {}
  const { sites, identityLedger } = legacy
    ? migrateLegacySources(sanitizedSites, sanitizedLedger)
    : { sites: sanitizedSites, identityLedger: sanitizedLedger }

  for (const [siteKey, site] of Object.entries(sites)) {
    const markers = (identityLedger[siteKey] ??= {})
    for (const record of site.records) {
      record.siteKey = siteKey
      const digest = await digestAnnouncementFingerprint(record.fingerprint)
      const current = markers[digest]
      const nextMarker: SiteAnnouncementIdentityMarker = {
        firstSeenAt: Math.min(
          current?.firstSeenAt ?? record.firstSeenAt,
          record.firstSeenAt,
        ),
        lastSeenAt: Math.max(current?.lastSeenAt ?? 0, record.lastSeenAt),
        readAt:
          current?.readAt ??
          (record.read ? record.readAt ?? record.lastSeenAt : undefined),
      }
      markers[digest] = nextMarker
      record.firstSeenAt = nextMarker.firstSeenAt
      record.lastSeenAt = nextMarker.lastSeenAt
      if (nextMarker.readAt !== undefined) {
        record.read = true
        record.readAt = nextMarker.readAt
      }
    }
    site.records.sort(compareRecordsNewestFirst)
    site.records = site.records.slice(
      0,
      SITE_ANNOUNCEMENTS_LIMITS.recordsPerSite,
    )
  }

  return {
    schemaVersion: SITE_ANNOUNCEMENTS_STORE_SCHEMA_VERSION,
    sites,
    identityLedger,
  }
}

/** Prepares identity hashing and a locked discovery mutation that preserves durable history. */
export async function prepareAnnouncementDiscovery(params: {
  site: Omit<SiteAnnouncementSiteState, "records" | "status"> & {
    status: SiteAnnouncementStatus
  }
  records: SiteAnnouncementRecordInput[]
  now?: number
}) {
  const now = params.now ?? Date.now()
  if (!isFiniteNumber(now)) {
    throw new Error("Invalid site announcement timestamp")
  }

  const inputCandidates = await Promise.all(
    params.records.map(async (record) => ({
      record,
      digest: await digestAnnouncementFingerprint(record.fingerprint),
    })),
  )
  const inputsByDigest = new Map<string, (typeof inputCandidates)[number]>()
  for (const candidate of inputCandidates) {
    const existing = inputsByDigest.get(candidate.digest)
    if (!existing) {
      inputsByDigest.set(candidate.digest, candidate)
      continue
    }

    const representative =
      compareRecordInputs(candidate.record, existing.record) < 0
        ? candidate.record
        : existing.record
    const readAtValues = [
      existing.record.readAt,
      candidate.record.readAt,
    ].filter(isFiniteNumber)
    const readAt =
      readAtValues.length > 0 ? Math.max(...readAtValues) : undefined
    inputsByDigest.set(candidate.digest, {
      digest: candidate.digest,
      record: {
        ...representative,
        readAt,
        read: existing.record.read || candidate.record.read,
      },
    })
  }
  const inputs = [...inputsByDigest.values()].sort((left, right) =>
    compareStringsOrdinal(left.digest, right.digest),
  )

  return (store: SiteAnnouncementStoreState) => {
    // Compare normalized state so repeated polls do not write unchanged data.
    const previousStore = JSON.stringify(store)
    const createdRecords: SiteAnnouncementRecord[] = []
    const current = store.sites[params.site.siteKey]
    const records = [...(current?.records ?? [])]
    const markers = (store.identityLedger[params.site.siteKey] ??= {})

    for (const { record: input, digest } of inputs) {
      const existing = records.find(
        (record) => record.fingerprint === input.fingerprint,
      )
      const knownMarker = markers[digest]
      if (knownMarker) {
        knownMarker.lastSeenAt = Math.max(knownMarker.lastSeenAt, now)
        if (
          knownMarker.readAt === undefined &&
          (isFiniteNumber(input.readAt) || input.read === true)
        ) {
          knownMarker.readAt = isFiniteNumber(input.readAt) ? input.readAt : now
        }

        if (existing) {
          const id = existing.id
          Object.assign(existing, input, {
            id,
            firstSeenAt: knownMarker.firstSeenAt,
            lastSeenAt: knownMarker.lastSeenAt,
            read: knownMarker.readAt !== undefined,
            readAt: knownMarker.readAt,
          })
        } else {
          const reconstructed: SiteAnnouncementRecord = {
            ...input,
            id: safeRandomUUID("site-announcement"),
            firstSeenAt: knownMarker.firstSeenAt,
            lastSeenAt: knownMarker.lastSeenAt,
            read: knownMarker.readAt !== undefined,
            readAt: knownMarker.readAt,
          }
          records.push(reconstructed)
        }
        continue
      }

      // When the source exposes only a boolean, record when read state was
      // observed locally; the provider does not invent an upstream read time.
      const readAt = isFiniteNumber(input.readAt)
        ? input.readAt
        : input.read === true
          ? now
          : undefined
      markers[digest] = { firstSeenAt: now, lastSeenAt: now, readAt }

      const record: SiteAnnouncementRecord = {
        ...input,
        id: safeRandomUUID("site-announcement"),
        firstSeenAt: now,
        lastSeenAt: now,
        read: readAt !== undefined,
        readAt,
      }
      records.push(record)
      if (readAt === undefined) {
        createdRecords.push(record)
      }
    }

    records.sort(compareRecordsNewestFirst)
    store.sites[params.site.siteKey] = {
      ...current,
      ...params.site,
      records: records.slice(0, SITE_ANNOUNCEMENTS_LIMITS.recordsPerSite),
    }
    return {
      changed: JSON.stringify(store) !== previousStore,
      result: createdRecords,
    }
  }
}

/** Prepares identity hashing and a locked read mutation, including evicted records. */
export async function prepareAnnouncementReadIdentities(
  records: ReadonlyArray<
    Pick<
      SiteAnnouncementRecord,
      "siteKey" | "fingerprint" | "firstSeenAt" | "lastSeenAt"
    >
  >,
) {
  const identities = await Promise.all(
    records.map(async (record) => ({
      ...record,
      digest: await digestAnnouncementFingerprint(record.fingerprint),
    })),
  )

  return (store: SiteAnnouncementStoreState) => {
    const now = Date.now()
    let markedCount = 0
    let recordSyncChanged = false
    const identitiesBySite = new Map<string, Map<string, string>>()

    for (const identity of identities) {
      const markers = (store.identityLedger[identity.siteKey] ??= {})
      const marker = (markers[identity.digest] ??= {
        firstSeenAt: identity.firstSeenAt,
        lastSeenAt: identity.lastSeenAt,
      })
      if (marker.readAt === undefined) {
        marker.readAt = now
        markedCount += 1
      }

      const identitiesByFingerprint =
        identitiesBySite.get(identity.siteKey) ?? new Map<string, string>()
      identitiesByFingerprint.set(identity.fingerprint, identity.digest)
      identitiesBySite.set(identity.siteKey, identitiesByFingerprint)
    }

    for (const [siteKey, identitiesByFingerprint] of identitiesBySite) {
      const site = store.sites[siteKey]
      if (!site) continue

      for (const record of site.records) {
        const digest = identitiesByFingerprint.get(record.fingerprint)
        if (!digest) continue

        const readAt = store.identityLedger[siteKey]?.[digest]?.readAt
        if (readAt === undefined) continue

        recordSyncChanged ||= !record.read || record.readAt !== readAt
        record.read = true
        record.readAt = readAt
      }
    }

    return {
      changed: markedCount > 0 || recordSyncChanged,
      result: markedCount,
    }
  }
}

/** Updates cached records and their durable read markers in one mutation. */
export async function markAnnouncementRecordsRead(
  store: SiteAnnouncementStoreState,
  recordIds: string[],
) {
  const recordIdSet = new Set(recordIds)

  const now = Date.now()
  let markedCount = 0

  for (const site of Object.values(store.sites)) {
    for (const record of site.records) {
      if (!recordIdSet.has(record.id) || record.read) {
        continue
      }

      const digest = await digestAnnouncementFingerprint(record.fingerprint)
      const markers = (store.identityLedger[site.siteKey] ??= {})
      const marker = (markers[digest] ??= {
        firstSeenAt: record.firstSeenAt,
        lastSeenAt: record.lastSeenAt,
      })
      marker.readAt = now
      record.read = true
      record.readAt = now
      markedCount += 1
    }
  }

  return { changed: markedCount > 0, result: markedCount }
}

/** Marks selected durable identities read and reconciles their cached projections. */
export async function markAllAnnouncementIdentitiesRead(
  store: SiteAnnouncementStoreState,
  siteKey?: string,
) {
  const now = Date.now()
  let changedCount = 0
  let recordSyncChanged = false
  const selectedSiteKeys = siteKey
    ? [siteKey]
    : Object.keys(store.identityLedger)

  for (const selectedSiteKey of selectedSiteKeys) {
    for (const marker of Object.values(
      store.identityLedger[selectedSiteKey] ?? {},
    )) {
      if (marker.readAt === undefined) {
        marker.readAt = now
        changedCount += 1
      }
    }
  }

  for (const selectedSiteKey of selectedSiteKeys) {
    const site = store.sites[selectedSiteKey]
    if (!site) {
      continue
    }

    const recordsByDigest = new Map(
      await Promise.all(
        site.records.map(
          async (record) =>
            [
              await digestAnnouncementFingerprint(record.fingerprint),
              record,
            ] as const,
        ),
      ),
    )
    for (const [digest, marker] of Object.entries(
      store.identityLedger[selectedSiteKey] ?? {},
    ).filter(([, marker]) => marker.readAt !== undefined)) {
      const record = recordsByDigest.get(digest)
      if (record) {
        recordSyncChanged ||= !record.read || record.readAt !== marker.readAt
        record.read = true
        record.readAt = marker.readAt
      }
    }
  }

  return {
    changed: changedCount > 0 || recordSyncChanged,
    result: changedCount,
  }
}

/** Removes cached sites together with the identity facts they own. */
export function removeAnnouncementSites(
  store: SiteAnnouncementStoreState,
  siteKeys: readonly string[],
) {
  const keys = new Set(siteKeys)

  let sites = 0
  let records = 0

  for (const siteKey of keys) {
    const site = store.sites[siteKey]
    if (!site) {
      continue
    }

    delete store.sites[siteKey]
    delete store.identityLedger[siteKey]
    sites += 1
    records += site.records.length
  }

  return { changed: sites > 0, result: { sites, records } }
}

/** Applies identity retention after any mutation without expiring identities by time. */
export function finalizeAnnouncementProjection(
  store: SiteAnnouncementStoreState,
) {
  const before = serializeIdentityLedger(store.identityLedger)
  const pruned = pruneIdentityLedger(store.identityLedger, {
    identitiesPerSite: SITE_ANNOUNCEMENTS_LIMITS.identitiesPerSite,
    identitiesTotal: SITE_ANNOUNCEMENTS_LIMITS.identitiesTotal,
  })
  const changed = before !== serializeIdentityLedger(pruned)
  store.identityLedger = pruned
  return changed
}
