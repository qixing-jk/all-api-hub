import { useCallback, useEffect, useMemo, useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

import { SUB2API } from "~/constants/siteType"
import { generateDefaultTokenRequest } from "~/services/accounts/accountKeyAutoProvisioning/ensureDefaultToken"
import { getApiService } from "~/services/apiService"
import { AuthTypeEnum, type ApiToken, type DisplaySiteData } from "~/types"
import { getErrorMessage } from "~/utils/error"
import { createLogger } from "~/utils/logger"

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
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [expandedTokens, setExpandedTokens] = useState<Set<number>>(new Set())

  const canCreateDefaultKey = useMemo(() => {
    if (!account) return false

    if (account.disabled === true) {
      return false
    }

    if (account.siteType === SUB2API) {
      return false
    }

    if (account.authType === AuthTypeEnum.None) {
      return false
    }

    const hasToken = typeof account.token === "string" && account.token.trim()
    const hasCookie =
      typeof account.cookieAuthSessionCookie === "string" &&
      account.cookieAuthSessionCookie.trim()

    if (
      typeof account.id !== "string" ||
      account.id.trim().length === 0 ||
      typeof account.baseUrl !== "string" ||
      account.baseUrl.trim().length === 0 ||
      typeof account.siteType !== "string" ||
      account.siteType.trim().length === 0 ||
      !Number.isFinite(account.userId) ||
      (account.authType === AuthTypeEnum.AccessToken && !hasToken) ||
      (account.authType === AuthTypeEnum.Cookie && !hasToken && !hasCookie)
    ) {
      return false
    }

    return true
  }, [account])

  const fetchTokens = useCallback(async () => {
    if (!account) return

    setIsLoading(true)
    setError(null)
    setCreateError(null)

    try {
      const tokensResponse = await getApiService(
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
      setTokens([])
      setError(null)
      setIsCreating(false)
      setCreateError(null)
      setCopiedKey(null)
      setExpandedTokens(new Set())
    }
  }, [isOpen, account, fetchTokens])

  const copyKey = useCallback(
    async (key: string) => {
      try {
        await navigator.clipboard.writeText(key)
        setCopiedKey(key)
        toast.success(t("ui:dialog.copyKey.keyCopied"))

        setTimeout(() => {
          setCopiedKey(null)
        }, 2000)
      } catch (error) {
        logger.error("Failed to copy key to clipboard", { error })
        toast.error(t("ui:dialog.copyKey.copyFailedManual"))
      }
    },
    [t],
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
      const service = getApiService(account.siteType)
      const request = {
        baseUrl: account.baseUrl,
        accountId: account.id,
        auth: {
          authType: account.authType,
          userId: account.userId,
          accessToken: account.token,
          cookie: account.cookieAuthSessionCookie,
        },
      }

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
        await copyKey(refreshedTokens[0].key)
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
      const service = getApiService(account.siteType)
      const request = {
        baseUrl: account.baseUrl,
        accountId: account.id,
        auth: {
          authType: account.authType,
          userId: account.userId,
          accessToken: account.token,
          cookie: account.cookieAuthSessionCookie,
        },
      }

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
    copiedKey,
    expandedTokens,
    canCreateDefaultKey,
    fetchTokens,
    copyKey,
    createDefaultKey,
    refreshTokensAfterCreate,
    toggleTokenExpansion,
  }
}
