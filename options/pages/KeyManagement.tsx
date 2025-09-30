import {
  DocumentDuplicateIcon,
  EyeIcon,
  EyeSlashIcon,
  KeyIcon,
  MagnifyingGlassIcon,
  PencilIcon,
  PlusIcon,
  TrashIcon
} from "@heroicons/react/24/outline"
import { useEffect, useState } from "react"
import toast from "react-hot-toast"

import AddTokenDialog from "../../components/AddTokenDialog"
import { useAccountData } from "../../hooks/useAccountData"
import { deleteApiToken, fetchAccountTokens } from "../../services/apiService"
import type { ApiToken } from "../../types"

export default function KeyManagement({
  routeParams
}: {
  routeParams?: Record<string, string>
}) {
  const { displayData } = useAccountData()
  const [selectedAccount, setSelectedAccount] = useState<string>("") // 改为空字符串，不默认选择
  const [searchTerm, setSearchTerm] = useState("")
  const [tokens, setTokens] = useState<(ApiToken & { accountName: string })[]>(
    []
  )
  const [isLoading, setIsLoading] = useState(false)
  const [visibleKeys, setVisibleKeys] = useState<Set<number>>(new Set())
  const [isAddTokenOpen, setIsAddTokenOpen] = useState(false)
  const [editingToken, setEditingToken] = useState<
    (ApiToken & { accountName: string }) | null
  >(null)

  // 加载选中账号的密钥
  const loadTokens = async (accountId?: string) => {
    const targetAccountId = accountId || selectedAccount
    if (!targetAccountId || displayData.length === 0) return

    setIsLoading(true)
    try {
      // 只加载选中账号的密钥
      const account = displayData.find((acc) => acc.id === targetAccountId)
      if (!account) {
        setTokens([])
        return
      }

      const accountTokens = await fetchAccountTokens(
        account.baseUrl,
        account.userId,
        account.token
      )

      const tokensWithAccount = accountTokens.map((token) => ({
        ...token,
        accountName: account.name
      }))

      setTokens(tokensWithAccount)
    } catch (error) {
      console.error(`获取账号密钥失败:`, error)
      toast.error("加载密钥列表失败")
      setTokens([])
    } finally {
      setIsLoading(false)
    }
  }

  // 账号选择变化时加载密钥
  useEffect(() => {
    if (selectedAccount) {
      loadTokens()
    } else {
      setTokens([]) // 清空密钥列表
    }
  }, [selectedAccount, displayData])

  // 处理路由参数中的账号ID
  useEffect(() => {
    if (routeParams?.accountId && displayData.length > 0) {
      // 验证账号ID是否存在
      const accountExists = displayData.some(
        (acc) => acc.id === routeParams.accountId
      )
      if (accountExists) {
        setSelectedAccount(routeParams.accountId)
      }
    }
  }, [routeParams?.accountId, displayData])

  // 过滤密钥 (现在只需要搜索过滤，因为已经只加载选中账号的密钥)
  const filteredTokens = tokens.filter((token) => {
    return (
      token.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      token.key.toLowerCase().includes(searchTerm.toLowerCase())
    )
  })

  // 复制密钥
  const copyKey = async (key: string, name: string) => {
    try {
      const textToCopy = key.startsWith("sk-") ? key : "sk-" + key
      await navigator.clipboard.writeText(textToCopy)
      toast.success(`密钥 ${name} 已复制到剪贴板`)
    } catch (error) {
      toast.error("复制失败")
    }
  }

  // 切换密钥可见性
  const toggleKeyVisibility = (tokenId: number) => {
    setVisibleKeys((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(tokenId)) {
        newSet.delete(tokenId)
      } else {
        newSet.add(tokenId)
      }
      return newSet
    })
  }

  // 处理添加密钥
  const handleAddToken = () => {
    setIsAddTokenOpen(true)
  }

  // 关闭添加密钥对话框
  const handleCloseAddToken = () => {
    setIsAddTokenOpen(false)
    setEditingToken(null) // 清除编辑状态
    // 重新加载当前选中账号的密钥列表
    if (selectedAccount) {
      loadTokens()
    }
  }

  // 处理编辑密钥
  const handleEditToken = (token: ApiToken & { accountName: string }) => {
    setEditingToken(token)
    setIsAddTokenOpen(true)
  }

  // 处理删除密钥
  const handleDeleteToken = async (
    token: ApiToken & { accountName: string }
  ) => {
    if (
      !window.confirm(`确定要删除密钥 "${token.name}" 吗？此操作不可撤销。`)
    ) {
      return
    }

    try {
      // 找到对应的账号信息
      const account = displayData.find((acc) => acc.name === token.accountName)
      if (!account) {
        toast.error("找不到对应账号信息")
        return
      }

      await deleteApiToken(
        account.baseUrl,
        account.userId,
        account.token,
        token.id
      )
      toast.success(`密钥 "${token.name}" 删除成功`)

      // 重新加载当前选中账号的密钥列表
      if (selectedAccount) {
        loadTokens()
      }
    } catch (error) {
      console.error("删除密钥失败:", error)
      toast.error("删除密钥失败，请稍后重试")
    }
  }

  // 格式化密钥显示
  const formatKey = (key: string, tokenId: number) => {
    if (visibleKeys.has(tokenId)) {
      return key
    }
    return `${key.substring(0, 8)}${"*".repeat(16)}${key.substring(key.length - 4)}`
  }

  // 格式化时间
  const formatTime = (timestamp: number) => {
    if (timestamp <= 0) return "永不过期"
    return new Date(timestamp * 1000).toLocaleDateString("zh-CN")
  }

  // 格式化额度
  const formatQuota = (quota: number, unlimited: boolean) => {
    if (unlimited || quota < 0) return "无限额度"
    return `$${(quota / 500000).toFixed(2)}`
  }

  return (
    <div className="p-6">
      {/* 页面标题 */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center space-x-3">
            <KeyIcon className="w-6 h-6 text-blue-600" />
            <h1 className="text-2xl font-semibold text-gray-900">密钥管理</h1>
          </div>
          <div className="flex items-center space-x-3">
            <button
              onClick={handleAddToken}
              disabled={!selectedAccount || displayData.length === 0}
              className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2">
              <PlusIcon className="w-4 h-4" />
              <span>添加密钥</span>
            </button>
            <button
              onClick={() => selectedAccount && loadTokens()}
              disabled={isLoading || !selectedAccount}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors disabled:opacity-50">
              {isLoading ? "刷新中..." : "刷新列表"}
            </button>
          </div>
        </div>
        <p className="text-gray-500">选择账号后查看和管理该账号的API密钥</p>
      </div>

      {/* 账号选择和搜索 */}
      <div className="mb-6 space-y-4">
        {/* 账号选择 */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            选择账号
          </label>
          <select
            value={selectedAccount}
            onChange={(e) => setSelectedAccount(e.target.value)}
            className="w-full sm:w-80 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent">
            <option value="">请选择账号</option>
            {displayData.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </select>
        </div>

        {/* 搜索框 */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1 relative">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="搜索密钥名称..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              disabled={!selectedAccount}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
            />
          </div>
        </div>

        {/* 统计信息 */}
        {selectedAccount && (
          <div className="flex items-center space-x-6 text-sm text-gray-500">
            <span>总计 {tokens.length} 个密钥</span>
            <span>启用 {tokens.filter((t) => t.status === 1).length} 个</span>
            <span>显示 {filteredTokens.length} 个</span>
          </div>
        )}
      </div>

      {/* 密钥列表 */}
      {!selectedAccount ? (
        <div className="text-center py-12">
          <KeyIcon className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500">请先选择一个账号查看密钥列表</p>
        </div>
      ) : isLoading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div
              key={i}
              className="border border-gray-200 rounded-lg p-4 animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-1/4 mb-2"></div>
              <div className="h-3 bg-gray-200 rounded w-1/2 mb-2"></div>
              <div className="h-3 bg-gray-200 rounded w-3/4"></div>
            </div>
          ))}
        </div>
      ) : filteredTokens.length === 0 ? (
        <div className="text-center py-12">
          <KeyIcon className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500 mb-4">
            {tokens.length === 0 ? "暂无密钥数据" : "没有找到匹配的密钥"}
          </p>
          {displayData.length === 0 ? (
            <p className="text-sm text-gray-400">请先添加账号</p>
          ) : tokens.length === 0 ? (
            <button
              onClick={handleAddToken}
              className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 transition-colors flex items-center space-x-2 mx-auto">
              <PlusIcon className="w-4 h-4" />
              <span>创建第一个密钥</span>
            </button>
          ) : null}
        </div>
      ) : (
        <div className="space-y-3">
          {filteredTokens.map((token) => (
            <div
              key={`${token.accountName}-${token.id}`}
              className="border border-gray-200 rounded-lg p-4 hover:border-gray-300 transition-colors">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  {/* 密钥名称和状态 */}
                  <div className="flex items-center space-x-3 mb-2">
                    <h3 className="text-lg font-medium text-gray-900 truncate">
                      {token.name}
                    </h3>
                    <span
                      className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                        token.status === 1
                          ? "bg-green-100 text-green-800"
                          : "bg-red-100 text-red-800"
                      }`}>
                      {token.status === 1 ? "启用" : "禁用"}
                    </span>
                    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                      {token.accountName}
                    </span>
                  </div>

                  {/* 密钥信息 */}
                  <div className="space-y-2 text-sm text-gray-600">
                    <div className="flex items-center space-x-4">
                      <div className="flex items-center space-x-2">
                        <span className="text-gray-500">密钥:</span>
                        <code className="bg-gray-100 px-2 py-1 rounded font-mono text-xs">
                          {formatKey(token.key, token.id)}
                        </code>
                        <button
                          onClick={() => toggleKeyVisibility(token.id)}
                          className="p-1 text-gray-400 hover:text-gray-600">
                          {visibleKeys.has(token.id) ? (
                            <EyeSlashIcon className="w-4 h-4" />
                          ) : (
                            <EyeIcon className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                      <div>
                        <span className="text-gray-500">剩余额度:</span>
                        <span className="ml-2 font-medium">
                          {formatQuota(
                            token.remain_quota,
                            token.unlimited_quota
                          )}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-500">已用额度:</span>
                        <span className="ml-2 font-medium">
                          {formatQuota(token.used_quota, false)}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-500">过期时间:</span>
                        <span className="ml-2 font-medium">
                          {formatTime(token.expired_time)}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-500">创建时间:</span>
                        <span className="ml-2 font-medium">
                          {formatTime(token.created_time)}
                        </span>
                      </div>
                    </div>

                    {token.group && (
                      <div>
                        <span className="text-gray-500">分组:</span>
                        <span className="ml-2 font-medium">{token.group}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* 操作按钮 */}
                <div className="flex items-center space-x-2 ml-4">
                  <button
                    onClick={() => copyKey(token.key, token.name)}
                    className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                    title="复制密钥">
                    <DocumentDuplicateIcon className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleEditToken(token)}
                    className="p-2 text-blue-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                    title="编辑密钥">
                    <PencilIcon className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDeleteToken(token)}
                    className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    title="删除密钥">
                    <TrashIcon className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 说明文字 */}
      <div className="mt-8 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
        <div className="flex items-start space-x-3">
          <KeyIcon className="w-5 h-5 text-yellow-600 mt-0.5 flex-shrink-0" />
          <div className="text-sm">
            <p className="text-yellow-800 font-medium mb-1">密钥管理说明</p>
            <p className="text-yellow-700">
              此页面显示所有账号的API密钥信息，包括使用情况和过期时间。
              可以通过右上角的"添加密钥"按钮或点击各密钥项目旁的"+"按钮为指定账号创建新密钥。
              请妥善保管您的API密钥，避免泄露给他人。
            </p>
          </div>
        </div>
      </div>

      {/* 添加密钥对话框 */}
      <AddTokenDialog
        isOpen={isAddTokenOpen}
        onClose={handleCloseAddToken}
        availableAccounts={displayData.map((account) => ({
          id: account.id,
          name: account.name,
          baseUrl: account.baseUrl,
          userId: account.userId,
          token: account.token
        }))}
        preSelectedAccountId={selectedAccount || null}
        editingToken={editingToken}
      />
    </div>
  )
}
