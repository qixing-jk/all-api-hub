import { isAccountSiteType } from "~/constants/siteType"
import {
  AccountUpdateUserTimestampMode,
  applySiteAccountUpdates,
} from "~/services/accounts/accountDefaults"
import {
  getAutoCheckinCandidateMethodIds,
  isCheckInMethodId,
} from "~/services/checkin/autoCheckin/providers/registry"
import {
  markCheckInMethodExecuted,
  mergeDiscoveredCheckInDraft,
  mergeRefreshedCheckInStatus,
  mergeUserOwnedCheckInDraft,
} from "~/services/checkin/autoCheckin/state"
import type { SiteAccount } from "~/types"
import type { CheckInMethodSelection } from "~/types/checkIn"
import type { DeepPartial } from "~/types/utils"
import { createLogger } from "~/utils/core/logger"
import { t } from "~/utils/i18n/core"

import { accountConfigStore } from "./accountConfigStore"
import type { UpdateAccountOptions } from "./accountMutations"

const logger = createLogger("AccountCheckInState")

class AccountCheckInState {
  async updateAccountWithCheckInDraft(
    id: string,
    updates: Omit<DeepPartial<SiteAccount>, "checkIn">,
    draft: SiteAccount["checkIn"],
    options: UpdateAccountOptions & {
      selectionChanged?: boolean
      discoveryBaseSelection?: CheckInMethodSelection
      refreshed?: SiteAccount["checkIn"]
    },
  ): Promise<boolean> {
    try {
      return await accountConfigStore.mutateAccount(id, (account) => {
        const effectiveSiteType = isAccountSiteType(updates.site_type)
          ? updates.site_type
          : account.site_type
        const mergedUserDraft = options.discoveryBaseSelection
          ? mergeDiscoveredCheckInDraft({
              latest: account.checkIn,
              draft,
              candidateMethodIds:
                getAutoCheckinCandidateMethodIds(effectiveSiteType),
              discoveryBaseSelection: options.discoveryBaseSelection,
              selectionChanged: options.selectionChanged,
            })
          : mergeUserOwnedCheckInDraft({
              latest: account.checkIn,
              draft,
              selectionChanged: options.selectionChanged,
            })
        const checkIn = options.refreshed
          ? mergeRefreshedCheckInStatus({
              latest: mergedUserDraft,
              refreshed: options.refreshed,
            })
          : mergedUserDraft

        return {
          nextAccount: applySiteAccountUpdates({
            account,
            updates: { ...updates, checkIn },
            now: Date.now(),
            userTimestampMode: options.userTimestampMode,
          }),
          result: true,
          changed: true,
        }
      })
    } catch (error) {
      logger.error(t("messages:storage.updateFailed", { error: "" }), error)
      return false
    }
  }

  async updateAccountCheckInDraft(
    id: string,
    draft: SiteAccount["checkIn"],
    options: {
      selectionChanged?: boolean
      discoveryBaseSelection?: CheckInMethodSelection
      refreshed?: SiteAccount["checkIn"]
    } = {},
  ): Promise<boolean> {
    return this.updateAccountWithCheckInDraft(id, {}, draft, {
      ...options,
      userTimestampMode: AccountUpdateUserTimestampMode.Touch,
    })
  }

  /** Applies remote refresh data without replacing newer user-owned fields. */
  async updateAccountFromRefresh(
    id: string,
    updates: DeepPartial<SiteAccount>,
    refreshedCheckIn?: SiteAccount["checkIn"],
  ): Promise<boolean> {
    try {
      return await accountConfigStore.mutateAccount(id, (account) => {
        let checkIn = account.checkIn
        if (refreshedCheckIn) {
          checkIn = mergeRefreshedCheckInStatus({
            latest: checkIn,
            refreshed: refreshedCheckIn,
          })
        }

        const today = new Date().toISOString().split("T")[0]
        if (
          refreshedCheckIn &&
          checkIn.customCheckIn?.url &&
          checkIn.customCheckIn.lastCheckInDate &&
          checkIn.customCheckIn.lastCheckInDate !== today
        ) {
          checkIn = {
            ...checkIn,
            customCheckIn: {
              ...checkIn.customCheckIn,
              isCheckedInToday: false,
              lastCheckInDate: undefined,
            },
          }
        }

        return {
          nextAccount: applySiteAccountUpdates({
            account,
            updates: { ...updates, checkIn },
            now: Date.now(),
            userTimestampMode: AccountUpdateUserTimestampMode.Preserve,
          }),
          result: true,
          changed: true,
        }
      })
    } catch (error) {
      logger.error(t("messages:storage.updateFailed", { error: "" }), error)
      return false
    }
  }

