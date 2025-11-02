import { Storage } from "@plasmohq/storage"

import type { ModelMappingResult } from "~/types"

const STORAGE_KEY = "mappings.modelMapping"

class ModelRedirectStorage {
  private storage: Storage

  constructor() {
    this.storage = new Storage({
      area: "local"
    })
  }

  async getMapping(): Promise<ModelMappingResult | null> {
    try {
      const stored = (await this.storage.get(STORAGE_KEY)) as
        | ModelMappingResult
        | undefined
      return stored ?? null
    } catch (error) {
      console.error("[ModelRedirectStorage] Failed to get mapping:", error)
      return null
    }
  }

  async saveMapping(record: ModelMappingResult): Promise<boolean> {
    try {
      await this.storage.set(STORAGE_KEY, record)
      return true
    } catch (error) {
      console.error("[ModelRedirectStorage] Failed to save mapping:", error)
      return false
    }
  }

  async clearMapping(): Promise<boolean> {
    try {
      await this.storage.remove(STORAGE_KEY)
      return true
    } catch (error) {
      console.error("[ModelRedirectStorage] Failed to clear mapping:", error)
      return false
    }
  }
}

export const modelRedirectStorage = new ModelRedirectStorage()
