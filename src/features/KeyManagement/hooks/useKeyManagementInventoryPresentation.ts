import { useCallback, useMemo, useRef } from "react"
import { useTranslation } from "react-i18next"

import {
  ACCOUNT_RUNTIME_KEY_SOURCES,
  buildAccountKeyResourceRuntimeKeyFromFacts,
  hasUsableAccountRuntimeKeySecret,
} from "~/services/accounts/accountRuntimeKeys"
import { supportsRecoverableAccountRuntimeKeySecrets } from "~/services/accounts/keyProductCapabilities"
import type { AccountKeyResourceFacts } from "~/services/apiAdapters/contracts/accountKeyResource"
import { getSiteTypeCapabilities } from "~/services/apiAdapters/registry"

import { KEY_MANAGEMENT_ALL_ACCOUNTS_VALUE } from "../constants"
import type { useAccountKeyResourceController } from "../controllers/useAccountKeyResourceController"
import {
  KEY_MANAGEMENT_DISPLAY_ROW_KINDS,
  type KeyManagementAccountSummaryItem,
  type KeyManagementAggregateCounts,
  type NativeKeyManagementRow,
} from "../types"
import type { useKeyCredentialAssociations } from "./useKeyCredentialAssociations"
import type { useKeyManagement } from "./useKeyManagement"

type NativeInventory = Pick<
  ReturnType<typeof useAccountKeyResourceController>,
  | "allRows"
  | "rows"
  | "selectedScope"
  | "getResourceScope"
  | "failures"
  | "settledAccountIds"
  | "isLoading"
  | "progress"
  | "retryFailed"
  | "isScopeInventoryLoading"
>
type CredentialInventory = Pick<
  ReturnType<typeof useKeyManagement>,
  | "displayData"
  | "selectedAccount"
  | "allAccountsFilterAccountIds"
  | "entries"
  | "filteredEntries"
  | "accountSummaryItems"
  | "failedAccounts"
  | "tokenLoadProgress"
  | "isLoading"
  | "currentAccountLoadError"
  | "retryFailedAccounts"
>

