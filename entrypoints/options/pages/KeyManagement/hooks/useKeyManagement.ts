import { useEffect, useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

import { useAccountData } from "~/hooks/useAccountData"
import { deleteApiToken, fetchAccountTokens } from "~/services/apiService"

import { AccountToken } from "../type.ts"

export function useKeyManagement(routeParams?: Record<string, string>) {
  const { t } = useTranslation(["keyManagement", "messages"])
  const { displayData } = useAccountData()
  const [selectedAccount, setSelectedAccount] = useState<string>("")
  const [searchTerm, setSearchTerm] = useState("")
  const [tokens, setTokens] = useState<AccountToken[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [visibleKeys, setVisibleKeys] = useState<Set<number>>(new Set())
  const [isAddTokenOpen, setIsAddTokenOpen] = useState(false)
  const [editingToken, setEditingToken] = useState<AccountToken | null>(null)

  const loadTokens = async (accountId?: string) => {
    const targetAccountId = accountId || selectedAccount
    if (!targetAccountId || displayData.length === 0) return

    setIsLoading(true)
    try {
      const account = displayData.find((acc) => acc.id === targetAccountId)
      if (!account) {
        setTokens([])
        return
      }

      const accountTokens = await fetchAccountTokens(account)

      const tokensWithAccount = accountTokens.map((token) => ({
        ...token,
        accountName: account.name
      }))

      setTokens(tokensWithAccount)
    } catch (error) {
      console.error(`获取账号密钥失败:`, error)
      toast.error(t("keyManagement:messages.loadFailed"))
      setTokens([])
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (selectedAccount) {
      loadTokens()
    } else {
      setTokens([])
    }
  }, [selectedAccount, displayData])

  useEffect(() => {
    if (routeParams?.accountId && displayData.length > 0) {
      const accountExists = displayData.some(
        (acc) => acc.id === routeParams.accountId
      )
      if (accountExists) {
        setSelectedAccount(routeParams.accountId)
      }
    }
  }, [routeParams?.accountId, displayData])

  const filteredTokens = tokens.filter((token) => {
    return (
      token.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      token.key.toLowerCase().includes(searchTerm.toLowerCase())
    )
  })

  const copyKey = async (key: string, name: string) => {
    try {
      const textToCopy = key.startsWith("sk-") ? key : "sk-" + key
      await navigator.clipboard.writeText(textToCopy)
      toast.success(t("keyManagement:messages.keyCopied", { name }))
    } catch (error) {
      toast.error(t("keyManagement:messages.copyFailed"))
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
        t("keyManagement:messages.deleteConfirm", { name: token.name })
      )
    ) {
      return
    }

    try {
      const account = displayData.find((acc) => acc.name === token.accountName)
      if (!account) {
        toast.error(t("keyManagement:messages.accountNotFound"))
        return
      }

      await deleteApiToken(
        account.baseUrl,
        account.userId,
        account.token,
        token.id
      )
      toast.success(
        t("keyManagement:messages.deleteSuccess", { name: token.name })
      )

      if (selectedAccount) {
        loadTokens()
      }
    } catch (error) {
      console.error("删除密钥失败:", error)
      toast.error(t("keyManagement:messages.deleteFailed"))
    }
  }

  return {
    displayData,
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
    handleDeleteToken
  }
}
