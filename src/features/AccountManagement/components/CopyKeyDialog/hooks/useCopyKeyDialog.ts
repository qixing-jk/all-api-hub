import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

import { generateDefaultTokenRequest } from "~/services/accounts/accountKeyAutoProvisioning/ensureDefaultToken"
import {
  canManageDisplayAccountTokens,
  createDisplayAccountApiContext,
  resolveDisplayAccountTokenForSecret,
} from "~/services/accounts/utils/apiServiceRequest"
import type { ApiToken, DisplaySiteData } from "~/types"
import { getErrorMessage } from "~/utils/core/error"
import { createLogger } from "~/utils/core/logger"

/**
 * Logger scoped to the "copy key" dialog so token-loading and clipboard failures can be diagnosed safely.
 */
const logger = createLogger("CopyKeyDialogHook")

/**
 * CopyKeyDialog 核心逻辑 hook，负责加载 token、处理复制与展开状态。
 * @param isOpen 对话框是否打开
 * @param account 当前账号（可能为空）
 * @returns token 数据、加载状态、错误以及相关操作方法
 */
export function useCopyKeyDialog(
  isOpen: boolean,
  account: DisplaySiteData | null,
) {
  const { t } = useTranslation(["ui", "messages"])
  const [tokens, setTokens] = useState<ApiToken[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [copiedTokenId, setCopiedTokenId] = useState<number | null>(null)
  const [expandedTokens, setExpandedTokens] = useState<Set<number>>(new Set())
  const copiedTokenResetTimeoutRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null)

  const canCreateDefaultKey = useMemo(
    () => canManageDisplayAccountTokens(account),
    [account],
  )

  const clearCopiedTokenResetTimeout = useCallback(() => {
    if (copiedTokenResetTimeoutRef.current === null) return

    clearTimeout(copiedTokenResetTimeoutRef.current)
    copiedTokenResetTimeoutRef.current = null
  }, [])

  const fetchTokens = useCallback(async () => {
    if (!account) return

    setIsLoading(true)
    setError(null)
    setCreateError(null)

    try {
      const { service, request } = createDisplayAccountApiContext(account)
      const tokensResponse = await service.fetchAccountTokens(request)
      if (Array.isArray(tokensResponse)) {
        setTokens(tokensResponse)
      } else {
        logger.warn("Token response is not an array", {
          accountId: account.id,
          baseUrl: account.baseUrl,
          responseType: typeof tokensResponse,
          siteType: account.siteType,
        })
        setTokens([])
      }
    } catch (error) {
      logger.error("Failed to load key list", {
        error,
        accountId: account.id,
        baseUrl: account.baseUrl,
        siteType: account.siteType,
      })
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
      clearCopiedTokenResetTimeout()
      setTokens([])
      setError(null)
      setIsCreating(false)
      setCreateError(null)
      setCopiedTokenId(null)
      setExpandedTokens(new Set())
    }
  }, [account, clearCopiedTokenResetTimeout, fetchTokens, isOpen])

  useEffect(() => {
    return () => {
      clearCopiedTokenResetTimeout()
    }
  }, [clearCopiedTokenResetTimeout])

  const copyKey = useCallback(
    async (token: ApiToken) => {
      if (!account) return

      try {
        const resolvedToken = await resolveDisplayAccountTokenForSecret(
          account,
          token,
        )
        await navigator.clipboard.writeText(resolvedToken.key)
        setCopiedTokenId(token.id)
        toast.success(t("ui:dialog.copyKey.keyCopied"))

        clearCopiedTokenResetTimeout()
        copiedTokenResetTimeoutRef.current = setTimeout(() => {
          setCopiedTokenId(null)
          copiedTokenResetTimeoutRef.current = null
        }, 2000)
      } catch (error) {
        logger.error("Failed to copy key to clipboard", { error })
        toast.error(t("ui:dialog.copyKey.copyFailedManual"))
      }
    },
    [account, clearCopiedTokenResetTimeout, t],
  )

  /**
   * Refreshes token inventory after a successful create flow and applies the same UX rules:
   * - If no token is found, show an actionable error.
   * - If exactly one token exists, auto-copy it.
   * - Otherwise, keep the list visible and show a success toast.
   */
  const refreshTokensAfterCreate = useCallback(async () => {
    if (!account) return

    if (!canCreateDefaultKey) {
      setCreateError(t("ui:dialog.copyKey.createNotSupported"))
      return
    }

    setCreateError(null)

    try {
      const { service, request } = createDisplayAccountApiContext(account)
      const refreshedTokens = await service.fetchAccountTokens(request)
      if (!Array.isArray(refreshedTokens)) {
        throw new Error("token_refresh_failed")
      }

      setTokens(refreshedTokens)

      if (refreshedTokens.length === 0) {
        setCreateError(t("ui:dialog.copyKey.noKeyFoundAfterCreate"))
        return
      }

      if (refreshedTokens.length === 1) {
        await copyKey(refreshedTokens[0])
        return
      }

      toast.success(t("ui:dialog.copyKey.createSuccess"))
    } catch (error) {
      logger.error("Failed to refresh token list after create", {
        error,
        accountId: account.id,
        baseUrl: account.baseUrl,
        siteType: account.siteType,
      })
      const errorMessage = getErrorMessage(error)
      setCreateError(
        t("ui:dialog.copyKey.createFailed", { error: errorMessage }),
      )
    }
  }, [account, canCreateDefaultKey, copyKey, t])

  const createDefaultKey = useCallback(async () => {
    if (!account) return

    if (!canCreateDefaultKey) {
      setCreateError(t("ui:dialog.copyKey.createNotSupported"))
      return
    }

    if (isCreating) return

    setIsCreating(true)
    setCreateError(null)

    try {
      const { service, request } = createDisplayAccountApiContext(account)
      const tokenRequest = generateDefaultTokenRequest()
      const created = await service.createApiToken(request, tokenRequest)
      if (!created) {
        throw new Error("create_token_failed")
      }

      await refreshTokensAfterCreate()
    } catch (error) {
      logger.error("Failed to create default key", {
        error,
        accountId: account.id,
        baseUrl: account.baseUrl,
        siteType: account.siteType,
      })
      const errorMessage = getErrorMessage(error)
      setCreateError(
        t("ui:dialog.copyKey.createFailed", { error: errorMessage }),
      )
    } finally {
      setIsCreating(false)
    }
  }, [account, canCreateDefaultKey, isCreating, refreshTokensAfterCreate, t])

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
    isCreating,
    createError,
    copiedTokenId,
    expandedTokens,
    canCreateDefaultKey,
    fetchTokens,
    copyKey,
    createDefaultKey,
    refreshTokensAfterCreate,
    toggleTokenExpansion,
  }
}
