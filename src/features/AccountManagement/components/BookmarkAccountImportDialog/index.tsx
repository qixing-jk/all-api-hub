import type { TFunction } from "i18next"
import {
  BookmarkPlus,
  CheckCircle2,
  FolderOpen,
  ListChecks,
  Loader2,
  ShieldCheck,
  XCircle,
} from "lucide-react"
import { useTranslation } from "react-i18next"

import { Alert } from "~/components/ui/Alert"
import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import { Checkbox } from "~/components/ui/checkbox"
import { Modal } from "~/components/ui/Dialog/Modal"
import { cn } from "~/lib/utils"

import type { BookmarkAccountImportFailureCategory } from "../../bookmarkImport/types"
import { useBookmarkAccountImportDialog } from "../../bookmarkImport/useBookmarkAccountImportDialog"
import { ACCOUNT_MANAGEMENT_TEST_IDS } from "../../testIds"
import { BookmarkTreeSelector } from "./BookmarkTreeSelector"

interface BookmarkAccountImportDialogProps {
  isOpen: boolean
  onClose: () => void
}

const errorMessageKeys = {
  "permission-denied": "ui:dialog.bookmarkAccountImport.permissionDenied",
  "api-unavailable": "ui:dialog.bookmarkAccountImport.apiUnavailable",
  "read-failed": "ui:dialog.bookmarkAccountImport.readFailed",
  empty: "ui:dialog.bookmarkAccountImport.empty",
  "no-candidates": "ui:dialog.bookmarkAccountImport.noCandidates",
  "reload-failed": "ui:dialog.bookmarkAccountImport.reloadFailed",
} as const

/** Resolves the import action label with its selected count. */
function translateImportCount(t: TFunction, count: number) {
  return t("ui:dialog.bookmarkAccountImport.actions.importSelected", {
    selectedCount: count,
  })
}

/** Resolves the selected bookmark count shown before scanning. */
function translateSelectedBookmarkCount(t: TFunction, count: number) {
  return t("ui:dialog.bookmarkAccountImport.selectedBookmarkCount", {
    count,
  })
}

/** Resolves duplicate candidate status with the existing-account count. */
function translateDuplicateStatus(t: TFunction, count: number) {
  return t("ui:dialog.bookmarkAccountImport.status.duplicate", {
    existingAccountCount: count,
  })
}

/** Resolves a safe localized failure message for an import row. */
function translateFailureCategory(
  t: TFunction,
  category: BookmarkAccountImportFailureCategory,
) {
  switch (category) {
    case "detection":
      return t("ui:dialog.bookmarkAccountImport.failures.detection")
    case "save":
      return t("ui:dialog.bookmarkAccountImport.failures.save")
    case "unknown":
      return t("ui:dialog.bookmarkAccountImport.failures.unknown")
  }
}

/** Renders the review status for a bookmark import candidate. */
function CandidateStatusBadge({
  status,
  count,
}: {
  status: "ready" | "duplicate"
  count?: number
}) {
  const { t } = useTranslation()

  if (status === "duplicate") {
    return (
      <Badge variant="warning">{translateDuplicateStatus(t, count ?? 1)}</Badge>
    )
  }

  return (
    <Badge variant="success">
      {t("ui:dialog.bookmarkAccountImport.status.ready")}
    </Badge>
  )
}

