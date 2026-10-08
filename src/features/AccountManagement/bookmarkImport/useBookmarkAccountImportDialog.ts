import { useCallback, useMemo, useState } from "react"

import {
  buildBookmarkAccountImportCandidates,
  summarizeBookmarkAccountImportScan,
} from "~/features/AccountManagement/bookmarkImport/candidates"
import { runBookmarkAccountImport } from "~/features/AccountManagement/bookmarkImport/importAccounts"
import type {
  BookmarkAccountImportCandidate,
  BookmarkAccountImportProgress,
  BookmarkAccountImportRowResult,
  BookmarkAccountImportRunResult,
  BookmarkAccountImportScanSummary,
} from "~/features/AccountManagement/bookmarkImport/types"
import { useAccountDataContext } from "~/features/AccountManagement/hooks/AccountDataContext"
import { useDialogStateContext } from "~/features/AccountManagement/hooks/DialogStateContext"
import { BOOKMARK_IMPORT_ADD_ACCOUNT_PREFILL_SOURCE } from "~/features/AccountManagement/sponsors/types"
import {
  ensurePermissionsDetailed,
  OPTIONAL_PERMISSION_IDS,
} from "~/services/permissions/permissionManager"
import { startProductAnalyticsAction } from "~/services/productAnalytics/actions"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_FAILURE_REASONS,
  PRODUCT_ANALYTICS_FAILURE_STAGES,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
  type ProductAnalyticsErrorCategory,
  type ProductAnalyticsFailureReason,
  type ProductAnalyticsFailureStage,
} from "~/services/productAnalytics/contracts"
import { withProtectionBypassUserCommand } from "~/services/protectionBypass/client"
import { PROTECTION_BYPASS_USER_COMMANDS } from "~/services/protectionBypass/contracts"
import type { SiteAccount } from "~/types"
import { getBrowserBookmarkTree } from "~/utils/browser/browserApi"
import { getCurrentTempWindowRequestSource } from "~/utils/browser/tempWindowRequestSource"

import { useBookmarkScopeSelection } from "./useBookmarkScopeSelection"

/** Boundary used by local development fixtures without replacing browser globals. */
export interface BookmarkAccountImportDialogRuntime {
  accounts: SiteAccount[]
  requestPermissions: typeof ensurePermissionsDetailed
  readBookmarks: typeof getBrowserBookmarkTree
  importAccounts: typeof runBookmarkAccountImport
  loadAccountData: () => Promise<void>
  startAnalytics: typeof startProductAnalyticsAction
}

type BookmarkAccountImportDialogStage =
  | "permission-needed"
  | "select-scope"
  | "scanning"
  | "review"
  | "importing"
  | "results"

type BookmarkAccountImportDialogError =
  | "permission-denied"
  | "api-unavailable"
  | "read-failed"
  | "empty"
  | "no-candidates"
  | "import-failed"
  | "reload-failed"
  | null

const BOOKMARK_IMPORT_ANALYTICS_CONTEXT = {
  featureId: PRODUCT_ANALYTICS_FEATURE_IDS.AccountManagement,
  actionId: PRODUCT_ANALYTICS_ACTION_IDS.ImportAccountsFromBookmarks,
  surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAccountManagementPage,
  entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
} as const

interface CompleteFailureOptions {
  errorCategory: ProductAnalyticsErrorCategory
  failureReason: ProductAnalyticsFailureReason
  failureStage: ProductAnalyticsFailureStage
  itemCount?: number
  selectedCount?: number
  readyCount?: number
  blockedCount?: number
}

/** Creates an empty import result for initial and reset states. */
function createEmptyResult(): BookmarkAccountImportRunResult {
  return {
    rows: [],
    successCount: 0,
    failureCount: 0,
    skippedCount: 0,
  }
}

/** Creates an empty scan summary for initial and no-result states. */
function createEmptySummary(): BookmarkAccountImportScanSummary {
  return {
    candidateCount: 0,
    readyCount: 0,
    duplicateCount: 0,
    invalidCount: 0,
    ignoredCount: 0,
    selectedDefaultCount: 0,
  }
}

/** Selects only candidates that are safe to import by default. */
function createInitialSelection(candidates: BookmarkAccountImportCandidate[]) {
  return new Set(
    candidates
      .filter((candidate) => candidate.selectedByDefault)
      .map((candidate) => candidate.id),
  )
}

