import { createLogger } from "~/utils/core/logger"

import { accountConfigStore } from "./accountConfigStore"
import { buildEntryIdSets, replaceIdListSubset } from "./configPolicies"

const logger = createLogger("AccountEntryLayout")

class AccountEntryLayout {
  async getPinnedList(): Promise<string[]> {
    try {
      return (await accountConfigStore.readOrDefault()).pinnedAccountIds
    } catch (error) {
      logger.error("获取置顶账号列表失败", error)
      return []
    }
  }

  async getOrderedList(): Promise<string[]> {
    try {
      return (await accountConfigStore.readOrDefault()).orderedAccountIds
    } catch (error) {
      logger.error("获取自定义排序列表失败", error)
      return []
    }
  }

  async setPinnedList(ids: string[]): Promise<boolean> {
    try {
      return await accountConfigStore.mutate((config) => {
        const { entryIds } = buildEntryIdSets(config)
        config.pinnedAccountIds = Array.from(new Set(ids)).filter((id) =>
          entryIds.has(id),
        )
        return { result: true, changed: true }
      })
    } catch (error) {
      logger.error("设置置顶账号列表失败", error)
      return false
    }
  }

  async setOrderedList(ids: string[]): Promise<boolean> {
    try {
      return await accountConfigStore.mutate((config) => {
        const { entryIds } = buildEntryIdSets(config)
        config.orderedAccountIds = Array.from(new Set(ids)).filter((id) =>
          entryIds.has(id),
        )
        return { result: true, changed: true }
      })
    } catch (error) {
      logger.error("设置自定义排序列表失败", error)
      return false
    }
  }

  async setPinnedListSubset(input: {
    entryType: "account" | "bookmark"
    ids: string[]
  }): Promise<boolean> {
    return this.setListSubset("pinnedAccountIds", input)
  }

  async setOrderedListSubset(input: {
    entryType: "account" | "bookmark"
    ids: string[]
  }): Promise<boolean> {
    return this.setListSubset("orderedAccountIds", input)
  }

  async setAccountListOrder(input: {
    pinnedIds: string[]
    orderedIds: string[]
  }): Promise<boolean> {
    try {
      return await accountConfigStore.mutate((config) => {
        const { accountIds, entryIds } = buildEntryIdSets(config)
        config.pinnedAccountIds = replaceIdListSubset({
          existingIds: config.pinnedAccountIds,
          subsetIdSet: accountIds,
          nextSubsetIds: Array.from(new Set(input.pinnedIds)),
        }).filter((id) => entryIds.has(id))
        config.orderedAccountIds = replaceIdListSubset({
          existingIds: config.orderedAccountIds,
          subsetIdSet: accountIds,
          nextSubsetIds: Array.from(new Set(input.orderedIds)),
        }).filter((id) => entryIds.has(id))
        return { result: true, changed: true }
      })
    } catch (error) {
      logger.error("设置账号排序失败", error)
      return false
    }
  }

  /** Moves an account to the front in one locked read-modify-write. */
  async pinAccount(id: string): Promise<boolean> {
    try {
      return await accountConfigStore.mutate((config) => {
        const { entryIds } = buildEntryIdSets(config)
        if (!entryIds.has(id)) return { result: true, changed: false }
        config.pinnedAccountIds = [
          id,
          ...config.pinnedAccountIds.filter((entryId) => entryId !== id),
        ].filter((entryId) => entryIds.has(entryId))
        return { result: true, changed: true }
      })
    } catch (error) {
      logger.error("置顶账号失败", { accountId: id, error })
      return false
    }
  }

  /** Removes an account from the pinned list in one locked transaction. */
  async unpinAccount(id: string): Promise<boolean> {
    try {
      return await accountConfigStore.mutate((config) => {
        const next = config.pinnedAccountIds.filter((entryId) => entryId !== id)
        if (next.length === config.pinnedAccountIds.length) {
          return { result: true, changed: false }
        }
        config.pinnedAccountIds = next
        return { result: true, changed: true }
      })
    } catch (error) {
      logger.error("取消置顶账号失败", { accountId: id, error })
      return false
    }
  }

  async isPinned(id: string): Promise<boolean> {
    return (await this.getPinnedList()).includes(id)
  }

  private async setListSubset(
    key: "pinnedAccountIds" | "orderedAccountIds",
    input: { entryType: "account" | "bookmark"; ids: string[] },
  ): Promise<boolean> {
    try {
      return await accountConfigStore.mutate((config) => {
        const { accountIds, bookmarkIds, entryIds } = buildEntryIdSets(config)
        const subsetIdSet =
          input.entryType === "account" ? accountIds : bookmarkIds
        config[key] = replaceIdListSubset({
          existingIds: config[key],
          subsetIdSet,
          nextSubsetIds: Array.from(new Set(input.ids)),
        }).filter((id) => entryIds.has(id))
        return { result: true, changed: true }
      })
    } catch (error) {
      logger.error(
        key === "pinnedAccountIds" ? "设置置顶列表失败" : "设置排序列表失败",
        { entryType: input.entryType, error },
      )
      return false
    }
  }
}

export const accountEntryLayout = new AccountEntryLayout()
