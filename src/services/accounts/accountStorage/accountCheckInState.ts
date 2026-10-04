import {
  CHECK_IN_METHOD_DETECTION_OUTCOMES,
  CHECK_IN_SELECTION_MODES,
} from "~/constants/checkIn"
import { isAccountSiteType } from "~/constants/siteType"
import {
  AccountUpdateUserTimestampMode,
  applySiteAccountUpdates,
  type AccountUpdateOptions,
} from "~/services/accounts/accountDefaults"
import { normalizeAccountIdentity } from "~/services/accounts/accountIdentity"
import { setCheckInSelection } from "~/services/checkin/autoCheckin/domain"
import { shouldAutomaticallyDiscoverAccountCheckIn } from "~/services/checkin/autoCheckin/inspection"
import {
  getAutoCheckinCandidateMethodIds,
  isCheckInMethodId,
} from "~/services/checkin/autoCheckin/providers/registry"
import {
  invalidateCheckInDiscovery,
  markCheckInMethodExecuted,
  mergeDiscoveredCheckInDraft,
  mergeRefreshedCheckInStatus,
  mergeUserOwnedCheckInDraft,
} from "~/services/checkin/autoCheckin/state"
import {
  AccountWriteRejectedError,
  type AccountWriteGuard,
} from "~/services/core/accountWriteGuard"
import type { SiteAccount } from "~/types"
import type { CheckInMethodId, CheckInMethodSelection } from "~/types/checkIn"
import type { DeepPartial } from "~/types/utils"
import { formatLocalDayKey } from "~/utils/core/dayKey"
import { createLogger } from "~/utils/core/logger"
import { t } from "~/utils/i18n/core"

import { accountConfigStore } from "./accountConfigStore"

const logger = createLogger("AccountCheckInState")

const hasSameCheckInIdentity = (account: SiteAccount, snapshot: SiteAccount) =>
  account.id === snapshot.id &&
  account.site_type === snapshot.site_type &&
  account.site_url === snapshot.site_url &&
  normalizeAccountIdentity(account.account_info.id) ===
    normalizeAccountIdentity(snapshot.account_info.id)

/** Compares the identity and credentials actually used by a check-in request. */
const hasSameCheckInCredentials = (
  account: SiteAccount,
  snapshot: SiteAccount,
) =>
  hasSameCheckInIdentity(account, snapshot) &&
  account.authType === snapshot.authType &&
  account.account_info.access_token === snapshot.account_info.access_token &&
  account.cookieAuth?.sessionCookie === snapshot.cookieAuth?.sessionCookie

