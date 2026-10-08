import { Storage } from "@plasmohq/storage"

import { type AccountSiteType } from "~/constants/siteType"
import { STORAGE_KEYS, STORAGE_LOCKS } from "~/services/core/storageKeys"
import { withExtensionStorageWriteLock } from "~/services/core/storageWriteLock"
import {
  createEmptyStore,
  finalizeAnnouncementProjection,
  markAllAnnouncementIdentitiesRead,
  markAnnouncementRecordsRead,
  prepareAnnouncementDiscovery,
  prepareAnnouncementReadIdentities,
  removeAnnouncementSites,
  sanitizeStore,
} from "~/services/siteAnnouncements/announcementProjection"
import type {
  AnnouncementSourceScope,
  SiteAnnouncementRecord,
  SiteAnnouncementRecordInput,
  SiteAnnouncementSiteState,
  SiteAnnouncementStatus,
  SiteAnnouncementStoreState,
} from "~/types/siteAnnouncements"
import { getErrorMessage } from "~/utils/core/error"
import { createLogger } from "~/utils/core/logger"
import { isPlainObject } from "~/utils/core/object"

import { SITE_ANNOUNCEMENTS_STORE_SCHEMA_VERSION } from "./constants"

const logger = createLogger("SiteAnnouncementStorage")
class SiteAnnouncementStorage {
  private storage = new Storage({ area: "local" })

  private async getStoreOrThrow(): Promise<SiteAnnouncementStoreState> {
    return (await this.readStoreOrThrow()).store
  }

  private async readStoreOrThrow() {
    const stored = await this.storage.get(STORAGE_KEYS.SITE_ANNOUNCEMENTS_STORE)
    return {
      store: await sanitizeStore(stored),
      needsMigration:
        isPlainObject(stored) &&
        stored.schemaVersion !== SITE_ANNOUNCEMENTS_STORE_SCHEMA_VERSION,
    }
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
        const { store, needsMigration } = await this.readStoreOrThrow()
        const { changed, result } = await mutation(store)
        const pruningChanged = finalizeAnnouncementProjection(store)
        if (changed || pruningChanged || needsMigration) {
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
    const apply = await prepareAnnouncementDiscovery(params)
    return this.mutateStore(apply)
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
    return (await this.markRecordsRead([recordId])) > 0
  }

  /**
   * Marks discovered identities read even when their cached records were
   * evicted by per-site retention before the caller classified the batch.
   */
  async markRecordIdentitiesRead(
    records: ReadonlyArray<
      Pick<
        SiteAnnouncementRecord,
        "siteKey" | "fingerprint" | "firstSeenAt" | "lastSeenAt"
      >
    >,
  ): Promise<number> {
    if (records.length === 0) {
      return 0
    }

    const apply = await prepareAnnouncementReadIdentities(records)
    return this.mutateStore(apply)
  }

  /**
   * Marks several records as read in one write, for batches that were stored as
   * history rather than as news.
   */
  async markRecordsRead(recordIds: string[]): Promise<number> {
    if (recordIds.length === 0) {
      return 0
    }

    const requestedRecordIds = [...new Set(recordIds)]
    return this.mutateStore((store) =>
      markAnnouncementRecordsRead(store, requestedRecordIds),
    )
  }

  async markAllRead(siteKey?: string): Promise<number> {
    return this.mutateStore((store) =>
      markAllAnnouncementIdentitiesRead(store, siteKey),
    )
  }

  /**
   * Drops persisted sites by key, together with their identity markers.
   *
   * Markers go with the site so a site that comes back later is a first
   * sighting again instead of a resurrection of the identity that was removed.
   */
  async removeSites(
    siteKeys: readonly string[],
  ): Promise<{ sites: number; records: number }> {
    const keys = new Set(siteKeys)
    if (keys.size === 0) {
      return { sites: 0, records: 0 }
    }

    const requestedSiteKeys = [...keys]
    return this.mutateStore((store) =>
      removeAnnouncementSites(store, requestedSiteKeys),
    )
  }

  async recordFailure(params: {
    siteKey: string
    siteName: string
    siteType: AccountSiteType
    baseUrl: string
    accountId: string
    sourceScope: AnnouncementSourceScope
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
        sourceScope: params.sourceScope,
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
