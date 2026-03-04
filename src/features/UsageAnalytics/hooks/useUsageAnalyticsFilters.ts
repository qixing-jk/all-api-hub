import { useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"

import { computeUsageHistoryExport } from "~/src/services/history/usageHistory/analytics"
import {
  parseDayKey,
  subtractDaysFromDayKey,
} from "~/src/services/history/usageHistory/core"
import type { SiteAccount } from "~/src/types"
import type {
  UsageHistoryAccountStore,
  UsageHistoryExport,
  UsageHistoryExportSelection,
  UsageHistoryStore,
} from "~/src/types/usageHistory"

import { listDayKeysInRange, type DayKey } from "../charts/dayKeys"

export const useUsageAnalyticsFilters = (params: {
  enabledAccounts: SiteAccount[]
  store: UsageHistoryStore | null
  disabledAccountIdSet: Set<string>
}) => {
  const { enabledAccounts, store, disabledAccountIdSet } = params
  const { t } = useTranslation("usageAnalytics")

  const [selectedSiteNames, setSelectedSiteNames] = useState<string[]>([])
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([])
  const [selectedTokenIds, setSelectedTokenIds] = useState<string[]>([])
  const [startDay, setStartDay] = useState<DayKey>("")
  const [endDay, setEndDay] = useState<DayKey>("")

  // Site/account filter options and labels.
  const siteTitleByName = useMemo(() => {
    const metaBySite = new Map<
      string,
      {
        urls: Set<string>
        types: Set<string>
        accountCount: number
      }
    >()

    for (const account of enabledAccounts) {
      const entry = metaBySite.get(account.site_name) ?? {
        urls: new Set<string>(),
        types: new Set<string>(),
        accountCount: 0,
      }

      entry.urls.add(account.site_url)
      entry.types.add(account.site_type)
      entry.accountCount += 1
      metaBySite.set(account.site_name, entry)
    }

    const out = new Map<string, string>()
    for (const [siteName, meta] of metaBySite.entries()) {
      const urls = Array.from(meta.urls).filter(Boolean).sort()
      const types = Array.from(meta.types).filter(Boolean).sort()

      const parts: string[] = [`${t("hover.site")}: ${siteName}`]
      for (const url of urls) {
        parts.push(`${t("hover.url")}: ${url}`)
      }
      if (types.length > 0) {
        parts.push(`${t("hover.type")}: ${types.join(" / ")}`)
      }
      parts.push(`${t("hover.accountsCount")}: ${meta.accountCount}`)
      out.set(siteName, parts.join("\n"))
    }

    return out
  }, [enabledAccounts, t])

  const siteAccountCountByName = useMemo(() => {
    const out = new Map<string, number>()
    for (const account of enabledAccounts) {
      out.set(account.site_name, (out.get(account.site_name) ?? 0) + 1)
    }
    return out
  }, [enabledAccounts])

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

  const siteOptions = useMemo(() => {
    const siteNames = new Set(
      enabledAccounts.map((account) => account.site_name),
    )
    const options = Array.from(siteNames).map((siteName) => ({
      value: siteName,
      label: siteName,
      title: siteTitleByName.get(siteName),
      count: siteAccountCountByName.get(siteName) ?? 0,
    }))

    options.sort((a, b) => a.label.localeCompare(b.label))
    return options
  }, [enabledAccounts, siteAccountCountByName, siteTitleByName])

  // Filtered accounts for the selected sites.
  const accountsForSelectedSites = useMemo(() => {
    if (selectedSiteNames.length === 0) {
      return enabledAccounts
    }

    const selected = new Set(selectedSiteNames)
    return enabledAccounts.filter((account) => selected.has(account.site_name))
  }, [enabledAccounts, selectedSiteNames])

  const usernameCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const account of enabledAccounts) {
      const username = account.account_info.username
      counts.set(username, (counts.get(username) ?? 0) + 1)
    }
    return counts
  }, [enabledAccounts])

  const accountLabelById = useMemo(() => {
    const out = new Map<string, string>()
    for (const account of enabledAccounts) {
      const username = account.account_info.username
      const disambiguate = (usernameCounts.get(username) ?? 0) > 1
      const label = disambiguate
        ? `${username} (${account.site_name})`
        : account.site_name
      out.set(account.id, label)
    }
    return out
  }, [enabledAccounts, usernameCounts])

  const accountOptions = useMemo(() => {
    return accountsForSelectedSites.map((account) => ({
      value: account.id,
      label: accountLabelById.get(account.id) ?? account.id,
      count: tokenCountByAccountId.get(account.id) ?? 0,
      title: [
        `${t("hover.account")}: ${accountLabelById.get(account.id) ?? account.id}`,
        `${t("hover.site")}: ${account.site_name}`,
        account.notes ? `${t("hover.notes")}: ${String(account.notes)}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    }))
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
    if (selectedSiteNames.length === 0) {
      return
    }

    const available = new Set(siteOptions.map((option) => option.value))
    setSelectedSiteNames((current) => {
      const next = current.filter((siteName) => available.has(siteName))
      return next.length === current.length ? current : next
    })
  }, [selectedSiteNames.length, siteOptions])

  const resolvedAccountIds = useMemo(() => {
    if (selectedAccountIds.length > 0) {
      return selectedAccountIds
    }

    if (selectedSiteNames.length > 0) {
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
    selectedSiteNames.length,
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

    const accountIdentityById = new Map(
      enabledAccounts.map((account) => [
        account.id,
        `${account.site_name} - ${account.account_info.username}`,
      ]),
    )

    const tokenOwnersById = new Map<string, string[]>()
    for (const [accountId, accountData] of Object.entries(
      exportPreview?.accounts ?? {},
    )) {
      const label =
        accountIdentityById.get(accountId) ??
        accountLabels[accountId] ??
        accountId

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
  }, [accountLabels, enabledAccounts, exportPreview, t])

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
    selectedSiteNames,
    setSelectedSiteNames,
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
