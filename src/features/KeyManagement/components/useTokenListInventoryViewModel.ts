import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import {
  type DeeplinkExportRequest,
  type DeeplinkExportTarget,
} from "~/components/DeeplinkExportDialog"
import { isBatchSelectableEntry } from "~/features/KeyManagement/runtimeKeyExportEligibility"
import {
  ACCOUNT_RUNTIME_KEY_SOURCES,
  buildAccountKeyResourceRuntimeKeyFromFacts,
  getAccountRuntimeKeyExportId,
  type AccountRuntimeKey,
} from "~/services/accounts/accountRuntimeKeys"
import { createAccountRuntimeKeyExportSource } from "~/services/accounts/utils/credentialExport"
import { ACCOUNT_KEY_RESOURCE_STATUSES } from "~/services/apiAdapters/contracts/accountKeyResource"
import type { DisplaySiteData } from "~/types"

import { KEY_MANAGEMENT_ALL_ACCOUNTS_VALUE } from "../constants"
import {
  KEY_MANAGEMENT_DISPLAY_ROW_KINDS,
  type KeyManagementDisplayRow,
  type KeyManagementEntry,
  type NativeKeyManagementRow,
} from "../types"
import type { TokenListProps } from "./TokenList.types"

type TokenInventoryInputs = Pick<
  TokenListProps,
  | "entries"
  | "filteredEntries"
  | "nativeRows"
  | "nativeUnfilteredRows"
  | "displayData"
  | "selectedAccount"
  | "allAccountsFilterAccountIds"
  | "guidedManagedSiteImport"
  | "getCredentialProfileForLocator"
  | "isLoading"
  | "nativeLoading"
>

/**
 * Owns mixed inventory projection, account groups, guided expansion and live exports.
 */
