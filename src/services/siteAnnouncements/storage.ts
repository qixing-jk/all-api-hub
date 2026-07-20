import { Storage } from "@plasmohq/storage"

import {
  isAccountSiteType,
  SITE_TYPES,
  type AccountSiteType,
} from "~/constants/siteType"
import { STORAGE_KEYS, STORAGE_LOCKS } from "~/services/core/storageKeys"
import { withExtensionStorageWriteLock } from "~/services/core/storageWriteLock"
import type {
  SiteAnnouncementIdentityMarker,
  SiteAnnouncementProviderId,
  SiteAnnouncementRecord,
  SiteAnnouncementRecordInput,
  SiteAnnouncementSiteState,
  SiteAnnouncementStatus,
  SiteAnnouncementStoreState,
} from "~/types/siteAnnouncements"
import {
  SITE_ANNOUNCEMENT_PROVIDER_IDS,
  SITE_ANNOUNCEMENT_STATUS,
} from "~/types/siteAnnouncements"
import { getErrorMessage } from "~/utils/core/error"
import { safeRandomUUID } from "~/utils/core/identifier"
import { createLogger } from "~/utils/core/logger"
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

const logger = createLogger("SiteAnnouncementStorage")
const SHA256_HEX_DIGEST_PATTERN = /^[0-9a-f]{64}$/

