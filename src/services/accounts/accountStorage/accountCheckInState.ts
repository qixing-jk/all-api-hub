import { isAccountSiteType } from "~/constants/siteType"
import {
  AccountUpdateUserTimestampMode,
  applySiteAccountUpdates,
  type AccountUpdateOptions,
} from "~/services/accounts/accountDefaults"
import { normalizeAccountIdentity } from "~/services/accounts/accountIdentity"
import { shouldAutomaticallyDiscoverAccountCheckIn } from "~/services/checkin/autoCheckin/inspection"
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

const logger = createLogger("AccountCheckInState")

const getUtcDayKey = (): string => new Date().toISOString().split("T")[0]

const hasSameCheckInIdentity = (account: SiteAccount, snapshot: SiteAccount) =>
  account.id === snapshot.id &&
  account.site_type === snapshot.site_type &&
  account.site_url === snapshot.site_url &&
  normalizeAccountIdentity(account.account_info.id) ===
    normalizeAccountIdentity(snapshot.account_info.id)

/** Rejects discovery from an obsolete request, selection, or cooldown claim. */
export const isAutomaticCheckInDiscoveryCurrent = (
  account: SiteAccount,
  snapshot: SiteAccount,
): boolean =>
  hasSameCheckInIdentity(account, snapshot) &&
  account.authType === snapshot.authType &&
  account.account_info.access_token === snapshot.account_info.access_token &&
  account.cookieAuth?.sessionCookie === snapshot.cookieAuth?.sessionCookie &&
  !account.disabled &&
  account.checkIn.automaticExecutionEnabled &&
  account.checkIn.selection.mode === snapshot.checkIn.selection.mode &&
  account.checkIn.selection.methodId === snapshot.checkIn.selection.methodId &&
  account.checkIn.methodKnowledge.lastAutomaticDiscoveryAttemptAt ===
    snapshot.checkIn.methodKnowledge.lastAutomaticDiscoveryAttemptAt

class AccountCheckInState {
  /** Claims one bounded automatic discovery under the existing account write lock. */
  async claimAutomaticCheckInDiscovery(id: string): Promise<{
    account: SiteAccount
    claimed: boolean
  } | null> {
    try {
      return await accountConfigStore.mutateAccount<{
        account: SiteAccount
        claimed: boolean
      }>(id, (account) => {
        const now = Date.now()
        if (!shouldAutomaticallyDiscoverAccountCheckIn(account, now)) {
          return {
            nextAccount: account,
            result: { account, claimed: false },
            changed: false,
          }
        }

        const nextAccount = applySiteAccountUpdates({
          account,
          updates: {
            checkIn: {
              ...account.checkIn,
              methodKnowledge: {
                ...account.checkIn.methodKnowledge,
                lastAutomaticDiscoveryAttemptAt: now,
              },
            },
          },
          now,
          userTimestampMode: AccountUpdateUserTimestampMode.Preserve,
        })
        return {
          nextAccount,
          result: { account: nextAccount, claimed: true },
          changed: true,
        }
      })
    } catch (error) {
      logger.warn("Failed to reserve automatic check-in discovery", {
        accountId: id,
        error,
      })
      return null
    }
  }

  /** Applies discovery only to the account/request/selection that was probed. */
  async completeAutomaticCheckInDiscovery(
    snapshot: SiteAccount,
    discovered: SiteAccount["checkIn"],
  ): Promise<{ account: SiteAccount; applied: boolean } | null> {
    try {
      return await accountConfigStore.mutateAccount<{
        account: SiteAccount
        applied: boolean
      }>(snapshot.id, (account) => {
        if (!isAutomaticCheckInDiscoveryCurrent(account, snapshot)) {
          return {
            nextAccount: account,
            result: { account, applied: false },
            changed: false,
          }
        }

        const merged = mergeDiscoveredCheckInDraft({
          latest: account.checkIn,
          draft: discovered,
          candidateMethodIds: getAutoCheckinCandidateMethodIds(
            account.site_type,
            account.site_url,
          ),
          discoveryBaseSelection: snapshot.checkIn.selection,
        })
        const applied =
          (merged.methodKnowledge.lastFullDiscoveryAt ?? 0) >
          (account.checkIn.methodKnowledge.lastFullDiscoveryAt ?? 0)
        // Discovery owns facts and automatic selection, never the form's fields.
        const checkIn = {
          ...account.checkIn,
          methodKnowledge: merged.methodKnowledge,
          selection: merged.selection,
        }
        const nextAccount = applySiteAccountUpdates({
          account,
          updates: { checkIn },
          now: Date.now(),
          userTimestampMode: AccountUpdateUserTimestampMode.Preserve,
        })
        return {
          nextAccount,
          result: { account: nextAccount, applied },
          changed: true,
        }
      })
    } catch (error) {
      logger.warn("Failed to save automatic check-in discovery", {
        accountId: snapshot.id,
        error,
      })
      return null
    }
  }

  async updateAccountWithCheckInDraft(
    id: string,
    updates: Omit<DeepPartial<SiteAccount>, "checkIn">,
    draft: SiteAccount["checkIn"],
    options: AccountUpdateOptions & {
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
              candidateMethodIds: getAutoCheckinCandidateMethodIds(
                effectiveSiteType,
                updates.site_url ?? account.site_url,
                draft,
              ),
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

        const today = getUtcDayKey()
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
    requestSnapshot?: SiteAccount,
  ): Promise<SiteAccount | null> {
    try {
      return await accountConfigStore.mutateAccount<SiteAccount | null>(
        id,
        (account) => {
          if (
            requestSnapshot &&
            !hasSameCheckInIdentity(account, requestSnapshot)
          ) {
            return { nextAccount: account, result: null, changed: false }
          }
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
        },
      )
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
            lastCheckInDate: getUtcDayKey(),
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
      const today = getUtcDayKey()
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
