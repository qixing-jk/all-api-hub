import {
  type ModelManagementSource,
  type ModelManagementSourceCapabilities,
} from "~/features/ModelList/catalog/modelManagementSources"
import {
  type ModelCapabilityMetadataCoverage,
  type ModelCapabilitySelectionValue,
} from "~/features/ModelList/filtering/modelCapabilityFilters"
import { type ModelListSortMode } from "~/features/ModelList/filtering/sortModes"
import { type ModelListBillingMode } from "~/features/ModelList/pricing/billingModes"
import {
  type ModelPriceComparisonPresetId,
  type ModelPriceComparisonWeights,
} from "~/features/ModelList/pricing/priceComparison"
import type { ModelPricingScenarioSettings } from "~/features/ModelList/pricing/pricingScenario"
import { type ModelListVerificationResultFilter } from "~/features/ModelList/verification/verificationResultFilters"

export interface ControlPanelProps {
  showUnavailableModels?: boolean
  setShowUnavailableModels?: (show: boolean) => void
  pricingScenarioSettings?: ModelPricingScenarioSettings
  setPricingScenarioSettings?: (settings: ModelPricingScenarioSettings) => void
  selectedSource: ModelManagementSource | null
  sourceCapabilities: ModelManagementSourceCapabilities
  selectedSourceValue?: string
  setSelectedSourceValue?: (sourceValue: string) => void
  searchTerm: string
  setSearchTerm: (term: string) => void
  sortMode: ModelListSortMode
  setSortMode: (mode: ModelListSortMode) => void
  priceComparisonPresetId?: ModelPriceComparisonPresetId
  setPriceComparisonPresetId?: (presetId: ModelPriceComparisonPresetId) => void
  priceComparisonWeights?: ModelPriceComparisonWeights
  setPriceComparisonWeights?: (weights: ModelPriceComparisonWeights) => void
  selectedVerificationResults?: ModelListVerificationResultFilter[]
  setSelectedVerificationResults?: (
    results: ModelListVerificationResultFilter[],
  ) => void
  selectedBillingMode: ModelListBillingMode
  setSelectedBillingMode: (mode: ModelListBillingMode) => void
  supportsModelCapabilityFilter?: boolean
  modelCapabilityMetadataCoverage?: ModelCapabilityMetadataCoverage
  selectedModelCapabilities?: ModelCapabilitySelectionValue[]
  setSelectedModelCapabilities?: (
    capabilities: ModelCapabilitySelectionValue[],
  ) => void
  selectedGroups: string[]
  setSelectedGroups: (groups: string[]) => void
  availableGroups: string[]
  singleSourceGroupDisplayNames?: Readonly<Record<string, string>>
  singleSourceGroupRatios: Record<string, number>
  showRealPrice: boolean
  setShowRealPrice: (show: boolean) => void
  showEndpointTypes: boolean
  setShowEndpointTypes: (show: boolean) => void
  totalModels: number
  filteredModels: any[]
  getFilteredResultCount?: (filters: {
    searchTerm?: string
    sortMode?: ModelListSortMode
    selectedBillingMode?: ModelListBillingMode
    selectedModelCapabilities?: ModelCapabilitySelectionValue[]
    selectedGroups?: string[]
    selectedVerificationResults?: ModelListVerificationResultFilter[]
  }) => number
  onBatchVerifyModels?: () => void
}
