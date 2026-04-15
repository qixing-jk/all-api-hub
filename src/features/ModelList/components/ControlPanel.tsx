import {
  AdjustmentsHorizontalIcon,
  ClipboardDocumentListIcon,
  CpuChipIcon,
  MagnifyingGlassIcon,
} from "@heroicons/react/24/outline"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

import {
  Alert,
  Button,
  Card,
  CardContent,
  CompactMultiSelect,
  FormField,
  Input,
  Label,
  SearchableSelect,
  Switch,
} from "~/components/ui"
import {
  MODEL_LIST_BILLING_MODES,
  type ModelListBillingMode,
} from "~/features/ModelList/billingModes"
import type {
  ModelManagementSource,
  ModelManagementSourceCapabilities,
} from "~/features/ModelList/modelManagementSources"
import {
  MODEL_LIST_SORT_MODES,
  type ModelListSortMode,
} from "~/features/ModelList/sortModes"

interface ControlPanelProps {
  selectedSource: ModelManagementSource | null
  sourceCapabilities: ModelManagementSourceCapabilities
  searchTerm: string
  setSearchTerm: (term: string) => void
  sortMode: ModelListSortMode
  setSortMode: (mode: ModelListSortMode) => void
  selectedBillingMode: ModelListBillingMode
  setSelectedBillingMode: (mode: ModelListBillingMode) => void
  selectedGroups: string[]
  setSelectedGroups: (groups: string[]) => void
  availableGroups: string[]
  pricingData: any
  showRealPrice: boolean
  setShowRealPrice: (show: boolean) => void
  showRatioColumn: boolean
  setShowRatioColumn: (show: boolean) => void
  showEndpointTypes: boolean
  setShowEndpointTypes: (show: boolean) => void
  totalModels: number
  filteredModels: any[]
}

/**
 * Top control strip for searching, filtering, and display options.
 * @param props Component props bundle.
 * @param props.selectedSource Active model-management source.
 * @param props.sourceCapabilities Capability flags for the active source.
 * @param props.searchTerm Current search keyword.
 * @param props.setSearchTerm Setter to update search keyword.
 * @param props.selectedBillingMode Active billing-mode filter value.
 * @param props.setSelectedBillingMode Setter for billing-mode filter.
 * @param props.selectedGroups Active candidate group filter set.
 * @param props.setSelectedGroups Setter for candidate group filter set.
 * @param props.availableGroups Available group options.
 * @param props.pricingData Pricing data used to show ratios.
 * @param props.showRealPrice Whether to display real price values.
 * @param props.setShowRealPrice Setter for real price toggle.
 * @param props.showRatioColumn Whether to show ratio column.
 * @param props.setShowRatioColumn Setter for ratio column toggle.
 * @param props.showEndpointTypes Whether to show endpoint types.
 * @param props.setShowEndpointTypes Setter for endpoint type toggle.
 * @param props.totalModels Total models available.
 * @param props.filteredModels Currently filtered model list.
 * @returns Card with filters, toggles, and actions.
 */
