import { useState } from "react"

import {
  MODEL_LIST_SORT_MODES,
  type ModelListSortMode,
} from "~/features/ModelList/sortModes"
import type { ProviderType } from "~/services/models/utils/modelProviders"

/**
 * Manages view state for the model list page.
 * Keeps selected account, provider, group, search term, and display toggles.
 * @returns State values and setters for model list controls.
 */
export function useModelListState() {
  // 状态管理
  const [selectedSourceValue, setSelectedSourceValue] = useState("") // 当前选中的数据源
  const [searchTerm, setSearchTerm] = useState("") // 搜索关键词
  const [selectedProvider, setSelectedProvider] = useState<
    ProviderType | "all"
  >("all") // 当前选中的模型提供商
  const [sortMode, setSortMode] = useState<ModelListSortMode>(
    MODEL_LIST_SORT_MODES.DEFAULT,
  )
  const [selectedGroup, setSelectedGroup] = useState<string>("default") // 当前选中的用户分组
  const [allAccountsFilterAccountId, setAllAccountsFilterAccountId] = useState<
    string | null
  >(null) // 在"所有账号"模式下用于临时筛选特定账号

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
    sortMode,
    setSortMode,
    selectedGroup,
    setSelectedGroup,
    allAccountsFilterAccountId,
    setAllAccountsFilterAccountId,
    showRealPrice,
    setShowRealPrice,
    showRatioColumn,
    setShowRatioColumn,
    showEndpointTypes,
    setShowEndpointTypes,
  }
}
