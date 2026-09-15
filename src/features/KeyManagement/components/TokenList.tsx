import { ChevronDown, ChevronUp, Library, SendToBack } from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import { CCSwitchExportDialog } from "~/components/CCSwitchExportDialog"
import { ManagedSiteIcon } from "~/components/icons/ManagedSiteIcon"
import { Badge, Button, Card, Checkbox } from "~/components/ui"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import { saveAccountRuntimeKeysToApiCredentialProfiles } from "~/features/TokenProvisioning/utils/apiCredentialProfileSaveAction"
import { cn } from "~/lib/utils"
import {
  ACCOUNT_RUNTIME_KEY_SOURCES,
  buildAccountKeyResourceRuntimeKeyFromFacts,
  getAccountRuntimeKeyExportId,
  getAccountRuntimeKeyLocator,
  hasUsableAccountRuntimeKeySecret,
  isServiceCredentialRuntimeKey,
  type AccountRuntimeKey,
  type AccountRuntimeKeyLocator,
} from "~/services/accounts/accountRuntimeKeys"
import { supportsRecoverableAccountRuntimeKeySecrets } from "~/services/accounts/keyProductCapabilities"
import { createAccountRuntimeKeyExportSource } from "~/services/accounts/utils/credentialExport"
import type {
  AccountKeyResourceFacts,
  AccountKeyResourceRef,
  ResourceFailure,
} from "~/services/apiAdapters/contracts/accountKeyResource"
import type { ManagedSiteTokenChannelStatus } from "~/services/managedSites/tokenChannelStatus"
import { getManagedSiteLabel } from "~/services/managedSites/utils/managedSite"
import { startProductAnalyticsAction } from "~/services/productAnalytics/actions"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/contracts"
import type { DisplaySiteData } from "~/types"
import type {
  ApiCredentialProfile,
  ApiCredentialProfileLink,
} from "~/types/apiCredentialProfiles"
import {
  isResolvedManagedSiteTokenBatchExportItemInput,
  MANAGED_SITE_TOKEN_BATCH_IMPORT_SOURCES,
  MANAGED_SITE_TOKEN_BATCH_IMPORT_VERIFICATIONS,
  type ManagedSiteBatchImportIntent,
  type ManagedSiteTokenBatchExportExecutionResult,
  type ManagedSiteTokenBatchExportItemInput,
} from "~/types/managedSiteTokenBatchExport"
import { createLogger } from "~/utils/core/logger"

import {
  KEY_MANAGEMENT_ALL_ACCOUNTS_VALUE,
  type KeyManagementAssociationTargetResultState,
} from "../constants"
import { useTokenCredentialAssociations } from "../hooks/useTokenCredentialAssociations"
import { KEY_MANAGEMENT_TEST_IDS } from "../testIds"
import {
  KEY_MANAGEMENT_DISPLAY_ROW_KINDS,
  type ApiCredentialProfileSaveEntry,
  type KeyManagementDisplayRow,
  type KeyManagementEntry,
  type NativeKeyManagementRow,
} from "../types"
import { AccountKeyResourceList } from "./AccountKeyResource/AccountKeyResourceList"
import { BatchSelectionControl } from "./BatchSelectionControl"
import { ManagedSiteTokenBatchExportDialog } from "./ManagedSiteTokenBatchExportDialog"
import { ServiceCredentialCard } from "./ServiceCredentialCard"
import { TokenEmptyState } from "./TokenEmptyState"

const logger = createLogger("TokenList")

const MANUAL_MANAGED_SITE_BATCH_IMPORT_INTENT = {
  source: MANAGED_SITE_TOKEN_BATCH_IMPORT_SOURCES.MANUAL_SELECTION,
  verification: MANAGED_SITE_TOKEN_BATCH_IMPORT_VERIFICATIONS.COMPLETE,
} satisfies ManagedSiteBatchImportIntent

const isBatchSelectableEntry = (entry: KeyManagementEntry) =>
  entry.runtimeKey.capabilities.export &&
  (supportsRecoverableAccountRuntimeKeySecrets(entry.runtimeKey.siteType) ||
    hasUsableAccountRuntimeKeySecret(entry.runtimeKey))