export function ControlPanel({
  selectedSource,
  sourceCapabilities,
  searchTerm,
  setSearchTerm,
  sortMode,
  setSortMode,
  selectedBillingMode,
  setSelectedBillingMode,
  selectedGroups,
  setSelectedGroups,
  availableGroups,
  pricingData,
  showRealPrice,
  setShowRealPrice,
  showRatioColumn,
  setShowRatioColumn,
  showEndpointTypes,
  setShowEndpointTypes,
  totalModels,
  filteredModels,
}: ControlPanelProps) {
  const { t } = useTranslation(["modelList", "ui"])
  const isProfileSource = selectedSource?.kind === "profile"
  const supportsPriceSorting = sourceCapabilities.supportsPricing
  const groupOptions = availableGroups.map((group) => ({
    value: group,
    label: `${group} (${pricingData?.group_ratio?.[group] || 1}x)`,
  }))
  const sortOptions = [
    {
      value: MODEL_LIST_SORT_MODES.DEFAULT,
      label: t("sortOptions.default"),
    },
    {
      value: MODEL_LIST_SORT_MODES.PRICE_ASC,
      label: t("sortOptions.priceAsc"),
    },
    {
      value: MODEL_LIST_SORT_MODES.PRICE_DESC,
      label: t("sortOptions.priceDesc"),
    },
    ...(selectedSource?.kind === "all-accounts"
      ? [
          {
            value: MODEL_LIST_SORT_MODES.MODEL_CHEAPEST_FIRST,
            label: t("sortOptions.modelCheapestFirst"),
          },
        ]
      : []),
  ]
  const billingModeOptions = [
    {
      value: MODEL_LIST_BILLING_MODES.ALL,
      label: t("allBillingModes"),
    },
    {
      value: MODEL_LIST_BILLING_MODES.TOKEN_BASED,
      label: t("ui:billing.tokenBased"),
    },
    {
      value: MODEL_LIST_BILLING_MODES.PER_CALL,
      label: t("ui:billing.perCall"),
    },
  ]

  const handleCopyModelNames = () => {
    if (filteredModels.length === 0) {
      toast.error(t("noMatchingModels"))
      return
    }
    const modelNames = filteredModels
      .map((item) => item.model.model_name)
      .join(",")
    navigator.clipboard.writeText(modelNames)
    toast.success(t("messages.modelNamesCopied"))
  }

  return (
    <Card className="mb-6">
      <CardContent>
        {isProfileSource && (
          <Alert
            variant="info"
            className="mb-4"
            title={t("profileSourceNotice.title")}
            description={t("profileSourceNotice.description")}
          />
        )}

        <div className="mb-4 flex flex-col gap-4 lg:flex-row">
          <FormField label={t("searchModels")} className="flex-1">
            <Input
              type="text"
              placeholder={t("searchPlaceholder")}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              leftIcon={<MagnifyingGlassIcon className="h-4 w-4" />}
            />
          </FormField>

          {supportsPriceSorting && (
            <FormField label={t("sortBy")} className="w-full lg:w-72">
              <SearchableSelect
                options={sortOptions}
                value={sortMode}
                onChange={(value) => setSortMode(value as ModelListSortMode)}
                placeholder={t("sortBy")}
              />
            </FormField>
          )}

          {sourceCapabilities.supportsPricing && (
            <FormField label={t("billingMode")} className="w-full lg:w-64">
              <SearchableSelect
                options={billingModeOptions}
                value={selectedBillingMode}
                onChange={(value) =>
                  setSelectedBillingMode(value as ModelListBillingMode)
                }
                placeholder={t("allBillingModes")}
              />
            </FormField>
          )}

          {sourceCapabilities.supportsGroupFiltering && (
            <FormField label={t("userGroup")} className="w-full lg:w-64">
              <CompactMultiSelect
                options={groupOptions}
                selected={selectedGroups}
                onChange={setSelectedGroups}
                displayMode="summary"
                placeholder={t("allGroups")}
                emptyMessage={t("allGroups")}
              />
              <p className="dark:text-dark-text-tertiary mt-1 text-xs text-gray-500">
                {t("groupSelectionHint")}
              </p>
            </FormField>
          )}
        </div>

        <div className="dark:border-dark-bg-tertiary flex flex-col gap-4 border-t border-gray-100 pt-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <div className="flex items-center space-x-2">
              <AdjustmentsHorizontalIcon className="dark:text-dark-text-tertiary h-4 w-4 text-gray-400" />
              <span className="dark:text-dark-text-secondary font-medium text-gray-700">
                {t("displayOptions")}
              </span>
            </div>

            {sourceCapabilities.supportsPricing && (
              <label className="flex cursor-pointer items-center space-x-2">
                <Switch
                  checked={showRealPrice}
                  onChange={setShowRealPrice}
                  size="sm"
                />
                <Label className="cursor-pointer">{t("realAmount")}</Label>
              </label>
            )}

            {sourceCapabilities.supportsPricing && (
              <label className="flex cursor-pointer items-center space-x-2">
                <Switch
                  checked={showRatioColumn}
                  onChange={setShowRatioColumn}
                  size="sm"
                />
                <Label className="cursor-pointer">{t("showRatio")}</Label>
              </label>
            )}

            <label className="flex cursor-pointer items-center space-x-2">
              <Switch
                checked={showEndpointTypes}
                onChange={setShowEndpointTypes}
                size="sm"
              />
              <Label className="cursor-pointer">{t("endpointTypes")}</Label>
            </label>

            <Button
              variant="ghost"
              size="sm"
              onClick={handleCopyModelNames}
              leftIcon={<ClipboardDocumentListIcon className="h-4 w-4" />}
            >
              {t("copyAllNames")}
            </Button>
          </div>

          <div className="flex items-center space-x-4 text-sm">
            <div className="dark:text-dark-text-secondary flex items-center space-x-2 text-gray-600">
              <CpuChipIcon className="h-4 w-4" />
              <span>{t("totalModels", { count: totalModels })}</span>
            </div>
            <div className="dark:bg-dark-bg-tertiary h-4 w-px bg-gray-300"></div>
            <div className="text-blue-600 dark:text-blue-400">
              <span>{t("showing", { count: filteredModels.length })}</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