/** Controls the bookmark account import dialog workflow. */
export function useBookmarkAccountImportDialog(
  runtime?: BookmarkAccountImportDialogRuntime,
) {
  const accountData = useAccountDataContext()
  const accounts = runtime?.accounts ?? accountData.accounts
  const loadAccountData =
    runtime?.loadAccountData ?? accountData.loadAccountData
  const requestPermissions =
    runtime?.requestPermissions ?? ensurePermissionsDetailed
  const readBookmarks = runtime?.readBookmarks ?? getBrowserBookmarkTree
  const startAnalytics = runtime?.startAnalytics ?? startProductAnalyticsAction
  const { openAddAccount } = useDialogStateContext()
  const [stage, setStage] =
    useState<BookmarkAccountImportDialogStage>("permission-needed")
  const [error, setError] = useState<BookmarkAccountImportDialogError>(null)
  const [candidates, setCandidates] = useState<
    BookmarkAccountImportCandidate[]
  >([])
  const {
    bookmarkTree,
    selectedBookmarkNodeIds,
    selectedBookmarkUrlCount,
    canScanSelectedBookmarks,
    replaceBookmarkTree,
    getSelectedBookmarkTree,
    toggleBookmarkNode,
    setBookmarkNodeSelection,
  } = useBookmarkScopeSelection()
  const [selectedCandidateIds, setSelectedCandidateIds] = useState<Set<string>>(
    () => new Set(),
  )
  const [includeExisting, setIncludeExisting] = useState(false)
  const [scanSummary, setScanSummary] =
    useState<BookmarkAccountImportScanSummary>(() => createEmptySummary())
  const [progress, setProgress] = useState<BookmarkAccountImportProgress>({
    completedCount: 0,
    totalCount: 0,
    currentCandidateId: "",
  })
  const [result, setResult] = useState<BookmarkAccountImportRunResult>(() =>
    createEmptyResult(),
  )

  const selectedCandidates = useMemo(
    () =>
      candidates.filter((candidate) => selectedCandidateIds.has(candidate.id)),
    [candidates, selectedCandidateIds],
  )
  const isBusy = stage === "scanning" || stage === "importing"

  const completeFailure = useCallback(
    ({
      errorCategory,
      failureReason,
      failureStage,
      itemCount = candidates.length,
      selectedCount = selectedCandidateIds.size,
      readyCount = scanSummary.readyCount,
      blockedCount = scanSummary.duplicateCount,
    }: CompleteFailureOptions) => {
      startAnalytics(BOOKMARK_IMPORT_ANALYTICS_CONTEXT).complete(
        PRODUCT_ANALYTICS_RESULTS.Failure,
        {
          errorCategory,
          insights: {
            failureReason,
            failureStage,
            itemCount,
            selectedCount,
            readyCount,
            blockedCount,
          },
        },
      )
    },
    [
      candidates.length,
      scanSummary.duplicateCount,
      scanSummary.readyCount,
      selectedCandidateIds.size,
      startAnalytics,
    ],
  )

  const startScan = useCallback(async () => {
    setStage("scanning")
    setError(null)
    setResult(createEmptyResult())
    setProgress({
      completedCount: 0,
      totalCount: 0,
      currentCandidateId: "",
    })

    try {
      const permissionResult = await requestPermissions([
        OPTIONAL_PERMISSION_IDS.Bookmarks,
      ])

      if (!permissionResult.success) {
        setError("permission-denied")
        setStage("permission-needed")
        completeFailure({
          errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Permission,
          failureReason: PRODUCT_ANALYTICS_FAILURE_REASONS.PermissionDenied,
          failureStage: PRODUCT_ANALYTICS_FAILURE_STAGES.Permission,
          itemCount: 0,
          selectedCount: 0,
          readyCount: 0,
          blockedCount: 0,
        })
        return
      }

      const bookmarkRead = await readBookmarks()
      if (!bookmarkRead.success) {
        setError(
          bookmarkRead.reason === "unavailable"
            ? "api-unavailable"
            : "read-failed",
        )
        setStage("permission-needed")
        completeFailure({
          errorCategory:
            bookmarkRead.reason === "unavailable"
              ? PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unsupported
              : PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
          failureReason:
            bookmarkRead.reason === "unavailable"
              ? PRODUCT_ANALYTICS_FAILURE_REASONS.PermissionUnavailable
              : PRODUCT_ANALYTICS_FAILURE_REASONS.StorageReadFailed,
          failureStage: PRODUCT_ANALYTICS_FAILURE_STAGES.Request,
          itemCount: 0,
          selectedCount: 0,
          readyCount: 0,
          blockedCount: 0,
        })
        return
      }

      if (bookmarkRead.tree.length === 0) {
        setCandidates([])
        setSelectedCandidateIds(new Set())
        setScanSummary(createEmptySummary())
        setError("empty")
        setStage("permission-needed")
        completeFailure({
          errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
          failureReason: PRODUCT_ANALYTICS_FAILURE_REASONS.EmptyResponse,
          failureStage: PRODUCT_ANALYTICS_FAILURE_STAGES.Response,
          itemCount: 0,
          selectedCount: 0,
          readyCount: 0,
          blockedCount: 0,
        })
        return
      }

      replaceBookmarkTree(bookmarkRead.tree)
      setCandidates([])
      setSelectedCandidateIds(new Set())
      setIncludeExisting(false)
      setScanSummary(createEmptySummary())
      setStage("select-scope")
    } catch {
      setError("read-failed")
      setStage("permission-needed")
      completeFailure({
        errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
        failureReason: PRODUCT_ANALYTICS_FAILURE_REASONS.Unknown,
        failureStage: PRODUCT_ANALYTICS_FAILURE_STAGES.Request,
        itemCount: 0,
        selectedCount: 0,
        readyCount: 0,
        blockedCount: 0,
      })
    }
  }, [completeFailure, requestPermissions, readBookmarks, replaceBookmarkTree])

  const scanSelectedBookmarks = useCallback(() => {
    if (!canScanSelectedBookmarks) return

    setStage("scanning")
    setError(null)
    const selectedBookmarkTree = getSelectedBookmarkTree()
    const scan = buildBookmarkAccountImportCandidates({
      bookmarkTree: selectedBookmarkTree,
      existingAccounts: accounts,
    })
    const nextSummary = summarizeBookmarkAccountImportScan(scan)
    const nextSelection = createInitialSelection(scan.candidates)

    setCandidates(scan.candidates)
    setSelectedCandidateIds(nextSelection)
    setIncludeExisting(false)
    setScanSummary(nextSummary)

    if (scan.candidates.length === 0) {
      setError("no-candidates")
      setStage("select-scope")
      completeFailure({
        errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unsupported,
        failureReason: PRODUCT_ANALYTICS_FAILURE_REASONS.UnsupportedTarget,
        failureStage: PRODUCT_ANALYTICS_FAILURE_STAGES.Parse,
        itemCount: 0,
        selectedCount: 0,
        readyCount: 0,
        blockedCount: 0,
      })
      return
    }

    setStage("review")
  }, [
    accounts,
    canScanSelectedBookmarks,
    completeFailure,
    getSelectedBookmarkTree,
  ])

  const toggleCandidate = useCallback(
    (candidateId: string) => {
      const candidate = candidates.find((item) => item.id === candidateId)
      if (!candidate) return
      if (candidate.status === "duplicate" && !includeExisting) return

      setSelectedCandidateIds((current) => {
        const next = new Set(current)
        if (next.has(candidateId)) {
          next.delete(candidateId)
        } else {
          next.add(candidateId)
        }
        return next
      })
    },
    [candidates, includeExisting],
  )

  const toggleIncludeExisting = useCallback(
    (checked: boolean) => {
      setIncludeExisting(checked)
      setSelectedCandidateIds((current) => {
        const next = new Set(current)
        for (const candidate of candidates) {
          if (candidate.status !== "duplicate") continue

          if (checked) {
            next.add(candidate.id)
          } else {
            next.delete(candidate.id)
          }
        }
        return next
      })
    },
    [candidates],
  )

  const startImport = useCallback(
    async (retryFailed = false) => {
      if (stage !== (retryFailed ? "results" : "review")) return
      const failedIds = new Set(
        result.rows
          .filter((row) => row.status === "failed")
          .map((row) => row.candidateId),
      )
      const importCandidates = retryFailed
        ? candidates.filter((candidate) => failedIds.has(candidate.id))
        : selectedCandidates
      if (importCandidates.length === 0) return

      setStage("importing")
      setError(null)
      setProgress({
        completedCount: 0,
        totalCount: importCandidates.length,
        currentCandidateId: "",
      })

      const tracker = startAnalytics(BOOKMARK_IMPORT_ANALYTICS_CONTEXT)
      let importResult: BookmarkAccountImportRunResult
      try {
        importResult = runtime
          ? await runtime.importAccounts({
              candidates: importCandidates,
              onProgress: setProgress,
            })
          : await withProtectionBypassUserCommand(
              PROTECTION_BYPASS_USER_COMMANDS.AddAccount,
              getCurrentTempWindowRequestSource(),
              (protectionBypassExecution) =>
                runBookmarkAccountImport({
                  candidates: importCandidates,
                  onProgress: setProgress,
                  protectionBypassExecution,
                }),
            )
      } catch {
        setError("import-failed")
        tracker.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
          errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
          insights: {
            failureReason: PRODUCT_ANALYTICS_FAILURE_REASONS.Unknown,
            failureStage: PRODUCT_ANALYTICS_FAILURE_STAGES.Execute,
            itemCount: candidates.length,
            selectedCount: importCandidates.length,
            readyCount: scanSummary.readyCount,
            blockedCount: scanSummary.duplicateCount,
          },
        })
        setStage(retryFailed ? "results" : "review")
        return
      }
      let displayedResult = {
        ...importResult,
        skippedCount:
          importResult.skippedCount +
          candidates.length -
          importCandidates.length,
      }
      if (retryFailed) {
        const retriedRows = new Map(
          importResult.rows.map((row) => [row.candidateId, row]),
        )
        const rows = result.rows.map(
          (row) => retriedRows.get(row.candidateId) ?? row,
        )
        displayedResult = {
          rows,
          successCount: rows.filter((row) => row.status === "success").length,
          failureCount: rows.filter((row) => row.status === "failed").length,
          skippedCount: result.skippedCount,
        }
      }
      setResult(displayedResult)

      try {
        await loadAccountData()
      } catch {
        setError("reload-failed")
        tracker.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
          errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
          insights: {
            failureReason: PRODUCT_ANALYTICS_FAILURE_REASONS.StorageReadFailed,
            failureStage: PRODUCT_ANALYTICS_FAILURE_STAGES.Persist,
            itemCount: candidates.length,
            selectedCount: selectedCandidates.length,
            successCount: displayedResult.successCount,
            failureCount: displayedResult.failureCount,
            skippedCount: displayedResult.skippedCount,
            readyCount: scanSummary.readyCount,
            blockedCount: scanSummary.duplicateCount,
          },
        })
        setStage("results")
        return
      }

      tracker.complete(
        displayedResult.failureCount > 0
          ? PRODUCT_ANALYTICS_RESULTS.Failure
          : PRODUCT_ANALYTICS_RESULTS.Success,
        {
          ...(displayedResult.failureCount > 0
            ? {
                errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
              }
            : {}),
          insights: {
            ...(displayedResult.failureCount > 0
              ? {
                  failureReason:
                    PRODUCT_ANALYTICS_FAILURE_REASONS.PartialSuccess,
                  failureStage: PRODUCT_ANALYTICS_FAILURE_STAGES.Execute,
                }
              : {}),
            itemCount: candidates.length,
            selectedCount: selectedCandidates.length,
            successCount: displayedResult.successCount,
            failureCount: displayedResult.failureCount,
            skippedCount: displayedResult.skippedCount,
            readyCount: scanSummary.readyCount,
            blockedCount: scanSummary.duplicateCount,
          },
        },
      )
      setStage("results")
    },
    [
      candidates,
      stage,
      result,
      loadAccountData,
      scanSummary.duplicateCount,
      scanSummary.readyCount,
      selectedCandidates,
      runtime,
      startAnalytics,
    ],
  )

  const backToBookmarkScopeSelection = useCallback(() => {
    if (stage !== "review") return
    setError(null)
    setStage("select-scope")
  }, [stage])

  const openFailedAddAccount = useCallback(
    (row: BookmarkAccountImportRowResult) => {
      if (row.status !== "failed") return
      openAddAccount({
        source: BOOKMARK_IMPORT_ADD_ACCOUNT_PREFILL_SOURCE,
        siteUrl: row.url,
        ...(row.siteType ? { siteType: row.siteType } : {}),
        ...(row.authType ? { authType: row.authType } : {}),
      })
    },
    [openAddAccount],
  )

  return {
    stage,
    error,
    candidates,
    bookmarkTree,
    selectedBookmarkNodeIds,
    selectedCandidateIds,
    selectedCandidates,
    selectedBookmarkUrlCount,
    includeExisting,
    scanSummary,
    progress,
    result,
    isBusy,
    canScanSelectedBookmarks,
    startScan,
    scanSelectedBookmarks,
    backToBookmarkScopeSelection,
    startImport,
    toggleBookmarkNode,
    setBookmarkNodeSelection,
    toggleCandidate,
    toggleIncludeExisting,
    openFailedAddAccount,
  }
}