  async prepareAccountForSelectedCheckIn(
    id: string,
    refreshedConfig?: SiteAccount["checkIn"],
  ): Promise<SiteAccount | null> {
    try {
      return await accountConfigStore.mutateAccount(id, (account) => {
        const checkIn = refreshedConfig
          ? mergeRefreshedCheckInStatus({
              latest: account.checkIn,
              refreshed: refreshedConfig,
            })
          : account.checkIn
        const nextAccount =
          checkIn === account.checkIn
            ? account
            : applySiteAccountUpdates({
                account,
                updates: { checkIn },
                now: Date.now(),
                userTimestampMode: AccountUpdateUserTimestampMode.Preserve,
              })
        return {
          nextAccount,
          result: nextAccount,
          changed: nextAccount !== account,
        }
      })
    } catch (error) {
      logger.warn("准备账号签到状态失败", { accountId: id, error })
      return null
    }
  }

  async markAccountAsSiteCheckedIn(id: string): Promise<boolean> {
    try {
      return await accountConfigStore.mutateAccount(id, (account) => {
        if (account.disabled) {
          return { nextAccount: account, result: false, changed: false }
        }
        const selectedMethodId = account.checkIn.selection.methodId
        const nextCheckIn = isCheckInMethodId(selectedMethodId)
          ? markCheckInMethodExecuted({
              config: account.checkIn,
              methodId: selectedMethodId,
              observedAt: Date.now(),
            })
          : account.checkIn
        if (nextCheckIn === account.checkIn) {
          return { nextAccount: account, result: false, changed: false }
        }
        return {
          nextAccount: applySiteAccountUpdates({
            account,
            updates: { checkIn: nextCheckIn },
            now: Date.now(),
            userTimestampMode: AccountUpdateUserTimestampMode.Preserve,
          }),
          result: true,
          changed: true,
        }
      })
    } catch (error) {
      logger.error("标记账号为已签到失败", { accountId: id, error })
      return false
    }
  }

  async markAccountAsCustomCheckedIn(id: string): Promise<boolean> {
    try {
      return await accountConfigStore.mutateAccount(id, (account) => {
        const customCheckIn = account.checkIn.customCheckIn
        if (
          account.disabled ||
          typeof customCheckIn?.url !== "string" ||
          customCheckIn.url.trim() === ""
        ) {
          return { nextAccount: account, result: false, changed: false }
        }
        const nextCheckIn = {
          ...account.checkIn,
          customCheckIn: {
            ...customCheckIn,
            isCheckedInToday: true,
            lastCheckInDate: new Date().toISOString().split("T")[0],
          },
        }
        return {
          nextAccount: applySiteAccountUpdates({
            account,
            updates: { checkIn: nextCheckIn },
            now: Date.now(),
            userTimestampMode: AccountUpdateUserTimestampMode.Preserve,
          }),
          result: true,
          changed: true,
        }
      })
    } catch (error) {
      logger.error("标记账号外部签到为已完成失败", { accountId: id, error })
      return false
    }
  }

  async resetExpiredCheckIns(): Promise<void> {
    try {
      const today = new Date().toISOString().split("T")[0]
      const didReset = await accountConfigStore.mutate((config) => {
        let changed = false
        for (const account of config.accounts) {
          if (
            account.checkIn?.customCheckIn?.url &&
            account.checkIn.customCheckIn.lastCheckInDate &&
            account.checkIn.customCheckIn.lastCheckInDate !== today &&
            account.checkIn.customCheckIn.isCheckedInToday === true
          ) {
            account.checkIn.customCheckIn.isCheckedInToday = false
            changed = true
          }
        }
        return { result: changed, changed }
      })
      if (didReset) logger.info("已重置过期的签到状态")
    } catch (error) {
      logger.error("重置签到状态失败", error)
    }
  }
}

export const accountCheckInState = new AccountCheckInState()