/** A foreground probe or choice must still refer to the same request and discovery. */
const isUserCheckInDiscoveryCurrent = (
  account: SiteAccount,
  snapshot: SiteAccount,
) =>
  hasSameCheckInCredentials(account, snapshot) &&
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
  hasSameCheckInCredentials(account, snapshot) &&
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

  async updateAccountWithCheckInDraft(
    id: string,
    updates: Omit<DeepPartial<SiteAccount>, "checkIn">,
    draft: SiteAccount["checkIn"],
    options: AccountUpdateOptions & {
      selectionChanged?: boolean
      discoveryBaseSelection?: CheckInMethodSelection
      refreshed?: SiteAccount["checkIn"]
      /** Runs inside the account storage lock; throwing aborts the update. */
      guard?: AccountWriteGuard
      /** Credential pair loaded by the editor, before any background rotation. */
      loadedKimiAuth?: {
        accessToken: string
        refreshToken?: string
        organizationId?: string
      }
    },
  ): Promise<boolean> {
    const { guard, ...mutationOptions } = options
    try {
      return await accountConfigStore.mutateAccount(
        id,
        (account) => {
          const loaded = mutationOptions.loadedKimiAuth
          const effectiveUpdates = { ...updates }
          // An unchanged editor does not own session credentials. Preserve the
          // latest pair atomically with the unrelated form edit.
          if (
            loaded &&
            updates.account_info?.access_token === loaded.accessToken &&
            updates.kimiOpenPlatformAuth?.refreshToken ===
              loaded.refreshToken &&
            updates.kimiOpenPlatformAuth?.organizationId ===
              loaded.organizationId &&
            (account.account_info.access_token !== loaded.accessToken ||
              account.kimiOpenPlatformAuth?.refreshToken !==
                loaded.refreshToken ||
              account.kimiOpenPlatformAuth?.organizationId !==
                loaded.organizationId)
          ) {
            delete effectiveUpdates.kimiOpenPlatformAuth
            if (effectiveUpdates.account_info) {
              effectiveUpdates.account_info = {
                ...effectiveUpdates.account_info,
              }
              delete effectiveUpdates.account_info.access_token
            }
          }
          const effectiveSiteType = isAccountSiteType(updates.site_type)
            ? updates.site_type
            : account.site_type
          const mergedUserDraft = mutationOptions.discoveryBaseSelection
            ? mergeDiscoveredCheckInDraft({
                latest: account.checkIn,
                draft,
                candidateMethodIds: getAutoCheckinCandidateMethodIds(
                  effectiveSiteType,
                  updates.site_url ?? account.site_url,
                ),
                discoveryBaseSelection: mutationOptions.discoveryBaseSelection,
                selectionChanged: mutationOptions.selectionChanged,
              })
            : mergeUserOwnedCheckInDraft({
                latest: account.checkIn,
                draft,
                selectionChanged: mutationOptions.selectionChanged,
              })
          const checkIn = mutationOptions.refreshed
            ? mergeRefreshedCheckInStatus({
                latest: mergedUserDraft,
                refreshed: mutationOptions.refreshed,
              })
            : mergedUserDraft

          const nextAccount = applySiteAccountUpdates({
            account,
            updates: { ...effectiveUpdates, checkIn },
            now: Date.now(),
            userTimestampMode: mutationOptions.userTimestampMode,
          })
          const hasFreshDraftDiscovery =
            mutationOptions.discoveryBaseSelection &&
            (checkIn.methodKnowledge.lastFullDiscoveryAt ?? 0) >
              (account.checkIn.methodKnowledge.lastFullDiscoveryAt ?? 0)
          if (
            !hasSameCheckInCredentials(nextAccount, account) &&
            !hasFreshDraftDiscovery
          ) {
            // Existing facts may still be useful, but a different credential
            // must establish its own completed discovery after this save.
            nextAccount.checkIn = invalidateCheckInDiscovery(
              nextAccount.checkIn,
            )
          }
          return {
            nextAccount,
            result: true,
            changed: true,
          }
        },
        { guard },
      )
    } catch (error) {
      // A rejected guard is a decided outcome, not a storage failure: the caller
      // reports why the update was refused instead of a generic save error.
      if (error instanceof AccountWriteRejectedError) throw error
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
    requestSnapshot?: SiteAccount,
  ): Promise<boolean> {
    try {
      return await accountConfigStore.mutateAccount(id, (account) => {
        if (
          requestSnapshot &&
          !hasSameCheckInIdentity(account, requestSnapshot)
        ) {
          return { nextAccount: account, result: false, changed: false }
        }
        const effectiveUpdates = {
          ...updates,
          account_info: { ...updates.account_info },
        }
        if (
          requestSnapshot &&
          account.account_info.username !==
            requestSnapshot.account_info.username
        ) {
          delete effectiveUpdates.account_info.username
        }
        if (
          requestSnapshot &&
          (account.authType !== requestSnapshot.authType ||
            account.account_info.access_token !==
              requestSnapshot.account_info.access_token ||
            account.cookieAuth?.sessionCookie !==
              requestSnapshot.cookieAuth?.sessionCookie ||
            account.sub2apiAuth?.refreshToken !==
              requestSnapshot.sub2apiAuth?.refreshToken ||
            account.kimiOpenPlatformAuth?.refreshToken !==
              requestSnapshot.kimiOpenPlatformAuth?.refreshToken)
        ) {
          delete effectiveUpdates.account_info.access_token
          delete effectiveUpdates.account_info.id
          delete effectiveUpdates.account_info.username
          delete effectiveUpdates.sub2apiAuth
          delete effectiveUpdates.kimiOpenPlatformAuth
        }
        let checkIn = account.checkIn
        if (refreshedCheckIn) {
          checkIn = mergeRefreshedCheckInStatus({
            latest: checkIn,
            refreshed: refreshedCheckIn,
          })
        }

        const today = formatLocalDayKey()
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
            updates: { ...effectiveUpdates, checkIn },
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