const isBatchSnapshotEligible = (
  items: ReadonlyArray<Pick<KeyManagementEntry, "runtimeKey">>,
  eligibilityByRuntimeKeyId: ReadonlyMap<string, boolean>,
) =>
  items.every(
    (item) => eligibilityByRuntimeKeyId.get(item.runtimeKey.id) === true,
  )

interface GuidedManagedSiteImportTarget {
  accountId?: string
  tokenId?: string
  request: string
}

interface TokenListProps {
  isLoading: boolean
  entries: KeyManagementEntry[]
  filteredEntries: KeyManagementEntry[]
  handleAddToken: () => void
  canCreateTokens?: boolean
  onAddAccount?: () => void
  onRequestAccountSelection?: () => void
  selectedAccount: string
  displayData: DisplaySiteData[]
  currentAccountLoadError?: string | null
  nativeInventoryLoadError?: string | null
  currentAccountUnsupportedKeyManagement?: boolean
  onRetryCurrentAccount?: () => void
  managedSiteTokenStatuses?: Record<
    string,
    {
      isChecking: boolean
      result?: ManagedSiteTokenChannelStatus
    }
  >
  onManagedSiteImportSuccess?: (
    runtimeKey: AccountRuntimeKey,
  ) => void | Promise<void>
  onManagedSiteVerificationRetry?: (
    runtimeKey: AccountRuntimeKey,
    managedSiteStatus: ManagedSiteTokenChannelStatus,
  ) => void | Promise<void>
  allAccountsFilterAccountIds?: string[]
  onCopyServiceCredential?: (account: DisplaySiteData) => Promise<void>
  onRotateServiceCredential?: (account: DisplaySiteData) => Promise<void>
  guidedManagedSiteImport?: GuidedManagedSiteImportTarget
  nativeRows?: readonly NativeKeyManagementRow[]
  nativeUnfilteredRows?: readonly NativeKeyManagementRow[]
  nativeLoading?: boolean
  nativeDetail?: AccountKeyResourceFacts | null
  nativeDetailLoading?: boolean
  nativeDetailFailure?: ResourceFailure | null
  onCloseNativeDetail?: () => void
  nativeDetailsFromRows?: boolean
  onOpenNativeDetail?: (ref: AccountKeyResourceRef) => void
  onEditNativeKey?: (ref: AccountKeyResourceRef) => void
  onDeleteNativeKey?: (ref: AccountKeyResourceRef) => void
  credentialProfileLinks?: readonly ApiCredentialProfileLink[]
  getCredentialProfileForLocator?: (
    locator: AccountRuntimeKeyLocator,
  ) => ApiCredentialProfile | undefined
  canManageCredentialAssociations?: boolean
  /** Whether at least one saved API credential can be selected for association. */
  canAssociateExistingCredential?: boolean
  onAssociateAssociation?: (
    locator: AccountRuntimeKeyLocator,
    displayLabel?: string,
    targetSecret?: string,
  ) => void
  onUnlinkAssociation?: (associationId: string) => void | Promise<void>
  associationTarget?: ApiCredentialProfileLink | null
  onAssociationTargetStatusChange?: (
    status: KeyManagementAssociationTargetResultState,
  ) => void
}

/**
 * Skeleton placeholder shown while tokens list is loading.
 */
function LoadingSkeleton() {
  return (
    <div className="space-y-density-3">
      {[...Array(3)].map((_, i) => (
        <Card key={i} padding="sm" className="animate-pulse">
          <div className="bg-secondary mb-2 h-4 w-1/4 rounded"></div>
          <div className="bg-secondary mb-2 h-3 w-1/2 rounded"></div>
          <div className="bg-secondary h-3 w-3/4 rounded"></div>
        </Card>
      ))}
    </div>
  )
}

