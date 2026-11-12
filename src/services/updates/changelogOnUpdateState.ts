import { Storage } from "@plasmohq/storage"

import { STORAGE_KEYS, STORAGE_LOCKS } from "~/services/core/storageKeys"
import { withExtensionStorageWriteLock } from "~/services/core/storageWriteLock"

class ChangelogOnUpdateStateService {
  private storage: Storage

  constructor() {
    this.storage = new Storage({
      area: "local",
    })
  }

  /** Read without consuming so unpublished notes survive until a later visit. */
  async getPendingVersion(): Promise<string | null> {
    const raw: unknown = await this.storage.get(
      STORAGE_KEYS.CHANGELOG_ON_UPDATE_PENDING_VERSION,
    )
    return typeof raw === "string" ? raw.trim() || null : null
  }

  async setPendingVersion(version: string): Promise<void> {
    const trimmed = version.trim()
    if (!trimmed) {
      return
    }

    await withExtensionStorageWriteLock(STORAGE_LOCKS.CHANGELOG_ON_UPDATE, () =>
      this.storage.set(
        STORAGE_KEYS.CHANGELOG_ON_UPDATE_PENDING_VERSION,
        trimmed,
      ),
    )
  }

  async consumePendingVersion(
    expectedVersion?: string,
  ): Promise<string | null> {
    return await withExtensionStorageWriteLock(
      STORAGE_LOCKS.CHANGELOG_ON_UPDATE,
      async () => {
        const raw = (await this.storage.get(
          STORAGE_KEYS.CHANGELOG_ON_UPDATE_PENDING_VERSION,
        )) as unknown

        if (raw == null) {
          return null
        }

        if (typeof raw !== "string") {
          await this.storage.remove(
            STORAGE_KEYS.CHANGELOG_ON_UPDATE_PENDING_VERSION,
          )
          return null
        }

        const pending = raw.trim()
        if (expectedVersion && pending !== expectedVersion) return null
        await this.storage.remove(
          STORAGE_KEYS.CHANGELOG_ON_UPDATE_PENDING_VERSION,
        )

        return pending || null
      },
    )
  }
}

export const changelogOnUpdateState = new ChangelogOnUpdateStateService()