/** Keeps rows, honest counts, progress and partial failures consistent across both inventories. */
export function useKeyManagementInventoryPresentation({
  nativeKeys,
  credentialInventory,
  getProfileForLocator,
}: {
  nativeKeys: NativeInventory
  credentialInventory: CredentialInventory
  getProfileForLocator: ReturnType<
    typeof useKeyCredentialAssociations
  >["getProfileForLocator"]
}) {
  const { t } = useTranslation([
    "keyManagement",
    "common",
    "apiCredentialProfiles",
  ])
  const {
    displayData,
    selectedAccount,
    allAccountsFilterAccountIds,
    entries,
    filteredEntries,
    accountSummaryItems,
    failedAccounts,
    tokenLoadProgress,
    isLoading,
    currentAccountLoadError,
    retryFailedAccounts,
  } = credentialInventory
  const nativeRowKeysRef = useRef(new WeakMap<object, string>())
  const nextNativeRowKeyRef = useRef(0)
  const managedRuntimeKeys = useMemo(() => {
    const native = nativeKeys.allRows.flatMap((facts) => {
      const account = displayData.find(
        (candidate) => candidate.id === facts.ref.accountId,
      )
      if (
        !account ||
        (selectedAccount !== KEY_MANAGEMENT_ALL_ACCOUNTS_VALUE &&
          selectedAccount !== account.id)
      )
        return []
      if (
        selectedAccount === KEY_MANAGEMENT_ALL_ACCOUNTS_VALUE &&
        allAccountsFilterAccountIds.length &&
        !allAccountsFilterAccountIds.includes(account.id)
      )
        return []
      if (
        selectedAccount !== KEY_MANAGEMENT_ALL_ACCOUNTS_VALUE &&
        nativeKeys.selectedScope?.scopeKey !== facts.ref.scopeKey
      )
        return []
      const profile = getProfileForLocator({
        source: ACCOUNT_RUNTIME_KEY_SOURCES.AccountKeyResource,
        ref: facts.ref,
      })
      return [
        buildAccountKeyResourceRuntimeKeyFromFacts(
          account,
          facts,
          profile?.apiKey ?? "",
        ),
      ]
    })
    return [...entries.map((entry) => entry.runtimeKey), ...native].filter(
      (key) =>
        supportsRecoverableAccountRuntimeKeySecrets(key.siteType) ||
        hasUsableAccountRuntimeKeySecret(key),
    )
  }, [
    nativeKeys.allRows,
    nativeKeys.selectedScope,
    displayData,
    selectedAccount,
    allAccountsFilterAccountIds,
    entries,
    getProfileForLocator,
  ])
  const { getResourceScope } = nativeKeys
  const toNativeRows = useCallback(
    (factsList: readonly AccountKeyResourceFacts[]): NativeKeyManagementRow[] =>
      factsList.map((facts) => {
        let rowKey = nativeRowKeysRef.current.get(facts)
        if (!rowKey) {
          rowKey = `native-row-${++nextNativeRowKeyRef.current}`
          nativeRowKeysRef.current.set(facts, rowKey)
        }
        const account = displayData.find(
          (candidate) => candidate.id === facts.ref.accountId,
        )
        const scope = getResourceScope(facts.ref)
        return {
          kind: KEY_MANAGEMENT_DISPLAY_ROW_KINDS.AccountKeyResource,
          rowKey,
          accountId: facts.ref.accountId,
          accountName: account?.name ?? t("keyManagement:native.missing"),
          scopeName: scope?.displayName ?? t("keyManagement:native.missing"),
          facts,
        }
      }),
    [displayData, getResourceScope, t],
  )
  const allNativeRows = useMemo(
    () => toNativeRows(nativeKeys.allRows),
    [nativeKeys.allRows, toNativeRows],
  )
  const nativeUnfilteredRows = useMemo(
    () =>
      allNativeRows.filter(
        (row) =>
          selectedAccount !== KEY_MANAGEMENT_ALL_ACCOUNTS_VALUE ||
          allAccountsFilterAccountIds.length === 0 ||
          allAccountsFilterAccountIds.includes(row.accountId),
      ),
    [allAccountsFilterAccountIds, allNativeRows, selectedAccount],
  )
  const nativeRows = useMemo(
    () =>
      toNativeRows(nativeKeys.rows).filter(
        (row) =>
          selectedAccount !== KEY_MANAGEMENT_ALL_ACCOUNTS_VALUE ||
          allAccountsFilterAccountIds.length === 0 ||
          allAccountsFilterAccountIds.includes(row.accountId),
      ),
    [
      allAccountsFilterAccountIds,
      nativeKeys.rows,
      selectedAccount,
      toNativeRows,
    ],
  )
  const combinedAccountSummaryItems = useMemo(() => {
    const nativeCountByAccount = new Map<string, number>()
    for (const facts of nativeKeys.rows) {
      nativeCountByAccount.set(
        facts.ref.accountId,
        (nativeCountByAccount.get(facts.ref.accountId) ?? 0) + 1,
      )
    }
    const itemByAccount = new Map<string, KeyManagementAccountSummaryItem>(
      accountSummaryItems.map((item) => [item.accountId, item]),
    )
    const accountsWithNativeRows = new Set(
      nativeKeys.allRows.map((facts) => facts.ref.accountId),
    )
    const settledNativeAccountIds = new Set(nativeKeys.settledAccountIds)
    for (const account of displayData) {
      const isNativeAccount = Boolean(
        getSiteTypeCapabilities(account.siteType).account
          ?.keyResourceManagement,
      )
      if (!isNativeAccount) continue
      const nativeCount = nativeCountByAccount.get(account.id) ?? 0
      const hasLoadFailure = Boolean(nativeKeys.failures[account.id])
      const hasCompleteCount =
        settledNativeAccountIds.has(account.id) && !hasLoadFailure
      itemByAccount.set(account.id, {
        accountId: account.id,
        name: account.name,
        count: hasCompleteCount ? nativeCount : null,
        hasData: accountsWithNativeRows.has(account.id),
        isLoading:
          nativeKeys.isLoading && !settledNativeAccountIds.has(account.id),
        ...(!hasCompleteCount && nativeCount > 0
          ? { knownCount: nativeCount }
          : {}),
        ...(hasLoadFailure ? { errorType: "load-failed" as const } : {}),
      })
    }
    return [...itemByAccount.values()]
  }, [
    accountSummaryItems,
    displayData,
    nativeKeys.failures,
    nativeKeys.isLoading,
    nativeKeys.allRows,
    nativeKeys.settledAccountIds,
    nativeKeys.rows,
  ])
  const combinedFailedAccounts = useMemo(() => {
    const merged = new Map(failedAccounts.map((item) => [item.accountId, item]))
    for (const [accountId] of Object.entries(nativeKeys.failures)) {
      const account = displayData.find(
        (candidate) => candidate.id === accountId,
      )
      if (account)
        merged.set(accountId, { accountId, accountName: account.name })
    }
    return [...merged.values()]
  }, [displayData, failedAccounts, nativeKeys.failures])
  const combinedTokenLoadProgress = useMemo(
    () =>
      tokenLoadProgress
        ? {
            total: tokenLoadProgress.total + nativeKeys.progress.total,
            loaded: tokenLoadProgress.loaded + nativeKeys.progress.loaded,
            loading: tokenLoadProgress.loading + nativeKeys.progress.loading,
            error: tokenLoadProgress.error + nativeKeys.progress.error,
          }
        : nativeKeys.progress.total > 0
          ? nativeKeys.progress
          : null,
    [nativeKeys.progress, tokenLoadProgress],
  )
  const aggregateCounts = useMemo((): KeyManagementAggregateCounts => {
    const scopedEntries = entries.filter(
      (entry) =>
        selectedAccount !== KEY_MANAGEMENT_ALL_ACCOUNTS_VALUE ||
        !allAccountsFilterAccountIds.length ||
        allAccountsFilterAccountIds.includes(entry.runtimeKey.accountId),
    )
    const knownTotal = scopedEntries.length + nativeUnfilteredRows.length
    const knownEnabled =
      scopedEntries.filter((entry) => entry.runtimeKey.status === "active")
        .length +
      nativeUnfilteredRows.filter((row) => row.facts.status === "enabled")
        .length
    const knownShowing = filteredEntries.length + nativeRows.length
    const includedAccountIds =
      selectedAccount === KEY_MANAGEMENT_ALL_ACCOUNTS_VALUE
        ? allAccountsFilterAccountIds.length > 0
          ? new Set(allAccountsFilterAccountIds)
          : null
        : selectedAccount
          ? new Set([selectedAccount])
          : new Set<string>()
    const isIncluded = (accountId: string) =>
      includedAccountIds === null || includedAccountIds.has(accountId)
    const includedAccounts = displayData.filter((account) =>
      isIncluded(account.id),
    )
    const hasIncludedNativeAccount = includedAccounts.some((account) =>
      Boolean(
        getSiteTypeCapabilities(account.siteType).account
          ?.keyResourceManagement,
      ),
    )
    const hasIncludedCredentialAccount = includedAccounts.some(
      (account) =>
        !getSiteTypeCapabilities(account.siteType).account
          ?.keyResourceManagement,
    )
    const hasUnknownCount =
      (nativeKeys.isLoading && hasIncludedNativeAccount) ||
      (isLoading && hasIncludedCredentialAccount) ||
      Object.keys(nativeKeys.failures).some(isIncluded) ||
      failedAccounts.some((account) => isIncluded(account.accountId)) ||
      (selectedAccount !== KEY_MANAGEMENT_ALL_ACCOUNTS_VALUE &&
        hasIncludedCredentialAccount &&
        Boolean(currentAccountLoadError))

    return {
      total: hasUnknownCount ? null : knownTotal,
      enabled: hasUnknownCount ? null : knownEnabled,
      showing: hasUnknownCount ? null : knownShowing,
      knownTotal,
      knownEnabled,
      knownShowing,
    }
  }, [
    allAccountsFilterAccountIds,
    currentAccountLoadError,
    displayData,
    failedAccounts,
    filteredEntries.length,
    isLoading,
    nativeKeys.failures,
    nativeKeys.isLoading,
    nativeRows.length,
    nativeUnfilteredRows,
    selectedAccount,
    entries,
  ])
  const retryCombinedFailedAccounts = useCallback(() => {
    retryFailedAccounts()
    void nativeKeys.retryFailed()
  }, [nativeKeys, retryFailedAccounts])
  const nativeInventoryLoadError =
    selectedAccount === KEY_MANAGEMENT_ALL_ACCOUNTS_VALUE
      ? Object.keys(nativeKeys.failures).length > 0
        ? t("keyManagement:messages.loadFailed")
        : undefined
      : selectedAccount && nativeKeys.failures[selectedAccount]
        ? t("keyManagement:messages.loadFailed")
        : undefined
  const isNativeInventoryLoading =
    nativeKeys.isLoading || nativeKeys.isScopeInventoryLoading
  return {
    managedRuntimeKeys,
    allNativeRows,
    nativeRows,
    combinedAccountSummaryItems,
    combinedFailedAccounts,
    combinedTokenLoadProgress,
    aggregateCounts,
    retryCombinedFailedAccounts,
    nativeInventoryLoadError,
    isNativeInventoryLoading,
  }
}