export function useTokenListInventoryViewModel({
  entries,
  filteredEntries,
  nativeRows = [],
  nativeUnfilteredRows = nativeRows,
  displayData,
  selectedAccount,
  allAccountsFilterAccountIds = [],
  guidedManagedSiteImport,
  getCredentialProfileForLocator,
  isLoading,
  nativeLoading = false,
}: TokenInventoryInputs) {
  const guidedManagedSiteImportAccountId = guidedManagedSiteImport?.accountId
  const guidedManagedSiteImportTokenId = guidedManagedSiteImport?.tokenId
  const [deeplinkExportContext, setDeeplinkExportContext] = useState<{
    target: DeeplinkExportTarget
    runtimeKey: AccountRuntimeKey
    account: DisplaySiteData
  } | null>(null)
  const accountById = useMemo(() => {
    return new Map(displayData.map((account) => [account.id, account]))
  }, [displayData])
  const nativeEntriesByRowKey = useMemo(
    () =>
      new Map(
        nativeUnfilteredRows.flatMap((row) => {
          const account = accountById.get(row.accountId)
          if (!account) return []
          const profile = getCredentialProfileForLocator?.({
            source: ACCOUNT_RUNTIME_KEY_SOURCES.AccountKeyResource,
            ref: row.facts.ref,
          })
          const runtimeKey = buildAccountKeyResourceRuntimeKeyFromFacts(
            account,
            row.facts,
            profile?.apiKey ?? "",
          )
          return [
            [
              row.rowKey,
              {
                id: runtimeKey.id,
                runtimeKey,
                uiState: {},
              } satisfies KeyManagementEntry,
            ] as const,
          ]
        }),
      ),
    [nativeUnfilteredRows, accountById, getCredentialProfileForLocator],
  )
  const actionEntries = useMemo(
    () => [...entries, ...nativeEntriesByRowKey.values()],
    [entries, nativeEntriesByRowKey],
  )
  const filteredActionEntries = useMemo(
    () => [
      ...filteredEntries,
      ...nativeRows.flatMap((row) => {
        const entry = nativeEntriesByRowKey.get(row.rowKey)
        return entry ? [entry] : []
      }),
    ],
    [filteredEntries, nativeRows, nativeEntriesByRowKey],
  )
  const currentDeeplinkExportRequest = useMemo(() => {
    if (!deeplinkExportContext) return null
    const account = accountById.get(deeplinkExportContext.account.id)
    const entry = actionEntries.find(
      (candidate) =>
        candidate.runtimeKey.id === deeplinkExportContext.runtimeKey.id,
    )
    return account && entry && isBatchSelectableEntry(entry)
      ? ({
          target: deeplinkExportContext.target,
          source: createAccountRuntimeKeyExportSource(
            account,
            entry.runtimeKey,
            { preferCurrentSecret: true },
          ),
        } satisfies DeeplinkExportRequest)
      : null
  }, [accountById, actionEntries, deeplinkExportContext])
  const isCurrentDeeplinkExportAvailable = currentDeeplinkExportRequest !== null
  useEffect(() => {
    if (deeplinkExportContext && !isCurrentDeeplinkExportAvailable)
      setDeeplinkExportContext(null)
  }, [deeplinkExportContext, isCurrentDeeplinkExportAvailable])

  const displayRows = useMemo<readonly KeyManagementDisplayRow[]>(
    () => [
      ...entries.map(
        (entry): KeyManagementDisplayRow => ({
          kind: KEY_MANAGEMENT_DISPLAY_ROW_KINDS.RuntimeKey,
          entry,
        }),
      ),
      ...nativeUnfilteredRows,
    ],
    [entries, nativeUnfilteredRows],
  )
  const filteredDisplayRows = useMemo<readonly KeyManagementDisplayRow[]>(
    () => [
      ...filteredEntries.map(
        (entry): KeyManagementDisplayRow => ({
          kind: KEY_MANAGEMENT_DISPLAY_ROW_KINDS.RuntimeKey,
          entry,
        }),
      ),
      ...nativeRows,
    ],
    [filteredEntries, nativeRows],
  )
  const guidedManagedSiteImportEntryId = useMemo(() => {
    if (!guidedManagedSiteImportAccountId) return null

    const targetEntry = filteredActionEntries.find((entry) => {
      const runtimeKey = entry.runtimeKey
      return (
        runtimeKey.accountId === guidedManagedSiteImportAccountId &&
        (!guidedManagedSiteImportTokenId ||
          getAccountRuntimeKeyExportId(runtimeKey) ===
            guidedManagedSiteImportTokenId)
      )
    })

    return targetEntry?.id ?? null
  }, [
    filteredActionEntries,
    guidedManagedSiteImportAccountId,
    guidedManagedSiteImportTokenId,
  ])

  const isAllAccountsMode =
    selectedAccount === KEY_MANAGEMENT_ALL_ACCOUNTS_VALUE
  const isReloading = (isLoading || nativeLoading) && displayRows.length > 0
  const [collapsedAccountIds, setCollapsedAccountIds] = useState<Set<string>>(
    () =>
      selectedAccount === KEY_MANAGEMENT_ALL_ACCOUNTS_VALUE
        ? new Set(displayData.map((account) => account.id))
        : new Set(),
  )
  const hasInitializedCollapseRef = useRef(isAllAccountsMode)

  useEffect(() => {
    if (!isAllAccountsMode) {
      hasInitializedCollapseRef.current = false
      setCollapsedAccountIds(new Set())
      return
    }

    if (hasInitializedCollapseRef.current) return
    hasInitializedCollapseRef.current = true
    setCollapsedAccountIds(new Set(displayData.map((account) => account.id)))
  }, [displayData, isAllAccountsMode])

  useEffect(() => {
    if (!isAllAccountsMode) return
    if (allAccountsFilterAccountIds.length === 0) return

    // When the user filters via AccountSummaryBar, ensure matching groups are
    // expanded so the tokens are immediately visible.
    setCollapsedAccountIds((prev) => {
      const next = new Set(prev)
      let didChange = false

      for (const accountId of allAccountsFilterAccountIds) {
        if (!next.has(accountId)) continue
        next.delete(accountId)
        didChange = true
      }

      if (!didChange) return prev
      return next
    })
  }, [allAccountsFilterAccountIds, isAllAccountsMode])

  useEffect(() => {
    if (!isAllAccountsMode || !guidedManagedSiteImportAccountId) return

    setCollapsedAccountIds((prev) => {
      if (!prev.has(guidedManagedSiteImportAccountId)) return prev

      const next = new Set(prev)
      next.delete(guidedManagedSiteImportAccountId)
      return next
    })
  }, [guidedManagedSiteImportAccountId, isAllAccountsMode])

  const groupedRows = useMemo(() => {
    if (!isAllAccountsMode) return null

    const totalNativeRowsByAccountId = new Map<
      string,
      NativeKeyManagementRow[]
    >()
    for (const row of nativeUnfilteredRows) {
      const list = totalNativeRowsByAccountId.get(row.accountId) ?? []
      list.push(row)
      totalNativeRowsByAccountId.set(row.accountId, list)
    }

    const filteredRowsByAccountId = new Map<string, KeyManagementDisplayRow[]>()
    for (const row of filteredDisplayRows) {
      const accountId =
        row.kind === KEY_MANAGEMENT_DISPLAY_ROW_KINDS.RuntimeKey
          ? row.entry.runtimeKey.accountId
          : row.accountId
      const list = filteredRowsByAccountId.get(accountId) ?? []
      list.push(row)
      filteredRowsByAccountId.set(accountId, list)
    }

    const totalEntriesByAccountId = new Map<string, KeyManagementEntry[]>()
    for (const entry of entries) {
      const list = totalEntriesByAccountId.get(entry.runtimeKey.accountId) ?? []
      list.push(entry)
      totalEntriesByAccountId.set(entry.runtimeKey.accountId, list)
    }

    return displayData
      .filter((account) => filteredRowsByAccountId.has(account.id))
      .map((account) => {
        const total = totalEntriesByAccountId.get(account.id) ?? []
        const totalNativeRows = totalNativeRowsByAccountId.get(account.id) ?? []
        const filteredAccountRows =
          filteredRowsByAccountId.get(account.id) ?? []
        const filteredAccountEntries = filteredAccountRows.flatMap((row) =>
          row.kind === KEY_MANAGEMENT_DISPLAY_ROW_KINDS.RuntimeKey
            ? [row.entry]
            : [],
        )
        const filteredNativeRows = filteredAccountRows.filter(
          (row): row is NativeKeyManagementRow =>
            row.kind === KEY_MANAGEMENT_DISPLAY_ROW_KINDS.AccountKeyResource,
        )
        const totalEnabledNativeRows = totalNativeRows.filter(
          (row) => row.facts.status === ACCOUNT_KEY_RESOURCE_STATUSES.Enabled,
        ).length
        return {
          account,
          filteredEntries: filteredAccountEntries,
          nativeRows: filteredNativeRows,
          totalCount: Math.max(
            total.length + totalNativeRows.length,
            filteredAccountRows.length,
          ),
          enabledCount:
            total.filter((entry) => entry.runtimeKey.status === "active")
              .length + totalEnabledNativeRows,
          showingCount: filteredAccountRows.length,
        }
      })
  }, [
    displayData,
    filteredDisplayRows,
    isAllAccountsMode,
    nativeUnfilteredRows,
    entries,
  ])

  const collapseAll = useCallback(() => {
    if (!groupedRows) return
    setCollapsedAccountIds(
      new Set(groupedRows.map((group) => group.account.id)),
    )
  }, [groupedRows, setCollapsedAccountIds])

  const expandAll = useCallback(
    () => setCollapsedAccountIds(new Set()),
    [setCollapsedAccountIds],
  )

  const toggleGroup = (accountId: string) => {
    setCollapsedAccountIds((prev) => {
      const next = new Set(prev)
      if (next.has(accountId)) {
        next.delete(accountId)
      } else {
        next.add(accountId)
      }
      return next
    })
  }

  const handleCloseDeeplinkExport = () => {
    setDeeplinkExportContext(null)
  }

  const getNativeRowContext = (row: NativeKeyManagementRow) => {
    const entry = nativeEntriesByRowKey.get(row.rowKey)
    const account = accountById.get(row.accountId)
    return entry && account ? { entry, account } : null
  }

  const openDeeplinkExport = (
    target: DeeplinkExportTarget,
    runtimeKey: AccountRuntimeKey,
    account: DisplaySiteData,
  ) => setDeeplinkExportContext({ target, runtimeKey, account })

  return {
    actionEntries,
    filteredActionEntries,
    currentDeeplinkExportRequest,
    displayRows,
    filteredDisplayRows,
    guidedManagedSiteImportEntryId,
    isAllAccountsMode,
    isReloading,
    collapsedAccountIds,
    groupedRows,
    collapseAll,
    expandAll,
    toggleGroup,
    handleCloseDeeplinkExport,
    getNativeRowContext,
    openDeeplinkExport,
  }
}
