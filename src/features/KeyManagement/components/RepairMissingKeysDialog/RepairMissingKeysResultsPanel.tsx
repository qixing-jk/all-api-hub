import { MagnifyingGlassIcon, XMarkIcon } from "@heroicons/react/24/outline"
import type { TFunction } from "i18next"
import { ShieldCheck, TriangleAlert } from "lucide-react"
import { useRef, type Dispatch, type SetStateAction } from "react"

import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
  ResponsiveToggleGroup,
  TagFilter,
} from "~/components/ui"
import type {
  AccountKeyRepairAccountResult,
  AccountKeyRepairInvalidToken,
  AccountKeyRepairOutcome,
} from "~/types/accountKeyAutoProvisioning"
import { ACCOUNT_KEY_REPAIR_OUTCOMES } from "~/types/accountKeyAutoProvisioning"

import { RepairAccountCoverageList } from "./RepairAccountCoverageList"
import { RepairInvalidKeysList } from "./RepairInvalidKeysList"
import {
  getRepairResultViewLabel,
  REPAIR_RESULT_VIEWS,
  type RepairResultView,
} from "./repairMissingKeysDialogHelpers"

interface RepairMissingKeysResultsPanelProps {
  accountIds: Set<string>
  activeView: RepairResultView
  deleteResultMessage: string
  filteredInvalidTokens: AccountKeyRepairInvalidToken[]
  filteredResults: AccountKeyRepairAccountResult[]
  invalidTokens: AccountKeyRepairInvalidToken[]
  openingSub2ApiAccountId: string | null
  outcomeCounts: Record<AccountKeyRepairOutcome, number>
  outcomeFilter: AccountKeyRepairOutcome | null
  readOnly?: boolean
  searchTerm: string
  selectedInvalidTokenKeys: Set<string>
  selectedInvalidTokens: AccountKeyRepairInvalidToken[]
  visibleResults: AccountKeyRepairAccountResult[]
  onActiveViewChange: (view: RepairResultView) => void
  onOpenDeleteConfirm: () => void
  onOpenSub2ApiTokenDialog: (accountId: string) => void
  onOutcomeFilterChange: (outcome: AccountKeyRepairOutcome | null) => void
  onSearchTermChange: (value: string) => void
  onSelectedInvalidTokenKeysChange: Dispatch<SetStateAction<Set<string>>>
  t: TFunction
}

/**
 * Coordinates result view switching, search, filtering, and result lists.
 */
