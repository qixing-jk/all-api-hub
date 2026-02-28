import { Storage } from "@plasmohq/storage"

import type { AutoCheckinStatus } from "~/types/autoCheckin"
import { createLogger } from "~/utils/logger"

const logger = createLogger("AutoCheckinStorage")

/**
 * Storage keys for Auto Check-in
 */
const STORAGE_KEYS = {
  AUTO_CHECKIN_STATUS: "autoCheckin_status",
} as const

/**
 * Storage service for Auto Check-in
 */
class AutoCheckinStorage {
  private storage: Storage

  constructor() {
    this.storage = new Storage({
      area: "local",
    })
  }

  /**
   * Get auto check-in status
   */
  async getStatus(): Promise<AutoCheckinStatus | null> {
    try {
      const stored = (await this.storage.get(
        STORAGE_KEYS.AUTO_CHECKIN_STATUS,
      )) as AutoCheckinStatus | undefined

      return stored || null
    } catch (error) {
      logger.error("Failed to get status", error)
      return null
    }
  }

  /**
   * Save auto check-in status
   */
  async saveStatus(status: AutoCheckinStatus): Promise<boolean> {
    try {
      await this.storage.set(STORAGE_KEYS.AUTO_CHECKIN_STATUS, status)
      logger.debug("Status saved")
      return true
    } catch (error) {
      logger.error("Failed to save status", error)
      return false
    }
  }

  /**
   * Clear auto check-in status
   */
  async clearStatus(): Promise<boolean> {
    try {
      await this.storage.remove(STORAGE_KEYS.AUTO_CHECKIN_STATUS)
      logger.debug("Status cleared")
      return true
    } catch (error) {
      logger.error("Failed to clear status", error)
      return false
    }
  }
}

// Create singleton instance
export const autoCheckinStorage = new AutoCheckinStorage()
