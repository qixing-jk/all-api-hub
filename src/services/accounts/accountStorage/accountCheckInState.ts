import {
  CHECK_IN_METHOD_DETECTION_OUTCOMES,
  CHECK_IN_SELECTION_MODES,
} from "~/constants/checkIn"
import {
  AccountUpdateUserTimestampMode,
  applySiteAccountUpdates,
} from "~/services/accounts/editing/accountDefaults"
import {
  hasSameAccountRequestIdentity,
  hasSameCheckInRequestCredentials,
} from "~/services/accounts/identity/accountIdentity"
import { shouldAutomaticallyDiscoverAccountCheckIn } from "~/services/checkin/autoCheckin/discovery/inspection"
import { setCheckInSelection } from "~/services/checkin/autoCheckin/domain"
import {
  getAutoCheckinCandidateMethodIds,
  isCheckInMethodId,
} from "~/services/checkin/autoCheckin/providers/registry"
import {
  markCheckInMethodExecuted,
  mergeDiscoveredCheckInDraft,
  mergeRefreshedCheckInStatus,
} from "~/services/checkin/autoCheckin/state"
import type { SiteAccount } from "~/types"
import type { CheckInMethodId } from "~/types/checkIn"
import { formatLocalDayKey } from "~/utils/core/dayKey"
import { createLogger } from "~/utils/core/logger"

import { accountConfigStore } from "./accountConfigStore"

const logger = createLogger("AccountCheckInState")

/** A foreground probe or choice must still refer to the same request and discovery. */
const isUserCheckInDiscoveryCurrent = (
  account: SiteAccount,
  snapshot: SiteAccount,
) =>
  hasSameCheckInRequestCredentials(account, snapshot) &&
  !account.disabled &&
  account.checkIn.selection.mode === snapshot.checkIn.selection.mode &&
  account.checkIn.selection.methodId === snapshot.checkIn.selection.methodId &&
  account.checkIn.methodKnowledge.lastFullDiscoveryAt ===
    snapshot.checkIn.methodKnowledge.lastFullDiscoveryAt &&
  account.checkIn.methodKnowledge.lastAutomaticDiscoveryAttemptAt ===
    snapshot.checkIn.methodKnowledge.lastAutomaticDiscoveryAttemptAt

/** Rejects discovery from an obsolete request, selection, or cooldown claim. */
export const isAutomaticCheckInDiscoveryCurrent = (
  account: SiteAccount,
  snapshot: SiteAccount,
): boolean =>
  hasSameCheckInRequestCredentials(account, snapshot) &&
  !account.disabled &&
  account.checkIn.automaticExecutionEnabled &&
  account.checkIn.selection.mode === snapshot.checkIn.selection.mode &&
  account.checkIn.selection.methodId === snapshot.checkIn.selection.methodId &&
  account.checkIn.methodKnowledge.lastAutomaticDiscoveryAttemptAt ===
    snapshot.checkIn.methodKnowledge.lastAutomaticDiscoveryAttemptAt

class AccountCheckInState {
  /** Commits a detected choice only while the dialog's identity, facts and selection remain current. */
  async selectDetectedCheckInMethod(
    snapshot: SiteAccount,
    methodId: CheckInMethodId,
  ): Promise<{ account: SiteAccount; applied: boolean } | null> {
    return accountConfigStore.mutate<{
      account: SiteAccount
      applied: boolean
    } | null>((config) => {
      const index = config.accounts.findIndex(
        (account) => account.id === snapshot.id,
      )
      const account = config.accounts[index]
      if (!account) return { result: null, changed: false }
      const candidates = getAutoCheckinCandidateMethodIds(
        account.site_type,
        account.site_url,
      )
      const isCurrent =
        isUserCheckInDiscoveryCurrent(account, snapshot) &&
        candidates.includes(methodId) &&
        account.checkIn.methodKnowledge.methods[methodId]?.detection
          ?.outcome === CHECK_IN_METHOD_DETECTION_OUTCOMES.Matched &&
        !account.checkIn.methodKnowledge.methods[methodId]?.detection
          .lastUnknownAttempt
      if (!isCurrent)
        return {
          result: { account, applied: false },
          changed: false,
        }
      const checkIn = setCheckInSelection({
        config: account.checkIn,
        candidateMethodIds: candidates,
        selection: { mode: CHECK_IN_SELECTION_MODES.Manual, methodId },
      })
      const nextAccount = applySiteAccountUpdates({
        account,
        updates: { checkIn },
        now: Date.now(),
        userTimestampMode: AccountUpdateUserTimestampMode.Touch,
      })
      config.accounts[index] = nextAccount
      return {
        result: { account: nextAccount, applied: true },
        changed: true,
      }
    })
  }

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
    return this.completeCheckInDiscovery(
      snapshot,
      discovered,
      isAutomaticCheckInDiscoveryCurrent,
    )
  }

  /** Applies foreground discovery without requiring automatic execution. */
  async completeUserCheckInDiscovery(
    snapshot: SiteAccount,
    discovered: SiteAccount["checkIn"],
  ): Promise<{ account: SiteAccount; applied: boolean } | null> {
    return this.completeCheckInDiscovery(
      snapshot,
      discovered,
      isUserCheckInDiscoveryCurrent,
    )
  }

  /** Merges discovery facts inside the account write lock after a source guard. */
  private async completeCheckInDiscovery(
    snapshot: SiteAccount,
    discovered: SiteAccount["checkIn"],
    isCurrent: (account: SiteAccount, snapshot: SiteAccount) => boolean,
  ): Promise<{ account: SiteAccount; applied: boolean } | null> {
    try {
      return await accountConfigStore.mutateAccount<{
        account: SiteAccount
        applied: boolean
      }>(snapshot.id, (account) => {
        if (!isCurrent(account, snapshot)) {
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
      logger.warn("Failed to save check-in discovery", {
        accountId: snapshot.id,
        error,
      })
      return null
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
            !hasSameAccountRequestIdentity(account, requestSnapshot)
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
            lastCheckInDate: formatLocalDayKey(),
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
      const today = formatLocalDayKey()
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
