import { useCallback, useEffect, useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

import { useAccountData } from "~/hooks/useAccountData"
import { getApiService } from "~/services/apiService"
import { createLogger } from "~/utils/logger"

import { AccountToken } from "../type"

/**
 * Unified logger scoped to the Key Management options page hooks.
 */
const logger = createLogger("KeyManagementHook")

/**
 * Manages key management page state: selection, loading, filtering, and CRUD handlers.
 * @param routeParams Optional route params containing preselected accountId.
 * @returns State, derived data, and handlers for token management UI.
 */
export function useKeyManagement(routeParams?: Record<string, string>) {
  const { t } = useTranslation(["keyManagement", "messages"])
  const { enabledDisplayData } = useAccountData()
  const [selectedAccount, setSelectedAccount] = useState<string>("")
  const [searchTerm, setSearchTerm] = useState("")
  const [tokens, setTokens] = useState<AccountToken[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [visibleKeys, setVisibleKeys] = useState<Set<number>>(new Set())
  const [isAddTokenOpen, setIsAddTokenOpen] = useState(false)
  const [editingToken, setEditingToken] = useState<AccountToken | null>(null)

  const loadTokens = useCallback(
    async (accountId?: string) => {
      const targetAccountId = accountId || selectedAccount
      if (!targetAccountId || enabledDisplayData.length === 0) return

      setIsLoading(true)
      try {
        const account = enabledDisplayData.find(
          (acc) => acc.id === targetAccountId,
        )
        if (!account) {
          setTokens([])
          return
        }

        const accountTokens = await getApiService(
          account.siteType,
        ).fetchAccountTokens({
          baseUrl: account.baseUrl,
          accountId: account.id,
          auth: {
            authType: account.authType,
            userId: account.userId,
            accessToken: account.token,
            cookie: account.cookieAuthSessionCookie,
          },
        })

        const tokensWithAccount = accountTokens.map((token) => ({
          ...token,
          accountName: account.name,
        }))

        setTokens(tokensWithAccount)
      } catch (error) {
        logger.error("获取账号密钥失败", error)
        toast.error(t("keyManagement:messages.loadFailed"))
        setTokens([])
      } finally {
        setIsLoading(false)
      }
    },
    [selectedAccount, enabledDisplayData, t],
  )

  useEffect(() => {
    if (selectedAccount) {
      loadTokens()
    } else {
      setTokens([])
    }
  }, [selectedAccount, enabledDisplayData, loadTokens])

  useEffect(() => {
    if (!selectedAccount) return

    const accountExists = enabledDisplayData.some(
      (account) => account.id === selectedAccount,
    )
    if (!accountExists) {
      setSelectedAccount("")
    }
  }, [selectedAccount, enabledDisplayData])

  useEffect(() => {
    if (routeParams?.accountId && enabledDisplayData.length > 0) {
      const accountExists = enabledDisplayData.some(
        (acc) => acc.id === routeParams.accountId,
      )
      if (accountExists) {
        setSelectedAccount(routeParams.accountId)
      }
    }
  }, [routeParams?.accountId, enabledDisplayData])

  const filteredTokens = tokens.filter((token) => {
    return (
      token.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      token.key.toLowerCase().includes(searchTerm.toLowerCase())
    )
  })

  const copyKey = async (key: string, name: string) => {
    try {
      await navigator.clipboard.writeText(key)
      toast.success(t("keyManagement:messages.keyCopied", { name }))
    } catch (error) {
      toast.error(t("keyManagement:messages.copyFailed"))
      logger.warn("Failed to copy key to clipboard", error)
    }
  }

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

  const handleAddToken = () => {
    setIsAddTokenOpen(true)
  }

  const handleCloseAddToken = () => {
    setIsAddTokenOpen(false)
    setEditingToken(null)
    if (selectedAccount) {
      loadTokens()
    }
  }

  const handleEditToken = (token: AccountToken) => {
    setEditingToken(token)
    setIsAddTokenOpen(true)
  }

  const handleDeleteToken = async (token: AccountToken) => {
    if (
      !window.confirm(
        t("keyManagement:messages.deleteConfirm", { name: token.name }),
      )
    ) {
      return
    }

    try {
      const account = enabledDisplayData.find(
        (acc) => acc.name === token.accountName,
      )
      if (!account) {
        toast.error(t("keyManagement:messages.accountNotFound"))
        return
      }

      await getApiService(account.siteType).deleteApiToken(
        {
          baseUrl: account.baseUrl,
          accountId: account.id,
          auth: {
            authType: account.authType,
            userId: account.userId,
            accessToken: account.token,
            cookie: account.cookieAuthSessionCookie,
          },
        },
        token.id,
      )
      toast.success(
        t("keyManagement:messages.deleteSuccess", { name: token.name }),
      )

      if (selectedAccount) {
        loadTokens()
      }
    } catch (error) {
      logger.error("删除密钥失败", error)
      toast.error(t("keyManagement:messages.deleteFailed"))
    }
  }

  return {
    displayData: enabledDisplayData,
    selectedAccount,
    setSelectedAccount,
    searchTerm,
    setSearchTerm,
    tokens,
    isLoading,
    visibleKeys,
    isAddTokenOpen,
    editingToken,
    loadTokens,
    filteredTokens,
    copyKey,
    toggleKeyVisibility,
    handleAddToken,
    handleCloseAddToken,
    handleEditToken,
    handleDeleteToken,
  }
}
