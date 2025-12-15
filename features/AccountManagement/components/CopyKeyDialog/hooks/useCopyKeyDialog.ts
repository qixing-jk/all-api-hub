import { useCallback, useEffect, useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

import { getApiService } from "~/services/apiService"
import type { ApiToken, DisplaySiteData } from "~/types"

/**
 * 将未知错误对象转换为字符串消息，方便展示。
 * @param error 任意异常或消息对象
 * @returns 可读的错误文本
 */
function getErrorMessage(error: any): string {
  if (error instanceof Error) {
    return error.message
  }
  if (typeof error === "string") {
    return error
  }
  return JSON.stringify(error)
}

/**
 * CopyKeyDialog 核心逻辑 hook，负责加载 token、处理复制与展开状态。
 * @param isOpen 对话框是否打开
 * @param account 当前账号
 * @returns token 数据、加载状态、错误以及相关操作方法
 */
export function useCopyKeyDialog(isOpen: boolean, account: DisplaySiteData) {
  const { t } = useTranslation(["ui", "messages"])
  const [tokens, setTokens] = useState<ApiToken[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [expandedTokens, setExpandedTokens] = useState<Set<number>>(new Set())
  const fetchTokens = useCallback(async () => {
    if (!account) return

    setIsLoading(true)
    setError(null)

    try {
      const tokensResponse = await getApiService(account.siteType).fetchAccountTokens(
        account,
      )
      if (Array.isArray(tokensResponse)) {
        setTokens(tokensResponse)
      } else {
        console.warn("Token response is not an array:", tokensResponse)
        setTokens([])
      }
    } catch (error) {
      console.error("获取密钥列表失败:", error)
      const errorMessage = getErrorMessage(error)
      setError(t("ui:dialog.copyKey.loadFailed", { error: errorMessage }))
    } finally {
      setIsLoading(false)
    }
  }, [account, t])

  useEffect(() => {
    if (isOpen && account) {
      fetchTokens()
    } else {
      setTokens([])
      setError(null)
      setCopiedKey(null)
      setExpandedTokens(new Set())
    }
  }, [isOpen, account, fetchTokens])

  const copyKey = async (key: string) => {
    try {
      const textToCopy = key.startsWith("sk-") ? key : "sk-" + key
      await navigator.clipboard.writeText(textToCopy)
      setCopiedKey(key)
      toast.success(t("ui:dialog.copyKey.keyCopied"))

      setTimeout(() => {
        setCopiedKey(null)
      }, 2000)
    } catch (error) {
      console.error("复制失败:", error)
      toast.error(t("ui:dialog.copyKey.copyFailedManual"))
    }
  }

  const toggleTokenExpansion = (tokenId: number) => {
    setExpandedTokens((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(tokenId)) {
        newSet.delete(tokenId)
      } else {
        newSet.add(tokenId)
      }
      return newSet
    })
  }

  return {
    tokens,
    isLoading,
    error,
    copiedKey,
    expandedTokens,
    fetchTokens,
    copyKey,
    toggleTokenExpansion,
  }
}
