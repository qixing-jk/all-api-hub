import { Storage } from "@plasmohq/storage"

import {
  isAccountSiteType,
  SITE_TYPES,
  type AccountSiteType,
} from "~/constants/siteType"
import { STORAGE_KEYS, STORAGE_LOCKS } from "~/services/core/storageKeys"
import { withExtensionStorageWriteLock } from "~/services/core/storageWriteLock"
import type {
  SiteAnnouncementProviderId,
  SiteAnnouncementRecord,
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

const logger = createLogger("SiteAnnouncementStorage")

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
  }
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
    firstSeenAt:
      typeof value.firstSeenAt === "number" ? value.firstSeenAt : Date.now(),
    lastSeenAt:
      typeof value.lastSeenAt === "number"
        ? value.lastSeenAt
        : typeof value.firstSeenAt === "number"
          ? value.firstSeenAt
          : Date.now(),
    createdAt:
      typeof value.createdAt === "number" ? value.createdAt : undefined,
    updatedAt:
      typeof value.updatedAt === "number" ? value.updatedAt : undefined,
    notifiedAt:
      typeof value.notifiedAt === "number" ? value.notifiedAt : undefined,
    notificationError:
      typeof value.notificationError === "string"
        ? value.notificationError
        : undefined,
    read: value.read === true,
    readAt: typeof value.readAt === "number" ? value.readAt : undefined,
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
        .slice(0, SITE_ANNOUNCEMENTS_LIMITS.recordsPerSite)
    : []

  return {
    siteKey,
    siteName: typeof value.siteName === "string" ? value.siteName : "",
    siteType: sanitizeSiteType(value.siteType),
    baseUrl: typeof value.baseUrl === "string" ? value.baseUrl : "",
    accountId: typeof value.accountId === "string" ? value.accountId : "",
    providerId: normalizeProviderId(value.providerId),
    status: sanitizeStatus(value.status),
    lastCheckedAt:
      typeof value.lastCheckedAt === "number" ? value.lastCheckedAt : undefined,
    lastSuccessAt:
      typeof value.lastSuccessAt === "number" ? value.lastSuccessAt : undefined,
    lastError:
      typeof value.lastError === "string" ? value.lastError : undefined,
    lastNotifiedFingerprint:
      typeof value.lastNotifiedFingerprint === "string"
        ? value.lastNotifiedFingerprint
        : undefined,
    records,
  }
}

/**
 * Validates the persisted store and drops data from incompatible schemas.
 */
function sanitizeStore(value: unknown): SiteAnnouncementStoreState {
  if (!isPlainObject(value)) {
    return createEmptyStore()
  }

  if (value.schemaVersion !== SITE_ANNOUNCEMENTS_STORE_SCHEMA_VERSION) {
    return createEmptyStore()
  }

  const sites: Record<string, SiteAnnouncementSiteState> = {}
  if (isPlainObject(value.sites)) {
    for (const [siteKey, siteValue] of Object.entries(value.sites)) {
      const siteState = sanitizeSiteState(siteKey, siteValue)
      if (siteState) {
        sites[siteKey] = siteState
      }
    }
  }

  return {
    schemaVersion: SITE_ANNOUNCEMENTS_STORE_SCHEMA_VERSION,
    sites,
  }
}

class SiteAnnouncementStorage {
  private storage = new Storage({ area: "local" })

  private async withStorageWriteLock<T>(work: () => Promise<T>): Promise<T> {
    return withExtensionStorageWriteLock(STORAGE_LOCKS.SITE_ANNOUNCEMENTS, work)
  }

  async getStore(): Promise<SiteAnnouncementStoreState> {
    try {
      const stored = await this.storage.get(
        STORAGE_KEYS.SITE_ANNOUNCEMENTS_STORE,
      )
      return sanitizeStore(stored)
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

  async updateStore(
    updater: (
      store: SiteAnnouncementStoreState,
    ) => SiteAnnouncementStoreState | void,
  ): Promise<SiteAnnouncementStoreState> {
    return this.withStorageWriteLock(async () => {
      const current = await this.getStore()
      const updated = updater(current) ?? current
      if (!(await this.setStore(updated))) {
        throw new Error("Failed to persist site announcement store")
      }
      return updated
    })
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
    site: Omit<SiteAnnouncementSiteState, "records"> & {
      records?: SiteAnnouncementRecord[]
    },
  ): Promise<void> {
    await this.updateStore((store) => {
      const current = store.sites[site.siteKey]
      store.sites[site.siteKey] = {
        ...current,
        ...site,
        records: site.records ?? current?.records ?? [],
      }
    })
  }

  async upsertDiscoveredRecords(params: {
    site: Omit<SiteAnnouncementSiteState, "records" | "status"> & {
      status: SiteAnnouncementStatus
    }
    records: Array<
      Omit<SiteAnnouncementRecord, "id" | "firstSeenAt" | "lastSeenAt" | "read">
    >
    now?: number
  }): Promise<SiteAnnouncementRecord[]> {
    const now = params.now ?? Date.now()
    const createdRecords: SiteAnnouncementRecord[] = []

    await this.updateStore((store) => {
      const current = store.sites[params.site.siteKey]
      const records = [...(current?.records ?? [])]

      for (const input of params.records) {
        const existing = records.find(
          (record) => record.fingerprint === input.fingerprint,
        )

        if (existing) {
          existing.lastSeenAt = now
          continue
        }

        const record: SiteAnnouncementRecord = {
          ...input,
          id: safeRandomUUID("site-announcement"),
          firstSeenAt: now,
          lastSeenAt: now,
          read: typeof input.readAt === "number",
        }
        records.unshift(record)
        createdRecords.push(record)
      }

      records.sort((a, b) => b.firstSeenAt - a.firstSeenAt)
      store.sites[params.site.siteKey] = {
        ...current,
        ...params.site,
        records: records.slice(0, SITE_ANNOUNCEMENTS_LIMITS.recordsPerSite),
      }
    })

    return createdRecords
  }

  async updateNotificationState(
    siteKey: string,
    recordIds: string[],
    input: { notifiedAt?: number; notificationError?: string },
  ): Promise<void> {
    if (recordIds.length === 0) {
      return
    }

    await this.updateStore((store) => {
      const site = store.sites[siteKey]
      if (!site) {
        return
      }

      const recordIdSet = new Set(recordIds)
      for (const record of site.records) {
        if (!recordIdSet.has(record.id)) {
          continue
        }
        record.notifiedAt = input.notifiedAt
        record.notificationError = input.notificationError
      }

      const notifiedRecord = site.records.find((record) =>
        recordIdSet.has(record.id),
      )
      if (notifiedRecord && input.notifiedAt) {
        site.lastNotifiedFingerprint = notifiedRecord.fingerprint
      }
    })
  }

  async markRead(recordId: string): Promise<boolean> {
    const now = Date.now()
    let changed = false
    await this.updateStore((store) => {
      for (const site of Object.values(store.sites)) {
        const record = site.records.find((item) => item.id === recordId)
        if (record && !record.read) {
          record.read = true
          record.readAt = now
          changed = true
          break
        }
      }
    })
    return changed
  }

  async markAllRead(siteKey?: string): Promise<number> {
    const now = Date.now()
    let changedCount = 0
    await this.updateStore((store) => {
      const sites = siteKey
        ? store.sites[siteKey]
          ? [store.sites[siteKey]]
          : []
        : Object.values(store.sites)

      for (const site of sites) {
        for (const record of site.records) {
          if (!record.read) {
            record.read = true
            record.readAt = now
            changedCount += 1
          }
        }
      }
    })

    return changedCount
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
