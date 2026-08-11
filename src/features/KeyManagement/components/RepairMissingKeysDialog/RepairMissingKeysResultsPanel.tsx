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
  AccountKeyRepairInvalidResource,
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
import { useRepairResultListMaxHeight } from "./useRepairResultListMaxHeight"

interface RepairMissingKeysResultsPanelProps {
  activeView: RepairResultView
  deleteResultMessage: string
  filteredInvalidResources: AccountKeyRepairInvalidResource[]
  filteredResults: AccountKeyRepairAccountResult[]
  invalidResources: AccountKeyRepairInvalidResource[]
  outcomeCounts: Record<AccountKeyRepairOutcome, number>
  outcomeFilter: AccountKeyRepairOutcome | null
  readOnly?: boolean
  searchTerm: string
  selectedInvalidResourceKeys: Set<string>
  selectedInvalidResources: AccountKeyRepairInvalidResource[]
  visibleResults: AccountKeyRepairAccountResult[]
  onActiveViewChange: (view: RepairResultView) => void
  onOpenDeleteConfirm: () => void
  onOutcomeFilterChange: (outcome: AccountKeyRepairOutcome | null) => void
  onSearchTermChange: (value: string) => void
  onSelectedInvalidResourceKeysChange: Dispatch<SetStateAction<Set<string>>>
  t: TFunction
}

/**
 * Coordinates result view switching, search, filtering, and result lists.
 */
export function RepairMissingKeysResultsPanel({
  activeView,
  deleteResultMessage,
  filteredInvalidResources,
  filteredResults,
  invalidResources,
  outcomeCounts,
  outcomeFilter,
  readOnly = false,
  searchTerm,
  selectedInvalidResourceKeys,
  selectedInvalidResources,
  visibleResults,
  onActiveViewChange,
  onOpenDeleteConfirm,
  onOutcomeFilterChange,
  onSearchTermChange,
  onSelectedInvalidResourceKeysChange,
  t,
}: RepairMissingKeysResultsPanelProps) {
  const searchInputRef = useRef<HTMLInputElement | null>(null)
  const resultListRef = useRef<HTMLDivElement | null>(null)
  const resultListMaxHeight = useRepairResultListMaxHeight(resultListRef)

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
                {invalidResources.length > 0 ? (
                  <Badge
                    variant="warning"
                    size="sm"
                    className="ml-2"
                    aria-hidden="true"
                  >
                    {invalidResources.length}
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
                  : `${filteredInvalidResources.length}/${invalidResources.length}`}
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
                    value: ACCOUNT_KEY_REPAIR_OUTCOMES.Covered,
                    label: t(
                      "keyManagement:repairMissingKeys.outcomes.covered",
                    ),
                    count: outcomeCounts.covered,
                    variant: "success",
                  },
                  {
                    value: ACCOUNT_KEY_REPAIR_OUTCOMES.Repaired,
                    label: t(
                      "keyManagement:repairMissingKeys.outcomes.repaired",
                    ),
                    count: outcomeCounts.repaired,
                    variant: "success",
                  },
                  {
                    value: ACCOUNT_KEY_REPAIR_OUTCOMES.Partial,
                    label: t(
                      "keyManagement:repairMissingKeys.outcomes.partial",
                    ),
                    count: outcomeCounts.partial,
                    variant: "warning",
                  },
                  {
                    value: ACCOUNT_KEY_REPAIR_OUTCOMES.Blocked,
                    label: t(
                      "keyManagement:repairMissingKeys.outcomes.blocked",
                    ),
                    count: outcomeCounts.blocked,
                    variant: "warning",
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
          <div
            ref={resultListRef}
            className="overflow-y-auto"
            style={
              resultListMaxHeight === null
                ? undefined
                : { maxHeight: resultListMaxHeight }
            }
          >
            {activeView === REPAIR_RESULT_VIEWS.InvalidKeys ? (
              <RepairInvalidKeysList
                deleteResultMessage={deleteResultMessage}
                filteredInvalidResources={filteredInvalidResources}
                invalidResources={invalidResources}
                readOnly={readOnly}
                selectedInvalidResourceKeys={selectedInvalidResourceKeys}
                selectedInvalidResources={selectedInvalidResources}
                onOpenDeleteConfirm={onOpenDeleteConfirm}
                onSelectedInvalidResourceKeysChange={
                  onSelectedInvalidResourceKeysChange
                }
                t={t}
              />
            ) : (
              <RepairAccountCoverageList
                filteredResults={filteredResults}
                searchTerm={searchTerm}
                t={t}
              />
            )}
          </div>
        </CardContent>
      </Card>
    </>
  )
}
