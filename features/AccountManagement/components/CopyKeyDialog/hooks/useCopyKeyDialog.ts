import { useCallback, useEffect, useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

import { fetchAccountTokens } from "~/services/apiService"
import type { ApiToken, DisplaySiteData } from "~/types"

function getErrorMessage(error: any): string {
  if (error instanceof Error) {
    return error.message
  }
  if (typeof error === "string") {
    return error
  }
  return JSON.stringify(error)
}

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
      const tokensResponse = await fetchAccountTokens(account)
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
