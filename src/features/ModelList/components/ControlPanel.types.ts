import { type ModelListBillingMode } from "~/features/ModelList/billingModes"
import {
  type ModelCapabilityMetadataCoverage,
  type ModelCapabilitySelectionValue,
} from "~/features/ModelList/modelCapabilityFilters"
import {
  type ModelManagementSource,
  type ModelManagementSourceCapabilities,
} from "~/features/ModelList/modelManagementSources"
import type { ModelPricingScenarioSettings } from "~/features/ModelList/pricingScenario"
import { type ModelListSortMode } from "~/features/ModelList/sortModes"
import { type ModelListVerificationResultFilter } from "~/features/ModelList/verificationResultFilters"

import {
  type ModelPriceComparisonPresetId,
  type ModelPriceComparisonWeights,
} from "../priceComparison"

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