/** Display native resources and singleton credentials with shared runtime actions. */
export function TokenList(props: TokenListProps) {
  const {
    isLoading,
    entries,
    filteredEntries,
    handleAddToken,
    canCreateTokens = true,
    onAddAccount,
    onRequestAccountSelection,
    selectedAccount,
    displayData,
    currentAccountLoadError,
    nativeInventoryLoadError,
    currentAccountUnsupportedKeyManagement,
    onRetryCurrentAccount,
    managedSiteTokenStatuses,
    onManagedSiteImportSuccess,
    onManagedSiteVerificationRetry,
    allAccountsFilterAccountIds = [],
    onCopyServiceCredential,
    onRotateServiceCredential,
    guidedManagedSiteImport,
    nativeRows = [],
    nativeUnfilteredRows = nativeRows,
    nativeLoading = false,
    nativeDetail,
    nativeDetailLoading = false,
    nativeDetailFailure,
    onCloseNativeDetail,
    nativeDetailsFromRows = false,
    onOpenNativeDetail,
    onEditNativeKey,
    onDeleteNativeKey,
    credentialProfileLinks = [],
    getCredentialProfileForLocator,
    canManageCredentialAssociations = false,
    canAssociateExistingCredential = true,
    onAssociateAssociation,
    onUnlinkAssociation,
    associationTarget,
    onAssociationTargetStatusChange,
  } = props
  const { t } = useTranslation(["keyManagement", "settings"])
  const { managedSiteType } = useUserPreferencesContext()
  const guidedManagedSiteImportAccountId = guidedManagedSiteImport?.accountId
  const guidedManagedSiteImportTokenId = guidedManagedSiteImport?.tokenId
  const [ccSwitchContext, setCCSwitchContext] = useState<{
    runtimeKey: AccountRuntimeKey
    account: DisplaySiteData
  } | null>(null)
  const [batchExportOpen, setBatchExportOpen] = useState(false)
  const [batchExportItems, setBatchExportItems] = useState<
    ManagedSiteTokenBatchExportItemInput[]
  >([])

  const [isBatchApiProfilesSaving, setIsBatchApiProfilesSaving] =
    useState(false)
  const [selectedEntryIds, setSelectedEntryIds] = useState<Set<string>>(
    () => new Set(),
  )

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
  const currentCCSwitchTarget = useMemo(() => {
    if (!ccSwitchContext) return null
    const account = accountById.get(ccSwitchContext.account.id)
    const entry = actionEntries.find(
      (candidate) => candidate.runtimeKey.id === ccSwitchContext.runtimeKey.id,
    )
    return account && entry && isBatchSelectableEntry(entry)
      ? {
          exportSource: createAccountRuntimeKeyExportSource(
            account,
            entry.runtimeKey,
            { preferCurrentSecret: true },
          ),
          runtimeKey: entry.runtimeKey,
        }
      : null
  }, [accountById, actionEntries, ccSwitchContext])
  const isCurrentCCSwitchContextExportable = currentCCSwitchTarget !== null
  useEffect(() => {
    if (ccSwitchContext && !isCurrentCCSwitchContextExportable)
      setCCSwitchContext(null)
  }, [ccSwitchContext, isCurrentCCSwitchContextExportable])

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
  const {
    getAssociationPresentation,
    getNativeNavigationProps,
    getRuntimeEntryNavigationProps,
  } = useTokenCredentialAssociations({
    associationTarget,
    canAssociateExistingCredential,
    canManageCredentialAssociations,
    credentialProfileLinks,
    filteredDisplayRows,
    isLoading,
    nativeLoading,
    onAssociateAssociation,
    onAssociationTargetStatusChange,
    onUnlinkAssociation,
  })
  const managedSiteLabel = getManagedSiteLabel(t, managedSiteType)
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
          (row) => row.facts.status === "enabled",
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

  const eligibleEntries = useMemo(
    () => actionEntries.filter(isBatchSelectableEntry),
    [actionEntries],
  )
  const eligibleEntryIds = useMemo(
    () => new Set(eligibleEntries.map((entry) => entry.id)),
    [eligibleEntries],
  )
  const filteredEligibleEntries = useMemo(
    () =>
      filteredActionEntries.filter((entry) => eligibleEntryIds.has(entry.id)),
    [eligibleEntryIds, filteredActionEntries],
  )
  const hasFilteredIneligibleEntries =
    filteredEligibleEntries.length < filteredActionEntries.length
  const filteredEligibleEntryIds = useMemo(
    () => new Set(filteredEligibleEntries.map((entry) => entry.id)),
    [filteredEligibleEntries],
  )
  const selectedVisibleCount = useMemo(
    () =>
      Array.from(selectedEntryIds).filter((entryId) =>
        filteredEligibleEntryIds.has(entryId),
      ).length,
    [filteredEligibleEntryIds, selectedEntryIds],
  )
  const allFilteredSelected =
    filteredEligibleEntries.length > 0 &&
    selectedVisibleCount === filteredEligibleEntries.length
  const visibleSelectionChecked =
    selectedVisibleCount === 0
      ? false
      : selectedVisibleCount === filteredEligibleEntries.length
        ? true
        : "indeterminate"
  const selectedEntries = useMemo(
    () => eligibleEntries.filter((entry) => selectedEntryIds.has(entry.id)),
    [eligibleEntries, selectedEntryIds],
  )
  const selectedManagedSiteBatchItems = useMemo(
    (): ManagedSiteTokenBatchExportItemInput[] =>
      selectedEntries.map((entry) => ({
        account: entry.runtimeKey.account as DisplaySiteData,
        runtimeKey: entry.runtimeKey,
      })),
    [selectedEntries],
  )
  const selectedApiProfileItems = useMemo(
    (): ApiCredentialProfileSaveEntry[] => selectedEntries,
    [selectedEntries],
  )

  const currentBatchEligibilityByRuntimeKeyId = useMemo(
    () =>
      new Map(
        actionEntries.map((entry) => [
          entry.runtimeKey.id,
          isBatchSelectableEntry(entry),
        ]),
      ),
    [actionEntries],
  )
  const isBatchExportSnapshotEligible = useMemo(
    () =>
      isBatchSnapshotEligible(
        batchExportItems.filter(isResolvedManagedSiteTokenBatchExportItemInput),
        currentBatchEligibilityByRuntimeKeyId,
      ),
    [batchExportItems, currentBatchEligibilityByRuntimeKeyId],
  )

  useEffect(() => {
    setSelectedEntryIds((prev) => {
      const next = new Set(
        Array.from(prev).filter((entryId) => eligibleEntryIds.has(entryId)),
      )
      return next.size === prev.size ? prev : next
    })
  }, [eligibleEntryIds])

  useEffect(() => {
    if (batchExportOpen && !isBatchExportSnapshotEligible) {
      setBatchExportOpen(false)
      setBatchExportItems([])
    }
  }, [batchExportOpen, isBatchExportSnapshotEligible])

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

  const toggleEntrySelection = (entryId: string, checked: boolean) => {
    setSelectedEntryIds((prev) => {
      const next = new Set(prev)
      if (checked) {
        next.add(entryId)
      } else {
        next.delete(entryId)
      }
      return next
    })
  }

  const getSelectionProps = (entryId: string) => {
    const isBatchSelectable = eligibleEntryIds.has(entryId)
    return {
      isSelected: isBatchSelectable && selectedEntryIds.has(entryId),
      onSelectionChange: isBatchSelectable
        ? (checked: boolean) => toggleEntrySelection(entryId, checked)
        : undefined,
      selectionDisabledReason: isBatchSelectable
        ? undefined
        : t("keyManagement:batchSelection.unavailableReason"),
    }
  }

  const toggleFilteredSelection = () => {
    setSelectedEntryIds((prev) => {
      const next = new Set(prev)
      for (const entry of filteredEligibleEntries) {
        if (allFilteredSelected) {
          next.delete(entry.id)
        } else {
          next.add(entry.id)
        }
      }
      return next
    })
  }

  const toggleGroupSelection = (
    groupEntries: KeyManagementEntry[],
    checked: boolean | "indeterminate",
  ) => {
    setSelectedEntryIds((prev) => {
      const next = new Set(prev)
      const shouldSelect = checked === true

      for (const entry of groupEntries) {
        if (shouldSelect) {
          next.add(entry.id)
        } else {
          next.delete(entry.id)
        }
      }

      return next
    })
  }

  const clearSelection = () => {
    setSelectedEntryIds(new Set())
  }

  const openBatchExportDialog = () => {
    setBatchExportItems(selectedManagedSiteBatchItems)
    setBatchExportOpen(true)
  }

  const closeBatchExportDialog = () => {
    setBatchExportOpen(false)
    setBatchExportItems([])
  }

  const handleBatchSaveToApiProfiles = async () => {
    if (selectedApiProfileItems.length === 0 || isBatchApiProfilesSaving) return

    const tracker = startProductAnalyticsAction({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.KeyManagement,
      actionId:
        PRODUCT_ANALYTICS_ACTION_IDS.SaveAccountRuntimeKeysToApiCredentialProfiles,
      surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsKeyManagementPage,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    })

    setIsBatchApiProfilesSaving(true)
    try {
      await saveAccountRuntimeKeysToApiCredentialProfiles({
        items: selectedApiProfileItems,
        t,
        logger,
        source: "TokenListBatchAction",
      })
      tracker.complete(PRODUCT_ANALYTICS_RESULTS.Success)
      clearSelection()
    } catch {
      tracker.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
        errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
      })
    } finally {
      setIsBatchApiProfilesSaving(false)
    }
  }

  const handleBatchExportCompleted = (
    result: ManagedSiteTokenBatchExportExecutionResult,
  ) => {
    if (!onManagedSiteImportSuccess) return

    const selectedTokenByIdentity = new Map(
      batchExportItems.flatMap((item) =>
        isResolvedManagedSiteTokenBatchExportItemInput(item)
          ? [[item.runtimeKey.id, item.runtimeKey] as const]
          : [],
      ),
    )

    for (const item of result.items) {
      if (!item.success) continue
      const token = selectedTokenByIdentity.get(item.id)
      if (!token) continue
      void Promise.resolve(onManagedSiteImportSuccess(token))
    }
  }

  const handleCloseCCSwitchDialog = () => {
    setCCSwitchContext(null)
  }

  if ((isLoading || nativeLoading) && displayRows.length === 0) {
    return <LoadingSkeleton />
  }

  const renderServiceCredentialCard = (entry: KeyManagementEntry) => {
    if (!isServiceCredentialRuntimeKey(entry.runtimeKey)) return null

    const managedSiteStatusEntry =
      managedSiteTokenStatuses?.[entry.runtimeKey.id]
    return onCopyServiceCredential ? (
      <ServiceCredentialCard
        account={entry.runtimeKey.account as DisplaySiteData}
        credential={entry.runtimeKey.credential}
        isRotating={entry.uiState.isRotating}
        {...getSelectionProps(entry.id)}
        managedSiteStatus={managedSiteStatusEntry?.result}
        isManagedSiteStatusChecking={
          managedSiteStatusEntry?.isChecking === true
        }
        selectionLabel={entry.runtimeKey.label}
        onCopy={onCopyServiceCredential}
        onRotate={onRotateServiceCredential}
        association={getAssociationPresentation(
          getAccountRuntimeKeyLocator(entry.runtimeKey),
          entry.runtimeKey.label,
          entry.runtimeKey.secret,
        )}
        {...getRuntimeEntryNavigationProps(entry)}
      />
    ) : null
  }

  const renderNativeResourceList = (
    rows: readonly NativeKeyManagementRow[],
  ) => (
    <AccountKeyResourceList
      rows={rows}
      accounts={displayData}
      ariaLabel={t("keyManagement:native.heading")}
      onOpenDetail={onOpenNativeDetail}
      onEdit={onEditNativeKey ?? (() => undefined)}
      onDelete={onDeleteNativeKey ?? (() => undefined)}
      detail={nativeDetail}
      isDetailLoading={nativeDetailLoading}
      detailFailure={nativeDetailFailure}
      onCloseDetail={onCloseNativeDetail}
      detailsFromRows={nativeDetailsFromRows}
      selectionDisabledReason={t(
        "keyManagement:batchSelection.unavailableReason",
      )}
      getAssociation={(row) =>
        getAssociationPresentation(
          {
            source: ACCOUNT_RUNTIME_KEY_SOURCES.AccountKeyResource,
            ref: row.facts.ref,
          },
          row.facts.displayName,
          row.facts.maskedLabel,
        )
      }
      getCredentialProfile={(row) =>
        getCredentialProfileForLocator?.({
          source: ACCOUNT_RUNTIME_KEY_SOURCES.AccountKeyResource,
          ref: row.facts.ref,
        })
      }
      getNavigationTarget={getNativeNavigationProps}
      getActions={(row) => {
        const entry = nativeEntriesByRowKey.get(row.rowKey)
        const account = accountById.get(row.accountId)
        if (!entry || !account) return {}
        return {
          ...getSelectionProps(entry.id),
          onOpenCCSwitchDialog: () =>
            setCCSwitchContext({ runtimeKey: entry.runtimeKey, account }),
          managedSiteStatus:
            managedSiteTokenStatuses?.[entry.runtimeKey.id]?.result,
          isManagedSiteStatusChecking:
            managedSiteTokenStatuses?.[entry.runtimeKey.id]?.isChecking,
          onManagedSiteImportSuccess: onManagedSiteImportSuccess
            ? () => onManagedSiteImportSuccess(entry.runtimeKey)
            : undefined,
          onManagedSiteVerificationRetry: onManagedSiteVerificationRetry
            ? (status) =>
                onManagedSiteVerificationRetry(entry.runtimeKey, status)
            : undefined,
          guidedManagedSiteImportRequest:
            entry.id === guidedManagedSiteImportEntryId
              ? guidedManagedSiteImport?.request
              : undefined,
        }
      }}
    />
  )
  const nativeResourceList = renderNativeResourceList(nativeRows)
  if (filteredDisplayRows.length === 0) {
    return (
      <TokenEmptyState
        selectedAccount={selectedAccount}
        totalCount={displayRows.length}
        handleAddToken={handleAddToken}
        canCreateTokens={canCreateTokens}
        displayData={displayData}
        currentAccountLoadError={
          currentAccountLoadError ?? nativeInventoryLoadError
        }
        currentAccountUnsupportedKeyManagement={
          currentAccountUnsupportedKeyManagement
        }
        onRetryCurrentAccount={onRetryCurrentAccount}
        onAddAccount={onAddAccount}
        onRequestAccountSelection={onRequestAccountSelection}
      />
    )
  }

  return (
    <>
      {filteredEligibleEntries.length > 0 ? (
        <div className="gap-density-2 py-density-3 mb-4 flex flex-wrap items-center justify-between rounded-md border px-3">
          {hasFilteredIneligibleEntries ? (
            <p className="text-muted-foreground w-full text-sm" role="status">
              {t("keyManagement:batchSelection.eligibilityNotice", {
                count: filteredEligibleEntries.length,
              })}
            </p>
          ) : null}
          <label className="gap-density-2 flex items-center text-sm">
            <Checkbox
              checked={visibleSelectionChecked}
              onCheckedChange={toggleFilteredSelection}
            />
            {t("batchManagedSiteExport.selection.visible", {
              selected: selectedVisibleCount,
              total: filteredEligibleEntries.length,
            })}
          </label>
          <div className="gap-density-2 flex flex-wrap items-center">
            <Button
              size="sm"
              variant="outline"
              type="button"
              disabled={selectedEntries.length === 0}
              onClick={clearSelection}
            >
              {t("batchManagedSiteExport.actions.clearSelection")}
            </Button>

            <Button
              size="sm"
              type="button"
              data-testid={KEY_MANAGEMENT_TEST_IDS.batchSaveToApiProfilesButton}
              loading={isBatchApiProfilesSaving}
              disabled={selectedApiProfileItems.length === 0}
              variant="outline"
              onClick={() => void handleBatchSaveToApiProfiles()}
              leftIcon={<Library className="h-4 w-4" />}
            >
              {isBatchApiProfilesSaving
                ? t("common:status.saving")
                : t("batchApiCredentialProfiles.actions.open", {
                    selectedCount: selectedApiProfileItems.length,
                  })}
            </Button>
            <Button
              size="sm"
              type="button"
              disabled={selectedManagedSiteBatchItems.length === 0}
              onClick={openBatchExportDialog}
              leftIcon={<SendToBack className="h-4 w-4" />}
            >
              <span className="gap-density-1 inline-flex items-center">
                <ManagedSiteIcon siteType={managedSiteType} size="sm" />
                {t("batchManagedSiteExport.actions.open", {
                  site: managedSiteLabel,
                  selectedCount: selectedManagedSiteBatchItems.length,
                })}
              </span>
            </Button>
          </div>
        </div>
      ) : null}

      {!isAllAccountsMode ? nativeResourceList : null}

      {isAllAccountsMode && groupedRows && groupedRows.length > 0 ? (
        <>
          <div className="gap-density-2 mb-4 flex flex-wrap items-center justify-end">
            <Button
              size="sm"
              variant="outline"
              type="button"
              data-testid={KEY_MANAGEMENT_TEST_IDS.expandAllButton}
              onClick={expandAll}
              leftIcon={<ChevronDown className="h-4 w-4" />}
            >
              {t("actions.expandAll")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              type="button"
              onClick={collapseAll}
              leftIcon={<ChevronUp className="h-4 w-4" />}
            >
              {t("actions.collapseAll")}
            </Button>
          </div>

          <div className="space-y-density-3">
            {groupedRows.map((group) => {
              const { account } = group
              const isCollapsed = collapsedAccountIds.has(account.id)
              const shouldShowShowingCount =
                group.showingCount !== group.totalCount
              const groupEligibleEntries = filteredEligibleEntries.filter(
                (entry) => entry.runtimeKey.accountId === account.id,
              )
              const selectedGroupVisibleCount = groupEligibleEntries.filter(
                (entry) => selectedEntryIds.has(entry.id),
              ).length
              const groupSelectionChecked =
                selectedGroupVisibleCount === 0
                  ? false
                  : selectedGroupVisibleCount === groupEligibleEntries.length
                    ? true
                    : "indeterminate"

              return (
                <Card
                  key={account.id}
                  variant="outlined"
                  className="overflow-hidden"
                  role="group"
                  aria-label={account.name}
                >
                  <div
                    className={cn(
                      "dark:hover:bg-secondary hover:bg-surface-subtle gap-density-3 py-density-2 flex w-full items-center justify-between px-3 text-left",
                      isCollapsed ? "rounded-lg" : "border-border border-b",
                    )}
                  >
                    <BatchSelectionControl
                      checked={groupSelectionChecked}
                      label={t(
                        "batchManagedSiteExport.selection.accountGroup",
                        { name: account.name },
                      )}
                      onSelectionChange={
                        groupEligibleEntries.length > 0
                          ? (checked) =>
                              toggleGroupSelection(
                                groupEligibleEntries,
                                checked,
                              )
                          : undefined
                      }
                      disabledReason={
                        groupEligibleEntries.length === 0
                          ? t(
                              "keyManagement:batchSelection.accountUnavailableReason",
                            )
                          : undefined
                      }
                    />
                    <button
                      type="button"
                      className="gap-density-3 flex min-w-0 flex-1 items-center justify-between text-left"
                      onClick={() => toggleGroup(account.id)}
                      aria-expanded={!isCollapsed}
                    >
                      <div className="gap-density-2 flex min-w-0 flex-1 items-center">
                        <span className="truncate font-medium">
                          {account.name}
                        </span>
                        <Badge
                          variant="secondary"
                          size="sm"
                          className="shrink-0"
                        >
                          {t("accountSummary.keys", {
                            count: group.totalCount,
                          })}
                        </Badge>
                        <Badge variant="outline" size="sm" className="shrink-0">
                          {t("enabledCount", { count: group.enabledCount })}
                        </Badge>
                        {shouldShowShowingCount ? (
                          <Badge
                            variant="outline"
                            size="sm"
                            className="shrink-0"
                          >
                            {t("showingCount", { count: group.showingCount })}
                          </Badge>
                        ) : null}
                      </div>
                      <ChevronDown
                        className={cn(
                          "text-muted-foreground h-4 w-4 shrink-0 transition-transform",
                          isCollapsed ? "rotate-0" : "rotate-180",
                        )}
                      />
                    </button>
                  </div>

                  {!isCollapsed ? (
                    <div className="space-y-density-3 py-density-3 px-3">
                      {group.filteredEntries.map((entry) => (
                        <div key={entry.id}>
                          {renderServiceCredentialCard(entry)}
                        </div>
                      ))}
                      {renderNativeResourceList(group.nativeRows)}
                    </div>
                  ) : null}
                </Card>
              )
            })}
          </div>
        </>
      ) : (
        <div className="space-y-density-3">
          {filteredEntries.map((entry) => (
            <div key={entry.id}>{renderServiceCredentialCard(entry)}</div>
          ))}
        </div>
      )}

      {currentCCSwitchTarget && isCurrentCCSwitchContextExportable && (
        <CCSwitchExportDialog
          isOpen={true}
          onClose={handleCloseCCSwitchDialog}
          source={currentCCSwitchTarget.exportSource}
        />
      )}

      <ManagedSiteTokenBatchExportDialog
        isOpen={batchExportOpen && isBatchExportSnapshotEligible}
        onClose={closeBatchExportDialog}
        items={batchExportItems}
        intent={MANUAL_MANAGED_SITE_BATCH_IMPORT_INTENT}
        onCompleted={handleBatchExportCompleted}
      />
    </>
  )
}
