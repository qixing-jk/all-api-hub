import { isAccountSiteType } from "~/constants/siteType"
import type { AccountData } from "~/services/accounts/accountDataModel"
import { removeEntryIdsFromLayout } from "~/services/accounts/accountEntryLayoutPolicy"
import type { LoadedSub2ApiAuth } from "~/services/accounts/accountPersistence/request"
import {
  ACCOUNT_SITE_SUPPLEMENTAL_AUTH_KINDS,
  getAccountSiteProductProfile,
} from "~/services/accounts/accountSiteProfile"
import { normalizeAccountSiteSupplementalAuth } from "~/services/accounts/accountSiteProfile/supplementalAuth"
import { getAccountBalanceSnapshots } from "~/services/accounts/balanceSnapshot"
import {
  AccountUpdateUserTimestampMode,
  applySiteAccountUpdates,
  createPersistedSiteAccount,
  type AccountUpdateOptions,
} from "~/services/accounts/editing/accountDefaults"
import {
  hasSameAccountRequestIdentity,
  hasSameCheckInRequestCredentials,
} from "~/services/accounts/identity/accountIdentity"
import { buildAccountRefreshUpdate } from "~/services/accounts/refresh/accountRefreshUpdate"
import { acceptAccountAllowances } from "~/services/accounts/refresh/allowanceAcceptance"
import {
  acceptBalanceRefresh,
  LEGACY_BALANCE_SUPERSEDED_REASON,
  snapshotRefreshParts,
  staleBalancePosition,
} from "~/services/accounts/refresh/balanceAcceptance"
import { acceptPeriodAmounts } from "~/services/accounts/refresh/periodAmountAcceptance"
import { acceptUsageState } from "~/services/accounts/refresh/usageAcceptance"
import { assetIdentity } from "~/services/amounts/assets"
import {
  balancePositionKey,
  balanceSnapshotSchema,
  financialCollectionKey,
  isKnownOrStaleObservation,
} from "~/services/amounts/balance"
import {
  ASSET_KINDS,
  BALANCE_VALIDITY_KINDS,
  EVIDENCE_KINDS,
  FINANCIAL_COVERAGE,
  FINANCIAL_ENUMERATION,
  FINANCIAL_OBSERVATION_REASONS,
  FINANCIAL_SUBJECT_KINDS,
  OBSERVATION_STATUSES,
  SCOPE_SELECTION_KINDS,
} from "~/services/amounts/financialConstants"
import { getSiteTypeCapabilities } from "~/services/apiAdapters/registry"
import { getAutoCheckinCandidateMethodIds } from "~/services/checkin/autoCheckin/providers/registry"
import {
  invalidateCheckInDiscovery,
  mergeDiscoveredCheckInDraft,
  mergeRefreshedCheckInStatus,
  mergeUserOwnedCheckInDraft,
} from "~/services/checkin/autoCheckin/state"
import { autoCheckinStorage } from "~/services/checkin/autoCheckin/storage"
import {
  AccountWriteRejectedError,
  type AccountWriteGuard,
} from "~/services/core/accountWriteGuard"
import { maybeCaptureDailyBalanceSnapshot } from "~/services/history/dailyBalanceHistory/capture"
import { userPreferences } from "~/services/preferences/userPreferences"
import { verificationResultHistoryStorage } from "~/services/verification/verificationResultHistory"
import {
  AuthTypeEnum,
  type AccountStorageConfig,
  type SiteAccount,
} from "~/types"
import type { CheckInMethodSelection } from "~/types/checkIn"
import { DAILY_BALANCE_HISTORY_CAPTURE_SOURCES } from "~/types/dailyBalanceHistory"
import type { DeepPartial } from "~/types/utils"
import { formatLocalDayKey } from "~/utils/core/dayKey"
import { safeRandomUUID } from "~/utils/core/identifier"
import { createLogger } from "~/utils/core/logger"
import { t } from "~/utils/i18n/core"

