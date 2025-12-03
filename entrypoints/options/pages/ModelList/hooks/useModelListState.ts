import { useState } from "react"

import type { ProviderType } from "~/utils/modelProviders"

export function useModelListState() {
  // 状态管理
  const [selectedAccount, setSelectedAccount] = useState<string>("") // 当前选中的账号ID
  const [searchTerm, setSearchTerm] = useState("") // 搜索关键词
  const [selectedProvider, setSelectedProvider] = useState<
    ProviderType | "all"
  >("all") // 当前选中的模型提供商
  const [selectedGroup, setSelectedGroup] = useState<string>("default") // 当前选中的用户分组

  // 显示选项
  const [showRealPrice, setShowRealPrice] = useState(false) // 是否显示真实价格
  const [showRatioColumn, setShowRatioColumn] = useState(true) // 是否显示倍率列
  const [showEndpointTypes, setShowEndpointTypes] = useState(true) // 是否显示端点类型

  return {
    selectedAccount,
    setSelectedAccount,
    searchTerm,
    setSearchTerm,
    selectedProvider,
    setSelectedProvider,
    selectedGroup,
    setSelectedGroup,
    showRealPrice,
    setShowRealPrice,
    showRatioColumn,
    setShowRatioColumn,
    showEndpointTypes,
    setShowEndpointTypes,
  }
}
