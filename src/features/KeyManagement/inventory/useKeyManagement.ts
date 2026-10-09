import { useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"

import { useAccountData } from "~/features/AccountManagement/data/useAccountData"
import { KEY_MANAGEMENT_ALL_ACCOUNTS_VALUE } from "~/features/KeyManagement/constants"
import { useServiceCredentialLifecycle } from "~/features/KeyManagement/inventory/serviceCredentials/useServiceCredentialLifecycle"
import {
  KEY_MANAGEMENT_LOAD_STATUSES,
  type KeyManagementAccountSummaryItem,
  type KeyManagementEntry,
} from "~/features/KeyManagement/types"
import { buildServiceCredentialKeyManagementEntry } from "~/features/KeyManagement/utils"
import { getSiteTypeCapabilities } from "~/services/apiAdapters/registry"

/** Composes account selection and credential inventory presentation. */
export function useKeyManagement(routeParams?: Record<string, string>) {
  const { t } = useTranslation(["keyManagement", "messages"])
  const { enabledDisplayData } = useAccountData()
  const [selectedAccount, setSelectedAccount] = useState("")
  const [searchTerm, setSearchTerm] = useState("")
  const [allAccountsFilterAccountIds, setAllAccountsFilterAccountIds] =
    useState<string[]>([])
  const isAllAccountsMode =
    selectedAccount === KEY_MANAGEMENT_ALL_ACCOUNTS_VALUE
  const accountById = useMemo(
    () => new Map(enabledDisplayData.map((account) => [account.id, account])),
    [enabledDisplayData],
  )
  const scopedAccounts = useMemo(
    () =>
      isAllAccountsMode
        ? enabledDisplayData
        : accountById.has(selectedAccount)
          ? [accountById.get(selectedAccount)!]
          : [],
    [accountById, enabledDisplayData, isAllAccountsMode, selectedAccount],
  )
  const serviceAccounts = useMemo(
    () =>
      scopedAccounts.filter(
        (account) =>
          getSiteTypeCapabilities(account.siteType).account?.serviceCredential,
      ),
    [scopedAccounts],
  )
  useEffect(() => {
    if (!selectedAccount) return
    if (
      isAllAccountsMode
        ? enabledDisplayData.length === 0
        : !accountById.has(selectedAccount)
    )
      setSelectedAccount("")
  }, [
    accountById,
    enabledDisplayData.length,
    isAllAccountsMode,
    selectedAccount,
  ])

  useEffect(() => {
    setAllAccountsFilterAccountIds((current) => {
      const next = isAllAccountsMode
        ? current.filter((id) => accountById.has(id))
        : []
      return next.length === current.length ? current : next
    })
  }, [accountById, isAllAccountsMode])

  const isRouteControlled = routeParams !== undefined
  useEffect(() => {
    if (!isRouteControlled) return
    const requested = routeParams?.accountId?.trim()
    if (!requested) {
      setSelectedAccount("")
      return
    }
    if (!enabledDisplayData.length) return
    setSelectedAccount(
      requested === KEY_MANAGEMENT_ALL_ACCOUNTS_VALUE ||
        accountById.has(requested)
        ? requested
        : "",
    )
  }, [
    accountById,
    enabledDisplayData.length,
    isRouteControlled,
    routeParams?.accountId,
  ])

  const {
    serviceCredentials,
    refreshServiceCredentials,
    retryFailedAccounts,
    copyServiceCredential,
    rotateServiceCredential,
  } = useServiceCredentialLifecycle(serviceAccounts, selectedAccount)

  const entries = useMemo(
    (): KeyManagementEntry[] =>
      serviceAccounts.flatMap((account) => {
        const entry = buildServiceCredentialKeyManagementEntry({
          account,
          serviceCredential: serviceCredentials[account.id],
          canRotate: Boolean(
            getSiteTypeCapabilities(account.siteType).account?.serviceCredential
              ?.rotate,
          ),
        })
        return entry ? [entry] : []
      }),
    [serviceAccounts, serviceCredentials],
  )
  const filteredEntries = useMemo(
    () =>
      entries.filter(
        (entry) =>
          (!isAllAccountsMode ||
            !allAccountsFilterAccountIds.length ||
            allAccountsFilterAccountIds.includes(entry.runtimeKey.accountId)) &&
          entry.runtimeKey.label
            .toLowerCase()
            .includes(searchTerm.trim().toLowerCase()),
      ),
    [entries, searchTerm, isAllAccountsMode, allAccountsFilterAccountIds],
  )
  const isLoading = serviceAccounts.some((account) => {
    const credential = serviceCredentials[account.id]
    return (
      !credential || credential.status === KEY_MANAGEMENT_LOAD_STATUSES.Loading
    )
  })
  const failedAccounts = serviceAccounts
    .filter((account) => {
      const credential = serviceCredentials[account.id]
      return credential?.status === KEY_MANAGEMENT_LOAD_STATUSES.Error
    })
    .map((account) => {
      const credential = serviceCredentials[account.id]
      return {
        accountId: account.id,
        accountName: account.name,
        ...(credential?.errorMessage
          ? { errorMessage: credential.errorMessage }
          : {}),
      }
    })
  const selectedCapabilities = accountById.has(selectedAccount)
    ? getSiteTypeCapabilities(accountById.get(selectedAccount)!.siteType)
        .account
    : undefined
  const currentAccountUnsupportedKeyManagement = Boolean(
    selectedAccount &&
      !isAllAccountsMode &&
      !selectedCapabilities?.serviceCredential &&
      !selectedCapabilities?.keyResourceManagement,
  )
  const currentAccountLoadError =
    !isAllAccountsMode &&
    serviceCredentials[selectedAccount]?.status ===
      KEY_MANAGEMENT_LOAD_STATUSES.Error
      ? serviceCredentials[selectedAccount].errorMessage ||
        t(
          serviceCredentials[selectedAccount].errorKind === "rotation"
            ? "keyManagement:messages.serviceCredentialRotateFailed"
            : "keyManagement:messages.loadFailed",
        )
      : null
  const tokenLoadProgress = isAllAccountsMode
    ? {
        total: serviceAccounts.length,
        loaded: serviceAccounts.filter(
          (account) =>
            serviceCredentials[account.id]?.status ===
            KEY_MANAGEMENT_LOAD_STATUSES.Loaded,
        ).length,
        error: failedAccounts.length,
        loading: serviceAccounts.filter((account) => {
          const credential = serviceCredentials[account.id]
          return (
            !credential ||
            credential.status === KEY_MANAGEMENT_LOAD_STATUSES.Loading
          )
        }).length,
      }
    : null
  const accountSummaryItems = useMemo(
    (): KeyManagementAccountSummaryItem[] =>
      enabledDisplayData
        .filter(
          (account) =>
            !getSiteTypeCapabilities(account.siteType).account
              ?.keyResourceManagement,
        )
        .map((account) => {
          const supported = Boolean(
            getSiteTypeCapabilities(account.siteType).account
              ?.serviceCredential,
          )
          const state = serviceCredentials[account.id]
          const hasEntry =
            state?.status === KEY_MANAGEMENT_LOAD_STATUSES.Loaded &&
            Boolean(state.credential)
          return {
            accountId: account.id,
            name: account.name,
            hasData: hasEntry,
            isLoading:
              supported &&
              (!state || state.status === KEY_MANAGEMENT_LOAD_STATUSES.Loading),
            count: hasEntry
              ? Number(
                  state!
                    .credential!.label.toLowerCase()
                    .includes(searchTerm.trim().toLowerCase()),
                )
              : supported
                ? null
                : 0,
            ...(!supported
              ? { errorType: "unsupported" as const }
              : state?.status === KEY_MANAGEMENT_LOAD_STATUSES.Error
                ? { errorType: "load-failed" as const }
                : {}),
          }
        }),
    [enabledDisplayData, searchTerm, serviceCredentials],
  )

  return {
    displayData: enabledDisplayData,
    selectedAccount,
    setSelectedAccount,
    searchTerm,
    setSearchTerm,
    allAccountsFilterAccountIds,
    setAllAccountsFilterAccountIds,
    serviceCredentials,
    entries,
    filteredEntries,
    isLoading,
    currentAccountLoadError,
    currentAccountUnsupportedKeyManagement,
    tokenLoadProgress,
    failedAccounts,
    accountSummaryItems,
    refreshServiceCredentials,
    retryFailedAccounts,
    copyServiceCredential,
    rotateServiceCredential,
  }
}