import { accountConfigStore } from "./accountConfigStore"
import { createAccountDeletedEntryRecord } from "./configPolicies"

const logger = createLogger("AccountMutations")

/** Provider cleanup follows the committed write and never changes its outcome. */
async function cleanupDeletedAccounts(accounts: SiteAccount[]): Promise<void> {
  for (const account of accounts) {
    try {
      await getSiteTypeCapabilities(
        account.site_type,
      ).account?.persistence?.cleanupDeletedAccount?.(account)
    } catch {
      logger.error("Failed to clean up deleted account credentials", {
        accountId: account.id,
      })
    }
  }
}

/**
 * Drops persisted verification results owned by accounts that no longer exist.
 *
 * Runs after the account write has committed, never inside the account lock: the
 * verification store takes its own write lock and the lock is not reentrant. A
 * failure is logged rather than propagated, so a cleanup problem cannot fail the
 * deletion the caller asked for.
 */
async function pruneDeletedAccountVerificationResults(
  accountIds: string[],
): Promise<void> {
  if (accountIds.length === 0) return

  try {
    await verificationResultHistoryStorage.reconcileOwners({
      removeAccountIds: accountIds,
    })
  } catch (error) {
    logger.error("清理账号验证结果失败", { accountIds, error })
  }
}

type UpdateAccountOptions = AccountUpdateOptions

const removeAccountsFromConfig = (
  config: AccountStorageConfig,
  deletedAccounts: SiteAccount[],
  layoutIdsToRemove: Set<string>,
  now: number,
): void => {
  const deletedIds = new Set(deletedAccounts.map((account) => account.id))
  config.accounts = config.accounts.filter(
    (account) => !deletedIds.has(account.id),
  )
  removeEntryIdsFromLayout(config, layoutIdsToRemove)
  config.deletedEntryRecords = {
    ...(config.deletedEntryRecords || {}),
    ...Object.fromEntries(
      deletedAccounts.map((account) => [
        account.id,
        createAccountDeletedEntryRecord(account, now),
      ]),
    ),
  }
}

