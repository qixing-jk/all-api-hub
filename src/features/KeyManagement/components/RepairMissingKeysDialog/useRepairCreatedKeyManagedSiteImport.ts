import type { TFunction } from "i18next"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { BASIC_SETTINGS_ANCHOR_TO_TAB } from "~/constants/basicSettingsTabs"
import { SETTINGS_ANCHORS } from "~/constants/settingsAnchors"
import type { ManagedSiteType } from "~/constants/siteType"
import {
  AccountKeyRepairMessageTypes,
  sendAccountKeyRepairMessage,
} from "~/services/accounts/accountKeyAutoProvisioning/messaging"
import {
  buildAccountKeyResourceRuntimeKeyId,
  isAccountKeyResourceRuntimeKey,
} from "~/services/accounts/accountRuntimeKeys"
import type { AccountKeyResourceRef } from "~/services/apiAdapters/contracts/accountKeyResource"
import {
  getRepairCreatedKeyBatchImportAbsenceReason,
  REPAIR_CREATED_KEY_BATCH_IMPORT_ABSENCE_REASONS,
  REPAIR_CREATED_KEY_BATCH_IMPORT_FRESHNESS,
  resolveRepairCreatedKeyBatchImportCandidate,
} from "~/services/managedSites/repairCreatedKeyBatchImport"
import { getCurrentManagedSiteRuntimeConfig } from "~/services/managedSites/runtimeConfig"
import { createManagedSiteTokenBatchImportTarget } from "~/services/managedSites/tokenBatchImportTarget"
import type { DisplaySiteData } from "~/types"
import {
  ACCOUNT_KEY_REPAIR_JOB_STATES,
  ACCOUNT_KEY_REPAIR_MANAGED_SITE_IMPORT_STATUSES,
  ACCOUNT_KEY_REPAIR_PROGRESS_SCHEMA_VERSION,
  type AccountKeyRepairManagedSiteImportStatus,
  type AccountKeyRepairProgress,
} from "~/types/accountKeyAutoProvisioning"
import {
  isResolvedManagedSiteTokenBatchExportItemInput,
  MANAGED_SITE_TOKEN_BATCH_EXPORT_EXECUTION_RESULTS,
  type ManagedSiteBatchImportIntent,
  type ManagedSiteTokenBatchExportExecutionResult,
  type ManagedSiteTokenBatchExportItemInput,
} from "~/types/managedSiteTokenBatchExport"
import { openSettingsTabInNewTab } from "~/utils/navigation"

import type { ManagedSiteTokenBatchExportCompletionContext } from "../ManagedSiteTokenBatchExportDialog/useManagedSiteTokenBatchExportDialog"

interface UseRepairCreatedKeyManagedSiteImportParams {
  accounts: DisplaySiteData[]
  isOpen: boolean
  isCurrentSessionResult: boolean
  managedSiteType: ManagedSiteType
  progress: AccountKeyRepairProgress | null
  setProgress: (progress: AccountKeyRepairProgress) => void
  t: TFunction
}

interface RepairCreatedImportFeedback {
  action?: "configure-managed-site" | "use-regular-import"
  description: string
  variant: "destructive" | "info" | "warning"
}

const countCreatedReferences = (
  progress: AccountKeyRepairProgress | null,
  accounts: DisplaySiteData[],
) => {
  if (
    !progress ||
    progress.schemaVersion !== ACCOUNT_KEY_REPAIR_PROGRESS_SCHEMA_VERSION ||
    progress.state !== ACCOUNT_KEY_REPAIR_JOB_STATES.Completed
  ) {
    return 0
  }

  const activeAccountsById = new Map(
    accounts
      .filter((account) => !account.disabled)
      .map((account) => [account.id, account] as const),
  )
  const referenceKeys = new Set<string>()
  for (const result of progress.results) {
    const account = activeAccountsById.get(result.accountId)
    if (!account || account.siteType !== result.siteType) continue

    for (const requirementResult of result.requirementResults) {
      if (!("created" in requirementResult)) continue
      const ref = requirementResult.created.ref
      if (
        ref.accountId !== result.accountId ||
        ref.siteType !== result.siteType
      ) {
        continue
      }
      referenceKeys.add(buildAccountKeyResourceRuntimeKeyId(ref))
    }
  }

  return referenceKeys.size
}

const getVisibleProgress = (
  progress: AccountKeyRepairProgress,
  accounts: DisplaySiteData[],
): AccountKeyRepairProgress => {
  const disabledAccountIds = new Set(
    accounts.filter((account) => account.disabled).map((account) => account.id),
  )
  return {
    ...progress,
    results: progress.results.filter(
      (result) => !disabledAccountIds.has(result.accountId),
    ),
  }
}