export function RepairMissingKeysResultsPanel({
  accountIds,
  activeView,
  deleteResultMessage,
  filteredInvalidTokens,
  filteredResults,
  invalidTokens,
  openingSub2ApiAccountId,
  outcomeCounts,
  outcomeFilter,
  readOnly = false,
  searchTerm,
  selectedInvalidTokenKeys,
  selectedInvalidTokens,
  visibleResults,
  onActiveViewChange,
  onOpenDeleteConfirm,
  onOpenSub2ApiTokenDialog,
  onOutcomeFilterChange,
  onSearchTermChange,
  onSelectedInvalidTokenKeysChange,
  t,
}: RepairMissingKeysResultsPanelProps) {
  const searchInputRef = useRef<HTMLInputElement | null>(null)

  return (
    <>
      <ResponsiveToggleGroup
        aria-label={t("keyManagement:repairMissingKeys.views.label")}
        value={activeView}
        onValueChange={onActiveViewChange}
        buttonSize="sm"
        className="w-full"
        options={[
          {
            value: REPAIR_RESULT_VIEWS.AccountCoverage,
            label: getRepairResultViewLabel(
              t,
              REPAIR_RESULT_VIEWS.AccountCoverage,
            ),
            leftIcon: (
              <ShieldCheck
                aria-hidden="true"
                data-testid="repair-missing-keys-account-coverage-view-icon"
                className="h-4 w-4"
              />
            ),
          },
          {
            value: REPAIR_RESULT_VIEWS.InvalidKeys,
            label: (
              <>
                {getRepairResultViewLabel(t, REPAIR_RESULT_VIEWS.InvalidKeys)}
                {invalidTokens.length > 0 ? (
                  <Badge
                    variant="warning"
                    size="sm"
                    className="ml-2"
                    aria-hidden="true"
                  >
                    {invalidTokens.length}
                  </Badge>
                ) : null}
              </>
            ),
            leftIcon: (
              <TriangleAlert
                aria-hidden="true"
                data-testid="repair-missing-keys-invalid-keys-view-icon"
                className="h-4 w-4"
              />
            ),
          },
        ]}
      />

      <Card>
        <CardHeader
          data-testid="repair-missing-keys-results-header"
          padding="sm"
          className="flex flex-col gap-2 space-y-0 sm:flex-row sm:items-center sm:justify-between"
        >
          <div
            data-testid="repair-missing-keys-result-heading-row"
            className="flex h-9 items-center"
          >
            <div
              data-testid="repair-missing-keys-result-heading"
              className="flex items-baseline gap-2"
            >
              <CardTitle className="text-sm">
                {t("keyManagement:repairMissingKeys.resultsTitle")}
              </CardTitle>
              <span
                data-testid="repair-missing-keys-result-count"
                className="text-xs leading-none text-gray-500 tabular-nums dark:text-gray-400"
              >
                {activeView === REPAIR_RESULT_VIEWS.AccountCoverage
                  ? `${filteredResults.length}/${visibleResults.length}`
                  : `${filteredInvalidTokens.length}/${invalidTokens.length}`}
              </span>
            </div>
          </div>

          <div className="w-full sm:w-80">
            <Label htmlFor="repair-missing-keys-search" className="sr-only">
              {t("keyManagement:repairMissingKeys.searchLabel")}
            </Label>
            <Input
              ref={searchInputRef}
              id="repair-missing-keys-search"
              type="text"
              placeholder={t(
                "keyManagement:repairMissingKeys.searchPlaceholder",
              )}
              aria-label={t("keyManagement:repairMissingKeys.searchLabel")}
              value={searchTerm}
              onChange={(event) => onSearchTermChange(event.target.value)}
              leftIcon={<MagnifyingGlassIcon className="h-4 w-4" />}
              rightIcon={
                searchTerm ? (
                  <button
                    type="button"
                    onClick={() => {
                      onSearchTermChange("")
                      searchInputRef.current?.focus()
                    }}
                    className="dark:hover:bg-dark-bg-tertiary rounded p-1 hover:bg-gray-100"
                    aria-label={t("common:actions.clear")}
                  >
                    <XMarkIcon className="h-4 w-4" />
                  </button>
                ) : null
              }
              containerClassName="w-full"
            />
          </div>
        </CardHeader>

        {activeView === REPAIR_RESULT_VIEWS.AccountCoverage ? (
          <CardContent
            padding="sm"
            spacing="none"
            className="dark:border-dark-bg-tertiary border-b border-gray-200"
          >
            <div className="space-y-2">
              <TagFilter
                mode="single"
                value={outcomeFilter}
                onChange={(value) =>
                  onOutcomeFilterChange(value as AccountKeyRepairOutcome | null)
                }
                allCount={visibleResults.length}
                options={[
                  {
                    value: ACCOUNT_KEY_REPAIR_OUTCOMES.Created,
                    label: t(
                      "keyManagement:repairMissingKeys.outcomes.created",
                    ),
                    count: outcomeCounts.created,
                    variant: "success",
                  },
                  {
                    value: ACCOUNT_KEY_REPAIR_OUTCOMES.AlreadyHad,
                    label: t(
                      "keyManagement:repairMissingKeys.outcomes.alreadyHad",
                    ),
                    count: outcomeCounts.alreadyHad,
                    variant: "info",
                  },
                  {
                    value: ACCOUNT_KEY_REPAIR_OUTCOMES.Skipped,
                    label: t(
                      "keyManagement:repairMissingKeys.outcomes.skipped",
                    ),
                    count: outcomeCounts.skipped,
                    variant: "warning",
                  },
                  {
                    value: ACCOUNT_KEY_REPAIR_OUTCOMES.Failed,
                    label: t("keyManagement:repairMissingKeys.outcomes.failed"),
                    count: outcomeCounts.failed,
                    variant: "danger",
                  },
                ]}
              />
            </div>
          </CardContent>
        ) : null}

        <CardContent padding="none" spacing="none">
          <div className="max-h-[60vh] overflow-y-auto md:max-h-[min(70vh,48rem)]">
            {activeView === REPAIR_RESULT_VIEWS.InvalidKeys ? (
              <RepairInvalidKeysList
                deleteResultMessage={deleteResultMessage}
                filteredInvalidTokens={filteredInvalidTokens}
                invalidTokens={invalidTokens}
                readOnly={readOnly}
                selectedInvalidTokenKeys={selectedInvalidTokenKeys}
                selectedInvalidTokens={selectedInvalidTokens}
                onOpenDeleteConfirm={onOpenDeleteConfirm}
                onSelectedInvalidTokenKeysChange={
                  onSelectedInvalidTokenKeysChange
                }
                t={t}
              />
            ) : (
              <RepairAccountCoverageList
                accountIds={accountIds}
                filteredResults={filteredResults}
                openingSub2ApiAccountId={openingSub2ApiAccountId}
                readOnly={readOnly}
                onOpenSub2ApiTokenDialog={onOpenSub2ApiTokenDialog}
                t={t}
              />
            )}
          </div>
        </CardContent>
      </Card>
    </>
  )
}