/** The editor and background refresh share collection acceptance and failure semantics. */
function acceptedFinancialSnapshot(
  account: SiteAccount,
  incoming: unknown,
  parts: AccountData["balanceRefreshParts"],
  attempted: boolean,
) {
  const snapshot =
    incoming === undefined ? undefined : balanceSnapshotSchema.parse(incoming)
  const observedParts =
    parts ?? (snapshot ? snapshotRefreshParts(snapshot) : undefined)
  const asOf = Date.now()
  let previous = account.account_info.balance
  if (
    previous?.positions.some(
      (position) => position.amount.source.kind === EVIDENCE_KINDS.Legacy,
    )
  ) {
    // Materialize saved details before retiring an aggregate that owns their tree.
    previous = getAccountBalanceSnapshots(account).reported
    const completePositions = (observedParts ?? [])
      .filter((part) => part.enumeration === FINANCIAL_ENUMERATION.Complete)
      .flatMap((part) => part.positions)
    const retired = new Set<string>()
    for (const old of previous.positions) {
      if (old.amount.source.kind !== EVIDENCE_KINDS.Legacy) continue
      const corresponding = completePositions.filter(
        (position) =>
          position.amount.source.kind !== EVIDENCE_KINDS.Legacy &&
          position.scope.authority === old.scope.authority &&
          position.asset.kind !== ASSET_KINDS.Unknown &&
          assetIdentity(position.asset) === assetIdentity(old.asset) &&
          position.scope.subject.kind === FINANCIAL_SUBJECT_KINDS.Account &&
          (!position.scope.subject.accountId ||
            position.scope.subject.accountId === account.id) &&
          (!old.scope.walletId ||
            old.scope.walletId === position.scope.walletId) &&
          (!old.scope.organizationId ||
            old.scope.organizationId === position.scope.organizationId) &&
          (!old.scope.workspaceId ||
            old.scope.workspaceId === position.scope.workspaceId) &&
          [
            position.scope.projects,
            position.scope.keys,
            position.scope.models,
            position.scope.groups,
            ...(position.scope.routes ? [position.scope.routes] : []),
          ].every(
            (selection) => selection.kind !== SCOPE_SELECTION_KINDS.Restricted,
          ) &&
          old.role === position.role &&
          (old.parentId
            ? (old.labelKey !== undefined &&
                old.labelKey === position.labelKey) ||
              (old.label !== undefined && old.label === position.label)
            : !position.parentId),
      )
      // One component or credit limit cannot establish the old available total.
      if (
        corresponding.length &&
        new Set(
          corresponding.map((position) =>
            financialCollectionKey(
              position.collectionKey,
              position.amount.source,
            ),
          ),
        ).size === 1 &&
        corresponding.every(
          (position) =>
            position.amount.status === OBSERVATION_STATUSES.Known &&
            (position.validity.kind !== BALANCE_VALIDITY_KINDS.Expires ||
              position.validity.at > asOf),
        )
      )
        retired.add(balancePositionKey(old))
    }
    const superseded = new Set(retired)
    for (const position of previous.positions) {
      if (retired.has(balancePositionKey(position))) continue
      let parent = position.parentId
      while (parent) {
        const key = balancePositionKey(position, parent)
        retired.delete(key)
        parent = previous.positions.find(
          (candidate) => balancePositionKey(candidate) === key,
        )?.parentId
      }
    }
    previous = {
      ...previous,
      positions: previous.positions
        .filter((position) => !retired.has(balancePositionKey(position)))
        .map((position) =>
          superseded.has(balancePositionKey(position)) &&
          isKnownOrStaleObservation(position.amount)
            ? {
                ...position,
                amount: {
                  ...position.amount,
                  status: OBSERVATION_STATUSES.Stale,
                  reason: LEGACY_BALANCE_SUPERSEDED_REASON,
                },
              }
            : position,
        ),
    }
  }
  if (parts)
    return acceptBalanceRefresh(
      previous,
      parts,
      { kind: FINANCIAL_SUBJECT_KINDS.Account, accountId: account.id },
      Date.now(),
    )
  if (snapshot) {
    return previous?.positions.length
      ? acceptBalanceRefresh(
          previous,
          snapshotRefreshParts(snapshot),
          snapshot.subject,
          snapshot.capturedAt,
        )
      : snapshot
  }
  if (attempted && previous)
    return {
      ...previous,
      capturedAt: Date.now(),
      coverage: FINANCIAL_COVERAGE.Partial,
      positions: previous.positions.map((position) =>
        staleBalancePosition(
          position,
          FINANCIAL_OBSERVATION_REASONS.RefreshFailed,
        ),
      ),
    }
  return undefined
}