const getRepairImportReceiptItems = (params: {
  candidateItems: ManagedSiteTokenBatchExportItemInput[]
  result: ManagedSiteTokenBatchExportExecutionResult
  context?: ManagedSiteTokenBatchExportCompletionContext
}) => {
  const inputById = new Map(
    params.candidateItems
      .filter(isResolvedManagedSiteTokenBatchExportItemInput)
      .map((input) => [input.runtimeKey.id, input] as const),
  )
  const receiptByKey = new Map<
    string,
    {
      resourceRef: AccountKeyResourceRef
      status: AccountKeyRepairManagedSiteImportStatus
    }
  >()

  const addReceipt = (
    id: string,
    status: AccountKeyRepairManagedSiteImportStatus,
  ) => {
    const input = inputById.get(id)
    if (!input || !isAccountKeyResourceRuntimeKey(input.runtimeKey)) return
    const resourceRef = input.runtimeKey.resourceRef
    const key = buildAccountKeyResourceRuntimeKeyId(resourceRef)
    receiptByKey.set(key, {
      resourceRef,
      status,
    })
  }

  for (const item of params.result.items) {
    const status =
      item.result === MANAGED_SITE_TOKEN_BATCH_EXPORT_EXECUTION_RESULTS.CREATED
        ? ACCOUNT_KEY_REPAIR_MANAGED_SITE_IMPORT_STATUSES.Created
        : item.result ===
            MANAGED_SITE_TOKEN_BATCH_EXPORT_EXECUTION_RESULTS.FAILED
          ? ACCOUNT_KEY_REPAIR_MANAGED_SITE_IMPORT_STATUSES.Failed
          : ACCOUNT_KEY_REPAIR_MANAGED_SITE_IMPORT_STATUSES.Uncertain
    addReceipt(item.id, status)
  }

  for (const id of params.context?.alreadyPresentItemIds ?? []) {
    addReceipt(
      id,
      ACCOUNT_KEY_REPAIR_MANAGED_SITE_IMPORT_STATUSES.AlreadyPresent,
    )
  }

  return Array.from(receiptByKey.values())
}

/**
 * Owns only repair-entry orchestration; preparation, review, execution, and
 * retry remain inside the shared managed-site batch dialog.
 */