/** Serializes stable record fields used to choose a duplicate representative. */
function serializeRecordInputForComparison(
  record: SiteAnnouncementRecordInput,
) {
  return JSON.stringify(
    Object.entries(record)
      // Read state is merged independently so it cannot affect content choice.
      .filter(([key]) => key !== "readAt")
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
 * Coerces unknown persisted provider ids to the supported announcement providers.
 */
function normalizeProviderId(value: unknown): SiteAnnouncementProviderId {
  return value === SITE_ANNOUNCEMENT_PROVIDER_IDS.Sub2Api
    ? SITE_ANNOUNCEMENT_PROVIDER_IDS.Sub2Api
    : SITE_ANNOUNCEMENT_PROVIDER_IDS.Common
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
function createEmptyStore(): SiteAnnouncementStoreState {
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
    providerId: normalizeProviderId(value.providerId),
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
    providerId: normalizeProviderId(value.providerId),
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
function sanitizeSites(value: unknown) {
  const sites: Record<string, SiteAnnouncementSiteState> = {}
  if (isPlainObject(value)) {
    for (const [siteKey, siteValue] of Object.entries(value)) {
      const siteState = sanitizeSiteState(siteKey, siteValue)
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
async function sanitizeStore(
  value: unknown,
): Promise<SiteAnnouncementStoreState> {
  if (value === undefined) {
    return createEmptyStore()
  }
  if (!isPlainObject(value)) {
    throw new Error("Malformed site announcement store")
  }
  if (value.schemaVersion !== 1 && value.schemaVersion !== 2) {
    throw new Error("Unsupported site announcement store schema")
  }
  if (!isPlainObject(value.sites)) {
    throw new Error("Malformed site announcement store")
  }

  const sites = sanitizeSites(value.sites)
  const identityLedger =
    value.schemaVersion === 2
      ? sanitizeIdentityLedger(value.identityLedger)
      : {}

  for (const [siteKey, site] of Object.entries(sites)) {
    const markers = (identityLedger[siteKey] ??= {})
    for (const record of site.records) {
      record.siteKey = siteKey
      const digest = await digestAnnouncementFingerprint(record.fingerprint)
      const current = markers[digest]
      const nextMarker: SiteAnnouncementIdentityMarker = {
        firstSeenAt: current?.firstSeenAt ?? record.firstSeenAt,
        lastSeenAt: Math.max(current?.lastSeenAt ?? 0, record.lastSeenAt),
        readAt:
          current?.readAt ??
          (record.read ? record.readAt ?? record.lastSeenAt : undefined),
      }
      markers[digest] = nextMarker
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

class SiteAnnouncementStorage {
  private storage = new Storage({ area: "local" })

  private async getStoreOrThrow(): Promise<SiteAnnouncementStoreState> {
    const stored = await this.storage.get(STORAGE_KEYS.SITE_ANNOUNCEMENTS_STORE)
    return await sanitizeStore(stored)
  }

  async getStore(): Promise<SiteAnnouncementStoreState> {
    try {
      return await this.getStoreOrThrow()
    } catch (error) {
      logger.error("Failed to load site announcement store", error)
      return createEmptyStore()
    }
  }

  async setStore(store: SiteAnnouncementStoreState): Promise<boolean> {
    try {
      await this.storage.set(STORAGE_KEYS.SITE_ANNOUNCEMENTS_STORE, store)
      return true
    } catch (error) {
      logger.error("Failed to persist site announcement store", error)
      return false
    }
  }

  private async mutateStore<T>(
    mutation: (
      store: SiteAnnouncementStoreState,
    ) =>
      | { changed: boolean; result: T }
      | Promise<{ changed: boolean; result: T }>,
  ): Promise<T> {
    return withExtensionStorageWriteLock(
      STORAGE_LOCKS.SITE_ANNOUNCEMENTS,
      async () => {
        const store = await this.getStoreOrThrow()
        const { changed, result } = await mutation(store)
        const previousIdentityLedger = serializeIdentityLedger(
          store.identityLedger,
        )
        const prunedIdentityLedger = pruneIdentityLedger(store.identityLedger, {
          identitiesPerSite: SITE_ANNOUNCEMENTS_LIMITS.identitiesPerSite,
          identitiesTotal: SITE_ANNOUNCEMENTS_LIMITS.identitiesTotal,
        })
        const pruningChanged =
          previousIdentityLedger !==
          serializeIdentityLedger(prunedIdentityLedger)
        if (changed || pruningChanged) {
          store.identityLedger = prunedIdentityLedger
          if (!(await this.setStore(store))) {
            throw new Error("Failed to persist site announcement store")
          }
        }
        return result
      },
    )
  }

  async listRecords(): Promise<SiteAnnouncementRecord[]> {
    const store = await this.getStore()
    return Object.values(store.sites)
      .flatMap((site) => site.records)
      .sort((a, b) => b.firstSeenAt - a.firstSeenAt)
  }

  async getStatus(): Promise<SiteAnnouncementSiteState[]> {
    const store = await this.getStore()
    return Object.values(store.sites).sort(
      (a, b) => (b.lastCheckedAt ?? 0) - (a.lastCheckedAt ?? 0),
    )
  }

  async upsertSiteStatus(
    site: Omit<SiteAnnouncementSiteState, "records">,
  ): Promise<void> {
    await this.mutateStore((store) => {
      const current = store.sites[site.siteKey]
      store.sites[site.siteKey] = {
        ...current,
        ...site,
        records: current?.records ?? [],
      }
      return { changed: true, result: undefined }
    })
  }

  async upsertDiscoveredRecords(params: {
    site: Omit<SiteAnnouncementSiteState, "records" | "status"> & {
      status: SiteAnnouncementStatus
    }
    records: SiteAnnouncementRecordInput[]
    now?: number
  }): Promise<SiteAnnouncementRecord[]> {
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
        record: { ...representative, readAt },
      })
    }
    const inputs = [...inputsByDigest.values()].sort((left, right) =>
      compareStringsOrdinal(left.digest, right.digest),
    )

    return await this.mutateStore((store) => {
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
            isFiniteNumber(input.readAt)
          ) {
            knownMarker.readAt = input.readAt
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

        const readAt = isFiniteNumber(input.readAt) ? input.readAt : undefined
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
    })
  }

  async updateNotificationState(
    siteKey: string,
    recordIds: string[],
    input: { notifiedAt?: number; notificationError?: string },
  ): Promise<void> {
    await this.mutateStore((store) => {
      if (recordIds.length === 0) {
        return { changed: false, result: undefined }
      }

      const site = store.sites[siteKey]
      if (!site) {
        return { changed: false, result: undefined }
      }

      const recordIdSet = new Set(recordIds)
      let changed = false
      for (const record of site.records) {
        if (!recordIdSet.has(record.id)) {
          continue
        }
        changed ||=
          record.notifiedAt !== input.notifiedAt ||
          record.notificationError !== input.notificationError
        record.notifiedAt = input.notifiedAt
        record.notificationError = input.notificationError
      }

      const notifiedRecord = site.records.find((record) =>
        recordIdSet.has(record.id),
      )
      if (notifiedRecord && input.notifiedAt) {
        changed ||= site.lastNotifiedFingerprint !== notifiedRecord.fingerprint
        site.lastNotifiedFingerprint = notifiedRecord.fingerprint
      }
      return { changed, result: undefined }
    })
  }

  async markRead(recordId: string): Promise<boolean> {
    return await this.mutateStore(async (store) => {
      for (const site of Object.values(store.sites)) {
        const record = site.records.find((item) => item.id === recordId)
        if (record && !record.read) {
          const now = Date.now()
          const digest = await digestAnnouncementFingerprint(record.fingerprint)
          const markers = (store.identityLedger[site.siteKey] ??= {})
          const marker = (markers[digest] ??= {
            firstSeenAt: record.firstSeenAt,
            lastSeenAt: record.lastSeenAt,
          })
          marker.readAt = now
          record.read = true
          record.readAt = now
          return { changed: true, result: true }
        }
      }
      return { changed: false, result: false }
    })
  }

  async markAllRead(siteKey?: string): Promise<number> {
    return await this.mutateStore(async (store) => {
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
            recordSyncChanged ||=
              !record.read || record.readAt !== marker.readAt
            record.read = true
            record.readAt = marker.readAt
          }
        }
      }

      return {
        changed: changedCount > 0 || recordSyncChanged,
        result: changedCount,
      }
    })
  }

  async recordFailure(params: {
    siteKey: string
    siteName: string
    siteType: AccountSiteType
    baseUrl: string
    accountId: string
    providerId: SiteAnnouncementProviderId
    status: SiteAnnouncementStatus
    error?: string
    now?: number
  }): Promise<void> {
    const now = params.now ?? Date.now()
    try {
      await this.upsertSiteStatus({
        siteKey: params.siteKey,
        siteName: params.siteName,
        siteType: params.siteType,
        baseUrl: params.baseUrl,
        accountId: params.accountId,
        providerId: params.providerId,
        status: params.status,
        lastCheckedAt: now,
        lastError: params.error,
      })
    } catch (error) {
      logger.warn("Failed to record site announcement failure", {
        siteKey: params.siteKey,
        error: getErrorMessage(error),
      })
    }
  }
}

export const siteAnnouncementStorage = new SiteAnnouncementStorage()