/** Renders the account import workflow backed by native browser bookmarks. */
export default function BookmarkAccountImportDialog({
  isOpen,
  onClose,
}: BookmarkAccountImportDialogProps) {
  const { t } = useTranslation()
  const dialog = useBookmarkAccountImportDialog()
  const importCount = dialog.selectedCandidates.length
  const batchImportSteps = [
    {
      icon: FolderOpen,
      label: t("ui:dialog.bookmarkAccountImport.initialSteps.chooseScope"),
    },
    {
      icon: ListChecks,
      label: t("ui:dialog.bookmarkAccountImport.initialSteps.review"),
    },
    {
      icon: ShieldCheck,
      label: t("ui:dialog.bookmarkAccountImport.initialSteps.skipExisting"),
    },
  ]

  const header = (
    <div className="flex min-w-0 items-start gap-3 pr-8">
      <div className="mt-0.5 rounded-lg bg-blue-50 p-2 text-blue-600 dark:bg-blue-900/30 dark:text-blue-200">
        <BookmarkPlus className="h-5 w-5" aria-hidden="true" />
      </div>
      <div className="min-w-0 space-y-1">
        <h2 className="dark:text-dark-text-primary text-base font-semibold text-gray-900">
          {t("ui:dialog.bookmarkAccountImport.title")}
        </h2>
        <p className="dark:text-dark-text-secondary text-sm leading-5 text-gray-500">
          {t("ui:dialog.bookmarkAccountImport.description")}
        </p>
      </div>
    </div>
  )

  const footer =
    dialog.stage === "review" ? (
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
        <Button
          type="button"
          variant="secondary"
          onClick={dialog.backToBookmarkScopeSelection}
          data-testid={
            ACCOUNT_MANAGEMENT_TEST_IDS.bookmarkImportBackToScopeButton
          }
        >
          {t("ui:dialog.bookmarkAccountImport.actions.backToScope")}
        </Button>
        <Button
          type="button"
          onClick={() => void dialog.startImport()}
          disabled={importCount === 0}
          data-testid={ACCOUNT_MANAGEMENT_TEST_IDS.bookmarkImportImportButton}
        >
          {translateImportCount(t, importCount)}
        </Button>
      </div>
    ) : null

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      panelTestId={ACCOUNT_MANAGEMENT_TEST_IDS.bookmarkImportDialog}
      showCloseButton={!dialog.isBusy}
      closeOnEsc={!dialog.isBusy}
      closeOnBackdropClick={!dialog.isBusy}
      size={dialog.stage === "select-scope" ? "xl" : "lg"}
      panelClassName={
        dialog.stage === "select-scope" ? "h-[86vh] max-h-[86vh]" : undefined
      }
      header={header}
      footer={footer}
    >
      {dialog.stage === "permission-needed" && (
        <div className="space-y-4">
          {dialog.error ? (
            <Alert
              compact
              variant={
                dialog.error === "empty" || dialog.error === "no-candidates"
                  ? "warning"
                  : "destructive"
              }
              description={t(errorMessageKeys[dialog.error])}
            />
          ) : (
            <div className="space-y-3">
              <p className="dark:text-dark-text-secondary text-sm leading-6 text-gray-600">
                {t("ui:dialog.bookmarkAccountImport.initialValue")}
              </p>
              <div className="grid gap-2 sm:grid-cols-3">
                {batchImportSteps.map(({ icon: Icon, label }) => (
                  <div
                    key={label}
                    className="dark:border-dark-bg-tertiary dark:bg-dark-bg-secondary flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm"
                  >
                    <Icon
                      className="size-4 shrink-0 text-blue-600 dark:text-blue-300"
                      aria-hidden="true"
                    />
                    <span className="dark:text-dark-text-secondary text-gray-700">
                      {label}
                    </span>
                  </div>
                ))}
              </div>
              <p className="dark:text-dark-text-tertiary text-xs leading-5 text-gray-500">
                {t("ui:dialog.bookmarkAccountImport.permissionNeeded")}
              </p>
            </div>
          )}
          <div className="flex justify-end">
            <Button
              type="button"
              onClick={() => void dialog.startScan()}
              leftIcon={<BookmarkPlus className="h-4 w-4" />}
              data-testid={
                ACCOUNT_MANAGEMENT_TEST_IDS.bookmarkImportAllowScanButton
              }
            >
              {t("ui:dialog.bookmarkAccountImport.actions.allowAndScan")}
            </Button>
          </div>
        </div>
      )}

      {dialog.stage === "scanning" && (
        <div className="flex items-center gap-3 rounded-lg border border-blue-100 bg-blue-50 p-4 text-sm text-blue-800 dark:border-blue-800 dark:bg-blue-900/30 dark:text-blue-100">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
          <span>{t("ui:dialog.bookmarkAccountImport.scanning")}</span>
        </div>
      )}

      {dialog.stage === "select-scope" && (
        <div className="flex min-h-0 flex-1 flex-col gap-4">
          {dialog.error === "no-candidates" && (
            <Alert
              compact
              variant="warning"
              description={t(errorMessageKeys["no-candidates"])}
            />
          )}
          <Alert
            compact
            variant="info"
            description={t("ui:dialog.bookmarkAccountImport.scopeHelp")}
          />
          <BookmarkTreeSelector
            tree={dialog.bookmarkTree}
            selectedNodeIds={dialog.selectedBookmarkNodeIds}
            onToggleNode={dialog.toggleBookmarkNode}
            onSetNodeSelection={dialog.setBookmarkNodeSelection}
            className="min-h-0 flex-1"
          />
          <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="dark:text-dark-text-tertiary text-sm text-gray-500">
              {translateSelectedBookmarkCount(
                t,
                dialog.selectedBookmarkUrlCount,
              )}
            </p>
            <Button
              type="button"
              onClick={() => dialog.scanSelectedBookmarks()}
              disabled={!dialog.canScanSelectedBookmarks}
              data-testid={
                ACCOUNT_MANAGEMENT_TEST_IDS.bookmarkImportScanSelectedButton
              }
            >
              {t("ui:dialog.bookmarkAccountImport.actions.scanSelected")}
            </Button>
          </div>
        </div>
      )}

      {dialog.stage === "review" && (
        <div className="space-y-4">
          <label className="dark:border-dark-bg-tertiary flex items-start gap-3 rounded-lg border border-gray-200 p-3 text-sm">
            <Checkbox
              checked={dialog.includeExisting}
              onCheckedChange={(checked) =>
                dialog.toggleIncludeExisting(checked === true)
              }
              data-testid={
                ACCOUNT_MANAGEMENT_TEST_IDS.bookmarkImportIncludeExistingCheckbox
              }
            />
            <span className="dark:text-dark-text-secondary leading-5 text-gray-700">
              {t("ui:dialog.bookmarkAccountImport.includeExisting")}
            </span>
          </label>

          <div className="space-y-2">
            {dialog.candidates.map((candidate) => {
              const checked = dialog.selectedCandidateIds.has(candidate.id)
              const disabled =
                candidate.status === "duplicate" && !dialog.includeExisting

              return (
                <div
                  key={candidate.id}
                  data-testid={
                    ACCOUNT_MANAGEMENT_TEST_IDS.bookmarkImportCandidateRow
                  }
                  className={cn(
                    "flex items-start gap-3 rounded-lg border p-3",
                    disabled
                      ? "border-amber-100 bg-amber-50/60 dark:border-amber-900/60 dark:bg-amber-950/20"
                      : "dark:border-dark-bg-tertiary dark:bg-dark-bg-secondary border-gray-200 bg-white",
                  )}
                >
                  <Checkbox
                    checked={checked}
                    disabled={disabled}
                    onCheckedChange={() => dialog.toggleCandidate(candidate.id)}
                    aria-label={candidate.url}
                    className="mt-1"
                  />
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <span className="dark:text-dark-text-primary min-w-0 text-sm font-medium break-all text-gray-900">
                        {candidate.url}
                      </span>
                      <CandidateStatusBadge
                        status={candidate.status}
                        count={candidate.existingAccountCount}
                      />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {dialog.stage === "importing" && (
        <div className="flex items-center gap-3 rounded-lg border border-blue-100 bg-blue-50 p-4 text-sm text-blue-800 dark:border-blue-800 dark:bg-blue-900/30 dark:text-blue-100">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
          <span>
            {t("ui:dialog.bookmarkAccountImport.importing", {
              completed: dialog.progress.completedCount,
              total: dialog.progress.totalCount,
            })}
          </span>
        </div>
      )}

      {dialog.stage === "results" && (
        <div className="space-y-4">
          {dialog.error === "reload-failed" && (
            <Alert
              compact
              variant="warning"
              description={t(errorMessageKeys["reload-failed"])}
            />
          )}
          <Alert
            compact
            variant={dialog.result.failureCount > 0 ? "warning" : "success"}
            description={t("ui:dialog.bookmarkAccountImport.resultSummary", {
              success: dialog.result.successCount,
              failed: dialog.result.failureCount,
              skipped: dialog.result.skippedCount,
            })}
          />
          <div className="space-y-2">
            {dialog.result.rows.map((row) => (
              <div
                key={row.candidateId}
                className="dark:border-dark-bg-tertiary flex items-start justify-between gap-3 rounded-lg border border-gray-200 p-3"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2">
                    {row.status === "success" ? (
                      <CheckCircle2
                        className="h-4 w-4 text-emerald-600"
                        aria-hidden="true"
                      />
                    ) : (
                      <XCircle
                        className="h-4 w-4 text-red-600"
                        aria-hidden="true"
                      />
                    )}
                    <span className="dark:text-dark-text-primary text-sm font-medium break-all text-gray-900">
                      {row.url}
                    </span>
                  </div>
                  <p className="dark:text-dark-text-secondary text-xs text-gray-500">
                    {row.status === "success"
                      ? t("ui:dialog.bookmarkAccountImport.status.imported")
                      : translateFailureCategory(t, row.failureCategory)}
                  </p>
                </div>
                {row.status === "failed" && (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => dialog.openFailedAddAccount(row)}
                    data-testid={
                      ACCOUNT_MANAGEMENT_TEST_IDS.bookmarkImportOpenFailedAddAccountButton
                    }
                  >
                    {t(
                      "ui:dialog.bookmarkAccountImport.actions.openAddAccount",
                    )}
                  </Button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </Modal>
  )
}
