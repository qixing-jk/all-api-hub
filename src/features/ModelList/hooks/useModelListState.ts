import { useState } from "react"

import {
  MODEL_LIST_SORT_MODES,
  type ModelListSortMode,
} from "~/features/ModelList/sortModes"
import {
  DEFAULT_MODEL_LIST_VERIFICATION_RESULT_FILTERS,
  type ModelListVerificationResultFilter,
} from "~/features/ModelList/verificationResultFilters"
import {
  MODEL_VENDOR_FILTER_VALUES,
  type ModelVendorFilterValue,
} from "~/services/models/modelVendor"

import {
  MODEL_LIST_BILLING_MODES,
  type ModelListBillingMode,
} from "../billingModes"
import type { ModelCapabilitySelectionValue } from "../modelCapabilityFilters"

/**
 * Manages view state for the model list page.
 * Keeps selected account, provider, group, search term, and display toggles.
 * @returns State values and setters for model list controls.
 */
export function useModelListState() {
  // 状态管理
  const [selectedSourceValue, setSelectedSourceValue] = useState("") // 当前选中的数据源
  const [searchTerm, setSearchTerm] = useState("") // 搜索关键词
  const [selectedProvider, setSelectedProvider] =
    useState<ModelVendorFilterValue>(MODEL_VENDOR_FILTER_VALUES.All) // 当前选中的模型提供商
  const [selectedModelCapabilities, setSelectedModelCapabilities] = useState<
    ModelCapabilitySelectionValue[]
  >([])
  const [sortMode, setSortMode] = useState<ModelListSortMode>(
    MODEL_LIST_SORT_MODES.DEFAULT,
  )
  const [selectedBillingMode, setSelectedBillingMode] =
    useState<ModelListBillingMode>(MODEL_LIST_BILLING_MODES.ALL)
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]) // 当前选中的候选分组；空数组表示所有分组
  const [
    allAccountsExcludedGroupsByAccountId,
    setAllAccountsExcludedGroupsByAccountId,
  ] = useState<Record<string, string[]>>({}) // "所有账号"模式下按账号排除的分组；空对象表示所有账号都保留全部可用分组
  const [allAccountsFilterAccountIds, setAllAccountsFilterAccountIds] =
    useState<string[]>([]) // 在"所有账号"模式下用于临时筛选一个或多个账号
  const [selectedVerificationResults, setSelectedVerificationResults] =
    useState<ModelListVerificationResultFilter[]>(
      DEFAULT_MODEL_LIST_VERIFICATION_RESULT_FILTERS,
    )

  // 显示选项
  const [showRealPrice, setShowRealPrice] = useState(false) // 是否显示真实价格
  const [showRatioColumn, setShowRatioColumn] = useState(true) // 是否显示倍率列
  const [showEndpointTypes, setShowEndpointTypes] = useState(true) // 是否显示端点类型

  return {
    selectedSourceValue,
    setSelectedSourceValue,
    searchTerm,
    setSearchTerm,
    selectedProvider,
    setSelectedProvider,
    selectedModelCapabilities,
    setSelectedModelCapabilities,
    sortMode,
    setSortMode,
    selectedBillingMode,
    setSelectedBillingMode,
    selectedGroups,
    setSelectedGroups,
    allAccountsExcludedGroupsByAccountId,
    setAllAccountsExcludedGroupsByAccountId,
    allAccountsFilterAccountIds,
    setAllAccountsFilterAccountIds,
    selectedVerificationResults,
    setSelectedVerificationResults,
    showRealPrice,
    setShowRealPrice,
    showRatioColumn,
    setShowRatioColumn,
    showEndpointTypes,
    setShowEndpointTypes,
  }
}
