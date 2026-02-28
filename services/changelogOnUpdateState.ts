import { Storage } from "@plasmohq/storage"

import { STORAGE_KEYS, STORAGE_LOCKS } from "~/services/core/storageKeys"
import { withExtensionStorageWriteLock } from "~/services/storageWriteLock"

class ChangelogOnUpdateStateService {
  private storage: Storage

  constructor() {
    this.storage = new Storage({
      area: "local",
    })
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

  async consumePendingVersion(): Promise<string | null> {
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
        await this.storage.remove(
          STORAGE_KEYS.CHANGELOG_ON_UPDATE_PENDING_VERSION,
        )

        return pending || null
      },
    )
  }
}

export const changelogOnUpdateState = new ChangelogOnUpdateStateService()