export function useRepairCreatedKeyManagedSiteImport({
  accounts,
  isOpen,
  isCurrentSessionResult,
  managedSiteType,
  progress,
  setProgress,
  t,
}: UseRepairCreatedKeyManagedSiteImportParams) {
  const [isBatchImportOpen, setIsBatchImportOpen] = useState(false)
  const [isResolving, setIsResolving] = useState(false)
  const [batchImportItems, setBatchImportItems] = useState<
    ManagedSiteTokenBatchExportItemInput[]
  >([])
  const [batchImportIntent, setBatchImportIntent] =
    useState<ManagedSiteBatchImportIntent | null>(null)
  const [importFeedback, setImportFeedback] =
    useState<RepairCreatedImportFeedback | null>(null)
  const activeJobIdRef = useRef<string | null>(null)
  const activeTargetFingerprintRef = useRef<string | null>(null)
  const activeItemsRef = useRef<ManagedSiteTokenBatchExportItemInput[]>([])

  const createdReferenceCount = useMemo(
    () => countCreatedReferences(progress, accounts),
    [accounts, progress],
  )

  const closeBatchImport = useCallback(() => {
    if (isResolving) return
    setIsBatchImportOpen(false)
    setBatchImportItems([])
    setBatchImportIntent(null)
    activeJobIdRef.current = null
    activeTargetFingerprintRef.current = null
    activeItemsRef.current = []
  }, [isResolving])

  const prepareBatchImport = useCallback(
    async (includeCompletedReferences = false) => {
      if (
        isResolving ||
        isBatchImportOpen ||
        !progress ||
        progress.state !== ACCOUNT_KEY_REPAIR_JOB_STATES.Completed
      ) {
        return
      }

      setIsResolving(true)
      setImportFeedback(null)
      try {
        const runtimeConfig = await getCurrentManagedSiteRuntimeConfig()
        if (!runtimeConfig) {
          setImportFeedback({
            action: "configure-managed-site",
            description: t(
              "keyManagement:repairMissingKeys.managedSiteImport.configMissing",
            ),
            variant: "warning",
          })
          return
        }

        const target =
          await createManagedSiteTokenBatchImportTarget(runtimeConfig)
        const visibleProgress = getVisibleProgress(progress, accounts)
        const candidate = await resolveRepairCreatedKeyBatchImportCandidate({
          progress: visibleProgress,
          accounts,
          targetFingerprint: target.targetFingerprint,
          freshness: isCurrentSessionResult
            ? REPAIR_CREATED_KEY_BATCH_IMPORT_FRESHNESS.CURRENT_SESSION
            : REPAIR_CREATED_KEY_BATCH_IMPORT_FRESHNESS.HISTORICAL,
          forceCompleteVerification: includeCompletedReferences,
          includeCompletedReferences,
        })
        if (!candidate) {
          const absenceReason = getRepairCreatedKeyBatchImportAbsenceReason({
            progress: visibleProgress,
            targetFingerprint: target.targetFingerprint,
          })
          const nothingPending =
            absenceReason ===
            REPAIR_CREATED_KEY_BATCH_IMPORT_ABSENCE_REASONS.NOTHING_PENDING
          setImportFeedback({
            action:
              nothingPending && !includeCompletedReferences
                ? "use-regular-import"
                : undefined,
            description: t(
              nothingPending
                ? "keyManagement:repairMissingKeys.managedSiteImport.nothingPending"
                : "keyManagement:repairMissingKeys.managedSiteImport.unavailable",
            ),
            variant: nothingPending ? "warning" : "destructive",
          })
          return
        }

        activeJobIdRef.current = progress.jobId
        activeTargetFingerprintRef.current = target.targetFingerprint
        activeItemsRef.current = candidate.items
        setBatchImportItems(candidate.items)
        setBatchImportIntent(candidate.intent)
        setIsBatchImportOpen(true)
      } catch {
        setImportFeedback({
          description: t(
            "keyManagement:repairMissingKeys.managedSiteImport.failed",
          ),
          variant: "destructive",
        })
      } finally {
        setIsResolving(false)
      }
    },
    [
      accounts,
      isBatchImportOpen,
      isCurrentSessionResult,
      isResolving,
      progress,
      t,
    ],
  )

  const openBatchImport = useCallback(
    () => prepareBatchImport(),
    [prepareBatchImport],
  )

  const openRegularBatchImport = useCallback(
    () => prepareBatchImport(true),
    [prepareBatchImport],
  )

  const openManagedSiteConfiguration = useCallback(async () => {
    try {
      await openSettingsTabInNewTab(
        BASIC_SETTINGS_ANCHOR_TO_TAB[SETTINGS_ANCHORS.MANAGED_SITE_SELECTOR],
        {
          anchor: SETTINGS_ANCHORS.MANAGED_SITE_SELECTOR,
        },
      )
    } catch {
      setImportFeedback({
        description: t(
          "keyManagement:repairMissingKeys.managedSiteImport.configurationOpenFailed",
        ),
        variant: "destructive",
      })
    }
  }, [t])

  const handleBatchImportCompleted = useCallback(
    (
      result: ManagedSiteTokenBatchExportExecutionResult,
      context?: ManagedSiteTokenBatchExportCompletionContext,
    ) => {
      const receiptItems = getRepairImportReceiptItems({
        candidateItems: activeItemsRef.current,
        result,
        context,
      })
      const jobId = activeJobIdRef.current
      const targetFingerprint = activeTargetFingerprintRef.current

      if (!jobId || !targetFingerprint || receiptItems.length === 0) return

      void sendAccountKeyRepairMessage(
        AccountKeyRepairMessageTypes.RecordManagedSiteImportResults,
        { jobId, targetFingerprint, items: receiptItems },
      )
        .then((response) => {
          if (response?.success && response.data) {
            setProgress(response.data)
          }
        })
        .catch(() => {
          setImportFeedback({
            description: t(
              "keyManagement:repairMissingKeys.managedSiteImport.receiptFailed",
            ),
            variant: "destructive",
          })
        })
    },
    [setProgress, t],
  )

  useEffect(() => {
    setImportFeedback(null)
  }, [managedSiteType])

  useEffect(() => {
    if (isOpen) return
    setIsBatchImportOpen(false)
    setBatchImportItems([])
    setBatchImportIntent(null)
    setImportFeedback(null)
    activeJobIdRef.current = null
    activeTargetFingerprintRef.current = null
    activeItemsRef.current = []
  }, [isOpen])

  return {
    batchImportIntent,
    batchImportItems,
    importFeedback,
    isBatchImportOpen,
    isResolving,
    openBatchImport,
    openManagedSiteConfiguration,
    openRegularBatchImport,
    closeBatchImport,
    handleBatchImportCompleted,
    createdReferenceCount,
  }
}
