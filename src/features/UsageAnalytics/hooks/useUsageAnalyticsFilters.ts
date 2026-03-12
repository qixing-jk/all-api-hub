import { useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"

import {
  buildAccountDisplayNameMap,
  compareAccountDisplayNames,
} from "~/services/accounts/utils/accountDisplayName"
import { computeUsageHistoryExport } from "~/services/history/usageHistory/analytics"
import {
  parseDayKey,
  subtractDaysFromDayKey,
} from "~/services/history/usageHistory/core"
import type { SiteAccount } from "~/types"
import type {
  UsageHistoryAccountStore,
  UsageHistoryExport,
  UsageHistoryExportSelection,
  UsageHistoryStore,
} from "~/types/usageHistory"

import { listDayKeysInRange, type DayKey } from "../charts/dayKeys"

export const useUsageAnalyticsFilters = (params: {
  enabledAccounts: SiteAccount[]
  store: UsageHistoryStore | null
  disabledAccountIdSet: Set<string>
}) => {
  const { enabledAccounts, store, disabledAccountIdSet } = params
  const { t } = useTranslation("usageAnalytics")

  const [selectedSiteAccountIds, setSelectedSiteAccountIds] = useState<
    string[]
  >([])
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([])
  const [selectedTokenIds, setSelectedTokenIds] = useState<string[]>([])
  const [startDay, setStartDay] = useState<DayKey>("")
  const [endDay, setEndDay] = useState<DayKey>("")

  const tokenCountByAccountId = useMemo(() => {
    const out = new Map<string, number>()
    if (!store || !startDay || !endDay) {
      return out
    }

    const hasUsageInRange = (perTokenDaily: Record<string, unknown>) => {
      for (const dayKey of Object.keys(perTokenDaily)) {
        if (dayKey >= startDay && dayKey <= endDay) {
          return true
        }
      }
      return false
    }

    for (const [accountId, accountStore] of Object.entries(store.accounts)) {
      const resolved = accountStore as UsageHistoryAccountStore
      const tokenIds = new Set<string>()

      for (const [tokenId, perTokenDaily] of Object.entries(
        resolved.dailyByToken ?? {},
      )) {
        if (hasUsageInRange(perTokenDaily as Record<string, unknown>)) {
          tokenIds.add(tokenId)
        }
      }

      out.set(accountId, tokenIds.size)
    }

    return out
  }, [endDay, startDay, store])

  const accountLabelById = useMemo(
    () => buildAccountDisplayNameMap(enabledAccounts),
    [enabledAccounts],
  )

  // The "Sites" filter needs globally unique values, otherwise duplicate-named
  // accounts collapse into a single option and cannot be filtered separately.
  const siteTitleById = useMemo(() => {
    const out = new Map<string, string>()

    for (const account of enabledAccounts) {
      const label = accountLabelById.get(account.id) ?? account.id
      out.set(
        account.id,
        [
          `${t("hover.account")}: ${label}`,
          `${t("hover.site")}: ${account.site_name}`,
          account.site_url ? `${t("hover.url")}: ${account.site_url}` : "",
          account.site_type ? `${t("hover.type")}: ${account.site_type}` : "",
        ]
          .filter(Boolean)
          .join("\n"),
      )
    }

    return out
  }, [accountLabelById, enabledAccounts, t])

  const siteOptions = useMemo(() => {
    const options = enabledAccounts.map((account) => ({
      value: account.id,
      label: accountLabelById.get(account.id) ?? account.id,
      title: siteTitleById.get(account.id),
      baseName: account.site_name,
      username: account.account_info?.username ?? "",
    }))

    options.sort((a, b) =>
      compareAccountDisplayNames(
        {
          id: a.value,
          name: a.label,
          baseName: a.baseName,
          username: a.username,
        },
        {
          id: b.value,
          name: b.label,
          baseName: b.baseName,
          username: b.username,
        },
      ),
    )
    return options.map(
      ({ baseName: _baseName, username: _username, ...rest }) => rest,
    )
  }, [accountLabelById, enabledAccounts, siteTitleById])

  // Filtered accounts for the selected sites.
  const accountsForSelectedSites = useMemo(() => {
    if (selectedSiteAccountIds.length === 0) {
      return enabledAccounts
    }

    const selected = new Set(selectedSiteAccountIds)
    return enabledAccounts.filter((account) => selected.has(account.id))
  }, [enabledAccounts, selectedSiteAccountIds])

  const accountOptions = useMemo(() => {
    const options = accountsForSelectedSites.map((account) => ({
      value: account.id,
      label: accountLabelById.get(account.id) ?? account.id,
      count: tokenCountByAccountId.get(account.id) ?? 0,
      baseName: account.site_name,
      username: account.account_info?.username ?? "",
      title: [
        `${t("hover.account")}: ${accountLabelById.get(account.id) ?? account.id}`,
        `${t("hover.site")}: ${account.site_name}`,
        account.notes ? `${t("hover.notes")}: ${String(account.notes)}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    }))

    options.sort((a, b) =>
      compareAccountDisplayNames(
        {
          id: a.value,
          name: a.label,
          baseName: a.baseName,
          username: a.username,
        },
        {
          id: b.value,
          name: b.label,
          baseName: b.baseName,
          username: b.username,
        },
      ),
    )
    return options.map(
      ({ baseName: _baseName, username: _username, ...rest }) => rest,
    )
  }, [accountLabelById, accountsForSelectedSites, t, tokenCountByAccountId])

  const accountLabels = useMemo(() => {
    return Object.fromEntries(
      enabledAccounts.map((account) => [
        account.id,
        accountLabelById.get(account.id) ?? account.id,
      ]),
    ) as Record<string, string>
  }, [accountLabelById, enabledAccounts])

  useEffect(() => {
    if (selectedAccountIds.length === 0) {
      return
    }

    const available = new Set(
      accountsForSelectedSites.map((account) => account.id),
    )
    setSelectedAccountIds((current) =>
      current.filter((id) => available.has(id)),
    )
  }, [accountsForSelectedSites, selectedAccountIds.length])

  useEffect(() => {
    if (selectedSiteAccountIds.length === 0) {
      return
    }

    const available = new Set(siteOptions.map((option) => option.value))
    setSelectedSiteAccountIds((current) => {
      const next = current.filter((siteId) => available.has(siteId))
      return next.length === current.length ? current : next
    })
  }, [selectedSiteAccountIds, siteOptions])

  const resolvedAccountIds = useMemo(() => {
    if (selectedAccountIds.length > 0) {
      return selectedAccountIds
    }

    if (selectedSiteAccountIds.length > 0) {
      return accountsForSelectedSites.map((account) => account.id)
    }

    if (store) {
      return Object.keys(store.accounts).filter(
        (accountId) => !disabledAccountIdSet.has(accountId),
      )
    }

    return enabledAccounts.map((account) => account.id)
  }, [
    disabledAccountIdSet,
    enabledAccounts,
    accountsForSelectedSites,
    selectedAccountIds,
    selectedSiteAccountIds.length,
    store,
  ])

  const availableDayKeys = useMemo(() => {
    if (!store) return []
    const keys = new Set<string>()
    for (const accountId of resolvedAccountIds) {
      const accountStore = store.accounts[accountId]
      if (!accountStore) continue
      for (const dayKey of Object.keys(accountStore.daily)) {
        keys.add(dayKey)
      }
    }
    return Array.from(keys).sort()
  }, [resolvedAccountIds, store])

  const minDay = availableDayKeys[0] ?? ""
  const maxDay = availableDayKeys[availableDayKeys.length - 1] ?? ""

  useEffect(() => {
    if (!minDay || !maxDay) {
      return
    }

    setEndDay((current) =>
      current && current >= minDay && current <= maxDay ? current : maxDay,
    )
    setStartDay((current) => {
      if (current && current >= minDay && current <= maxDay) {
        return current
      }

      const suggested = subtractDaysFromDayKey(maxDay, 6)
      return suggested < minDay ? minDay : suggested
    })
  }, [maxDay, minDay])

  useEffect(() => {
    if (!startDay || !endDay) {
      return
    }

    if (startDay > endDay) {
      setEndDay(startDay)
    }
  }, [endDay, startDay])

  const exportSelection: UsageHistoryExportSelection | null = useMemo(() => {
    if (
      !startDay ||
      !endDay ||
      !parseDayKey(startDay) ||
      !parseDayKey(endDay)
    ) {
      return null
    }

    // Keep the export scoped to the same effective account id set that powers the UI.
    // This ensures disabled accounts do not leak into the "All accounts" view.
    return {
      accountIds:
        resolvedAccountIds.length > 0 ? resolvedAccountIds : ["__none__"],
      startDay,
      endDay,
    }
  }, [endDay, resolvedAccountIds, startDay])

  const exportPreview: UsageHistoryExport | null = useMemo(() => {
    if (!store || !exportSelection) {
      return null
    }

    try {
      return computeUsageHistoryExport({ store, selection: exportSelection })
    } catch {
      return null
    }
  }, [exportSelection, store])

  const tokenOptions = useMemo(() => {
    const tokenNamesById = exportPreview?.fused.tokenNamesById ?? {}
    const tokenIds = new Set<string>([
      ...Object.keys(exportPreview?.fused.dailyByToken ?? {}),
      ...Object.keys(tokenNamesById),
    ])

    const tokenOwnersById = new Map<string, string[]>()
    for (const [accountId, accountData] of Object.entries(
      exportPreview?.accounts ?? {},
    )) {
      const label = accountLabels[accountId] ?? accountId

      for (const tokenId of Object.keys(accountData.dailyByToken ?? {})) {
        const owners = tokenOwnersById.get(tokenId) ?? []
        owners.push(label)
        tokenOwnersById.set(tokenId, owners)
      }

      for (const tokenId of Object.keys(accountData.tokenNamesById ?? {})) {
        const owners = tokenOwnersById.get(tokenId) ?? []
        if (!owners.includes(label)) {
          owners.push(label)
          tokenOwnersById.set(tokenId, owners)
        }
      }
    }

    const options = Array.from(tokenIds).map((tokenId) => {
      const tokenName = tokenNamesById[tokenId]
      const label =
        tokenId === "unknown"
          ? t("filters.unknownToken")
          : tokenName
            ? `${tokenName} (#${tokenId})`
            : `#${tokenId}`

      const owners = (tokenOwnersById.get(tokenId) ?? []).slice().sort()
      return {
        value: tokenId,
        label,
        title: [
          `${t("hover.token")}: ${label}`,
          owners.length > 0 ? `${t("hover.owners")}: ${owners.join(", ")}` : "",
        ]
          .filter(Boolean)
          .join("\n"),
      }
    })

    options.sort((a, b) => a.label.localeCompare(b.label))
    return options
  }, [accountLabels, exportPreview, t])

  useEffect(() => {
    if (selectedTokenIds.length === 0) {
      return
    }

    const available = new Set(tokenOptions.map((option) => option.value))
    setSelectedTokenIds((current) => current.filter((id) => available.has(id)))
  }, [tokenOptions, selectedTokenIds.length])

  const dayKeysInRange = useMemo(() => {
    if (!startDay || !endDay) return []
    return listDayKeysInRange(startDay, endDay)
  }, [endDay, startDay])

  return {
    selectedSiteAccountIds,
    setSelectedSiteAccountIds,
    selectedAccountIds,
    setSelectedAccountIds,
    selectedTokenIds,
    setSelectedTokenIds,
    startDay,
    setStartDay,
    endDay,
    setEndDay,
    siteOptions,
    accountOptions,
    accountsForSelectedSites,
    tokenOptions,
    accountLabels,
    resolvedAccountIds,
    availableDayKeys,
    minDay,
    maxDay,
    exportSelection,
    exportPreview,
    dayKeysInRange,
  }
}
