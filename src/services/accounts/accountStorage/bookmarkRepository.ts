import {
  buildEntryIdSets,
  removeEntryIdsFromLayout,
} from "~/services/accounts/accountEntryLayoutPolicy"
import type { SiteBookmark } from "~/types"
import { safeRandomUUID } from "~/utils/core/identifier"
import { createLogger } from "~/utils/core/logger"
import { t } from "~/utils/i18n/core"

import { accountConfigStore } from "./accountConfigStore"
import {
  createBookmarkDeletedEntryRecord,
  normalizeBookmarkInput,
} from "./configPolicies"

const logger = createLogger("BookmarkRepository")

class BookmarkRepository {
  private generateBookmarkId(): string {
    return safeRandomUUID("bookmark")
  }

  async getAllBookmarks(): Promise<SiteBookmark[]> {
    return (await accountConfigStore.readOrDefault()).bookmarks
  }

  async getBookmarkById(id: string): Promise<SiteBookmark | null> {
    if (!id) return null
    return (
      (await this.getAllBookmarks()).find((bookmark) => bookmark.id === id) ||
      null
    )
  }

  async addBookmark(input: {
    name: string
    url: string
    tagIds?: unknown
    notes?: unknown
  }): Promise<string> {
    try {
      const normalized = normalizeBookmarkInput(input)
      return await accountConfigStore.mutate((config) => {
        const now = Date.now()
        const { entryIds } = buildEntryIdSets(config)
        let id = this.generateBookmarkId()
        while (entryIds.has(id)) id = this.generateBookmarkId()

        config.bookmarks.push({
          id,
          ...normalized,
          created_at: now,
          updated_at: now,
        })
        return { result: id, changed: true }
      })
    } catch (error) {
      logger.error("添加书签失败", error)
      throw error
    }
  }

  async updateBookmark(
    id: string,
    updates: Partial<Pick<SiteBookmark, "name" | "url" | "tagIds" | "notes">>,
  ): Promise<boolean> {
    try {
      return await accountConfigStore.mutate((config) => {
        const index = config.bookmarks.findIndex(
          (bookmark) => bookmark.id === id,
        )
        if (index === -1) {
          throw new Error(
            t("messages:errors.operation.failed", {
              error: "Bookmark not found",
            }),
          )
        }
        const current = config.bookmarks[index]
        const normalized = normalizeBookmarkInput({
          name: updates.name ?? current.name,
          url: updates.url ?? current.url,
          tagIds: updates.tagIds ?? current.tagIds,
          notes: updates.notes ?? current.notes,
        })
        config.bookmarks[index] = {
          ...current,
          ...normalized,
          created_at: current.created_at,
          updated_at: Date.now(),
        }
        return { result: true, changed: true }
      })
    } catch (error) {
      logger.error("更新书签失败", { bookmarkId: id, error })
      return false
    }
  }

  async deleteBookmark(id: string): Promise<boolean> {
    try {
      return await accountConfigStore.mutate((config) => {
        const current = config.bookmarks.find((bookmark) => bookmark.id === id)
        if (!current) {
          throw new Error(
            t("messages:errors.operation.failed", {
              error: "Bookmark not found",
            }),
          )
        }
        config.bookmarks = config.bookmarks.filter(
          (bookmark) => bookmark.id !== id,
        )
        removeEntryIdsFromLayout(config, new Set([id]))
        config.deletedEntryRecords = {
          ...(config.deletedEntryRecords || {}),
          [id]: createBookmarkDeletedEntryRecord(current, Date.now()),
        }
        return { result: true, changed: true }
      })
    } catch (error) {
      logger.error("删除书签失败", { bookmarkId: id, error })
      return false
    }
  }
}

export const bookmarkRepository = new BookmarkRepository()