class AccountMutations {
  /** Reserves a monotonic generation under the same cross-context account lock. */
  async beginBalanceRefresh(
    id: string,
    requestSnapshot: SiteAccount,
  ): Promise<number | null> {
    return accountConfigStore.runExclusive(async (transaction) => {
      const config = await transaction.read()
      const account = config.accounts.find((item) => item.id === id)
      if (!account) return null
      if (!hasSameAccountRequestIdentity(account, requestSnapshot)) return null
      const generation = await transaction.reserveFinancialGeneration(config)
      account.balanceRefreshGeneration = generation
      await transaction.write(config)
      return generation
    })
  }
  async updateAccountWithCheckInDraft(
    id: string,
    updates: Omit<DeepPartial<SiteAccount>, "checkIn">,
    draft: SiteAccount["checkIn"],
    options: AccountUpdateOptions & {
      selectionChanged?: boolean
      discoveryBaseSelection?: CheckInMethodSelection
      refreshed?: SiteAccount["checkIn"]
      /** Financial request reserved before editor network work; user fields still save if stale. */
      balanceRefresh?: {
        generation: number
        requestSnapshot: SiteAccount
        data?: AccountData
      }
      /** Runs inside the account storage lock; throwing aborts the update. */
      guard?: AccountWriteGuard
      loadedSub2ApiAuth?: LoadedSub2ApiAuth
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
      const committed = await accountConfigStore.mutateAccount(
        id,
        (account) => {
          const loaded = mutationOptions.loadedKimiAuth
          const effectiveUpdates = { ...updates }
          if (mutationOptions.balanceRefresh && effectiveUpdates.account_info) {
            // The editor owns identity fields. Provider observations enter only
            // after generation admission below, including counters and usage.
            const { id, username, access_token } = effectiveUpdates.account_info
            effectiveUpdates.account_info = { id, username, access_token }
          }
          const loadedSub2ApiAuth = mutationOptions.loadedSub2ApiAuth
          // Compare the same canonical auth shape produced by form persistence.
          const loadedSession = loadedSub2ApiAuth
            ? normalizeAccountSiteSupplementalAuth({
                siteType: account.site_type,
                sub2apiAuth: {
                  refreshToken: loadedSub2ApiAuth.refreshToken ?? "",
                  tokenExpiresAt: loadedSub2ApiAuth.tokenExpiresAt,
                },
              }).sub2apiAuth
            : undefined
          if (
            loadedSub2ApiAuth &&
            getAccountSiteProductProfile(account.site_type).authSession.kind ===
              ACCOUNT_SITE_SUPPLEMENTAL_AUTH_KINDS.Sub2ApiRefreshToken &&
            (updates.site_type ?? account.site_type) === account.site_type &&
            account.authType === AuthTypeEnum.AccessToken &&
            (updates.authType ?? account.authType) ===
              AuthTypeEnum.AccessToken &&
            account.site_url === loadedSub2ApiAuth.siteUrl &&
            (updates.site_url ?? account.site_url) ===
              loadedSub2ApiAuth.siteUrl &&
            account.account_info.id === loadedSub2ApiAuth.userId &&
            (updates.account_info?.id ?? account.account_info.id) ===
              loadedSub2ApiAuth.userId &&
            updates.account_info?.access_token ===
              loadedSub2ApiAuth.accessToken &&
            updates.sub2apiAuth?.refreshToken === loadedSession?.refreshToken &&
            updates.sub2apiAuth?.tokenExpiresAt ===
              loadedSession?.tokenExpiresAt
          ) {
            // Unchanged drafts do not own credentials recovered or rotated while
            // the editor was open. Preserve the latest complete pair under lock.
            delete effectiveUpdates.sub2apiAuth
            effectiveUpdates.account_info = { ...effectiveUpdates.account_info }
            delete effectiveUpdates.account_info.access_token
          }
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
          const financial = mutationOptions.balanceRefresh
          let acceptedFinancial = false
          if (financial) {
            if (
              account.balanceRefreshGeneration === financial.generation &&
              hasSameAccountRequestIdentity(
                nextAccount,
                financial.requestSnapshot,
              )
            ) {
              const data = financial.data
              const prior = {
                ...nextAccount,
                account_info: { ...nextAccount.account_info },
              }
              acceptedFinancial = true
              if (data)
                Object.assign(
                  nextAccount.account_info,
                  buildAccountRefreshUpdate(
                    nextAccount,
                    {
                      success: true,
                      data,
                      healthStatus: {
                        status: nextAccount.health.status,
                        message: nextAccount.health.reason ?? "",
                      },
                    },
                    false,
                  ).account_info,
                )
              nextAccount.account_info.allowances = acceptAccountAllowances(
                prior.account_info.allowances,
                data?.allowances,
                data?.allowanceRefreshParts,
                id,
                true,
                Date.now(),
              )
              nextAccount.account_info.balance = acceptedFinancialSnapshot(
                prior,
                data ? nextAccount.account_info.balance : undefined,
                data?.balanceRefreshParts,
                true,
              )
              nextAccount.account_info.settledConsumption = acceptPeriodAmounts(
                prior.account_info.settledConsumption,
                data?.settledConsumption,
              )
              nextAccount.account_info.reportedIncome = acceptPeriodAmounts(
                prior.account_info.reportedIncome,
                data?.reportedIncome,
              )
              Object.assign(
                nextAccount.account_info,
                acceptUsageState(prior.account_info, data),
              )
            } else {
              // A stale network result does not replace the last accepted refresh metadata.
              nextAccount.health = account.health
              nextAccount.last_sync_time = account.last_sync_time
            }
          }
          const hasFreshDraftDiscovery =
            mutationOptions.discoveryBaseSelection &&
            (checkIn.methodKnowledge.lastFullDiscoveryAt ?? 0) >
              (account.checkIn.methodKnowledge.lastFullDiscoveryAt ?? 0)
          if (
            !hasSameCheckInRequestCredentials(nextAccount, account) &&
            !hasFreshDraftDiscovery
          ) {
            // Existing facts may still be useful, but a different credential
            // must establish its own completed discovery after this save.
            nextAccount.checkIn = invalidateCheckInDiscovery(
              nextAccount.checkIn,
              { siteUrlChanged: nextAccount.site_url !== account.site_url },
            )
          }
          return {
            nextAccount,
            result: { account: nextAccount, acceptedFinancial },
            changed: true,
          }
        },
        { guard },
      )
      if (committed.acceptedFinancial) {
        try {
          const prefs = await userPreferences.getPreferences()
          const info = committed.account.account_info
          await maybeCaptureDailyBalanceSnapshot({
            config: prefs.balanceHistory,
            accountId: id,
            generation: committed.account.balanceRefreshGeneration,
            balance: info.balance,
            allowances: info.allowances,
            settledConsumption: info.settledConsumption,
            reportedIncome: info.reportedIncome,
            usage: [
              ...(info.usage ? [info.usage] : []),
              ...(info.usageObservations ?? []),
            ],
            source: DAILY_BALANCE_HISTORY_CAPTURE_SOURCES.Refresh,
          })
        } catch (error) {
          logger.warn("Failed to capture accepted editor balance", {
            accountId: id,
            error,
          })
        }
      }
      return true
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

  /**
   * Applies refresh data without replacing newer user-owned fields and returns
   * the committed snapshot for follow-ups, or null when the update is rejected.
   */
  async updateAccountFromRefresh(
    id: string,
    updates: DeepPartial<SiteAccount>,
    refreshedCheckIn?: SiteAccount["checkIn"],
    requestSnapshot?: SiteAccount,
    providerBalance?: Pick<
      AccountData,
      | "quota"
      | "balanceUnavailable"
      | "balanceRefreshParts"
      | "allowanceRefreshParts"
    >,
    balanceGeneration?: number,
  ): Promise<SiteAccount | null> {
    try {
      return await accountConfigStore.mutateAccount(id, (account) => {
        if (
          balanceGeneration !== undefined &&
          account.balanceRefreshGeneration !== balanceGeneration
        )
          return { nextAccount: account, result: null, changed: false }
        if (
          requestSnapshot &&
          !hasSameAccountRequestIdentity(account, requestSnapshot)
        ) {
          return { nextAccount: account, result: null, changed: false }
        }
        const effectiveUpdates = {
          ...updates,
          account_info: { ...updates.account_info },
        }
        const allowances = acceptAccountAllowances(
          account.account_info.allowances,
          effectiveUpdates.account_info.allowances,
          providerBalance?.allowanceRefreshParts,
          id,
          balanceGeneration !== undefined,
          Date.now(),
        )
        const balance = acceptedFinancialSnapshot(
          account,
          effectiveUpdates.account_info.balance,
          providerBalance?.balanceRefreshParts,
          balanceGeneration !== undefined,
        )
        if (balance !== undefined)
          effectiveUpdates.account_info.balance = balance
        effectiveUpdates.account_info.allowances = allowances
        if (balanceGeneration !== undefined) {
          const info = effectiveUpdates.account_info
          Object.assign(
            info,
            acceptUsageState(account.account_info, {
              usage: info.usage as SiteAccount["account_info"]["usage"],
              usageObservations:
                info.usageObservations as SiteAccount["account_info"]["usageObservations"],
            }),
          )
          info.settledConsumption = acceptPeriodAmounts(
            account.account_info.settledConsumption,
            info.settledConsumption as SiteAccount["account_info"]["settledConsumption"],
          )
          info.reportedIncome = acceptPeriodAmounts(
            account.account_info.reportedIncome,
            info.reportedIncome as SiteAccount["account_info"]["reportedIncome"],
          )
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

        const nextAccount = applySiteAccountUpdates({
          account,
          updates: { ...effectiveUpdates, checkIn },
          now: Date.now(),
          userTimestampMode: AccountUpdateUserTimestampMode.Preserve,
        })
        return {
          nextAccount,
          result: nextAccount,
          changed: true,
        }
      })
    } catch (error) {
      logger.error(t("messages:storage.updateFailed", { error: "" }), error)
      return null
    }
  }

  /**
   * Appends one account under the account storage lock.
   *
   * An optional guard runs inside that lock before the account is appended, so a
   * cross-account rule cannot race a concurrent save. Throwing aborts the write
   * with the in-memory config untouched.
   */
  async addAccount(
    accountData: Omit<
      SiteAccount,
      "id" | "created_at" | "updated_at" | "user_updated_at"
    >,
    options: { guard?: AccountWriteGuard } = {},
  ): Promise<string> {
    try {
      logger.info("开始添加新账号", { siteName: accountData.site_name })
      return await accountConfigStore.mutate((config) => {
        const now = Date.now()
        const account = createPersistedSiteAccount({
          account: accountData,
          id: safeRandomUUID("account"),
          now,
        })
        options.guard?.(config, account)
        config.accounts.push(account)
        return { result: account.id, changed: true }
      })
    } catch (error) {
      logger.error("添加账号失败", error)
      throw error
    }
  }

  async updateAccount(
    id: string,
    updates: DeepPartial<SiteAccount>,
    options: UpdateAccountOptions,
  ): Promise<boolean> {
    try {
      return await accountConfigStore.mutateAccount(id, (account) => ({
        nextAccount: applySiteAccountUpdates({
          account,
          updates,
          now: Date.now(),
          userTimestampMode: options.userTimestampMode,
        }),
        result: true,
        changed: true,
      }))
    } catch (error) {
      logger.error(t("messages:storage.updateFailed", { error: "" }), error)
      return false
    }
  }

  async setAccountDisabled(id: string, disabled: boolean): Promise<boolean> {
    const normalized = Boolean(disabled)
    try {
      const { updated, didDisable } = await accountConfigStore.mutateAccount(
        id,
        (account) => ({
          nextAccount: applySiteAccountUpdates({
            account,
            updates: { disabled: normalized },
            now: Date.now(),
            userTimestampMode: AccountUpdateUserTimestampMode.Touch,
          }),
          result: {
            updated: true,
            didDisable: normalized && account.disabled !== normalized,
          },
          changed: true,
        }),
      )

      if (didDisable) {
        const marked = await autoCheckinStorage.markAccountDisabledInStatus(id)
        if (!marked) {
          logger.warn("禁用账号后更新自动签到状态失败", { accountId: id })
        }
      }
      return updated
    } catch (error) {
      logger.error(t("messages:storage.updateFailed", { error: "" }), error)
      return false
    }
  }

  async setAccountsDisabled(
    ids: string[],
    disabled: boolean,
  ): Promise<{ updatedCount: number; updatedIds: string[] }> {
    const uniqueIds = Array.from(new Set(ids)).filter(Boolean)
    if (uniqueIds.length === 0) return { updatedCount: 0, updatedIds: [] }

    const idSet = new Set(uniqueIds)
    const normalized = Boolean(disabled)
    try {
      const changedAccountIds: string[] = []
      const result = await accountConfigStore.mutate((config) => {
        const now = Date.now()
        let updatedCount = 0
        config.accounts = config.accounts.map((account) => {
          if (!idSet.has(account.id) || account.disabled === normalized) {
            return account
          }
          updatedCount += 1
          changedAccountIds.push(account.id)
          return applySiteAccountUpdates({
            account,
            updates: { disabled: normalized },
            now,
            userTimestampMode: AccountUpdateUserTimestampMode.Touch,
          })
        })
        return {
          result: { updatedCount, updatedIds: changedAccountIds },
          changed: updatedCount > 0,
        }
      })

      if (normalized && changedAccountIds.length > 0) {
        const marked = await autoCheckinStorage.markAccountsDisabledInStatus(
          changedAccountIds.map((accountId) => ({ accountId })),
        )
        if (!marked) {
          logger.warn("批量禁用账号后更新自动签到状态失败", {
            accountIds: changedAccountIds,
          })
        }
      }
      return result
    } catch (error) {
      logger.error("批量更新账号禁用状态失败", {
        accountIds: uniqueIds,
        disabled: normalized,
        error,
      })
      return { updatedCount: 0, updatedIds: [] }
    }
  }

  async deleteAccount(id: string): Promise<boolean> {
    try {
      const deletedAccount = await accountConfigStore.mutate((config) => {
        const account = config.accounts.find((item) => item.id === id)
        if (!account) {
          logger.warn("Attempted to delete missing account", {
            accountId: id,
            existingAccounts: config.accounts.map((item) => ({
              id: item.id,
              name: item.site_name,
            })),
          })
          throw new Error(t("messages:storage.accountNotFound", { id }))
        }

        removeAccountsFromConfig(config, [account], new Set([id]), Date.now())
        return { result: account, changed: true }
      })
      void autoCheckinStorage.pruneStatusForAccountIds([id]).catch((error) => {
        logger.error("清理自动签到账号状态失败", { accountId: id, error })
      })
      await pruneDeletedAccountVerificationResults([id])
      await cleanupDeletedAccounts([deletedAccount])
      return true
    } catch (error) {
      logger.error("删除账号失败", { accountId: id, error })
      throw error
    }
  }

  async deleteAccounts(
    ids: string[],
  ): Promise<{ deletedCount: number; deletedIds: string[] }> {
    const uniqueIds = Array.from(new Set(ids)).filter(Boolean)
    if (uniqueIds.length === 0) return { deletedCount: 0, deletedIds: [] }
    const idSet = new Set(uniqueIds)

    try {
      const result = await accountConfigStore.mutate((config) => {
        const deletedAccounts = config.accounts.filter((account) =>
          idSet.has(account.id),
        )
        const deletedIds = deletedAccounts.map((account) => account.id)
        if (deletedIds.length === 0) {
          return {
            result: { deletedCount: 0, deletedIds: [], deletedAccounts: [] },
            changed: false,
          }
        }

        const now = Date.now()
        removeAccountsFromConfig(config, deletedAccounts, idSet, now)
        return {
          result: {
            deletedCount: deletedIds.length,
            deletedIds,
            deletedAccounts,
          },
          changed: true,
        }
      })

      if (result.deletedCount > 0) {
        void autoCheckinStorage
          .pruneStatusForAccountIds(result.deletedIds)
          .catch((error) => {
            logger.error("批量清理自动签到账号状态失败", {
              accountIds: result.deletedIds,
              error,
            })
          })
        await pruneDeletedAccountVerificationResults(result.deletedIds)
        await cleanupDeletedAccounts(result.deletedAccounts)
      }
      return {
        deletedCount: result.deletedCount,
        deletedIds: result.deletedIds,
      }
    } catch (error) {
      logger.error("批量删除账号失败", { accountIds: uniqueIds, error })
      throw error
    }
  }

  async updateSyncTime(id: string): Promise<boolean> {
    return this.updateAccount(
      id,
      { last_sync_time: Date.now() },
      { userTimestampMode: AccountUpdateUserTimestampMode.Preserve },
    )
  }
}

export const accountMutations = new AccountMutations()
