import { useCallback, useEffect, useMemo, useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

import { SUB2API } from "~/constants/siteType"
import { generateDefaultTokenRequest } from "~/services/accounts/accountKeyAutoProvisioning/ensureDefaultToken"
import { getApiService } from "~/services/apiService"
import { AuthTypeEnum, type ApiToken, type DisplaySiteData } from "~/types"
import { getErrorMessage } from "~/utils/error"
import { createLogger } from "~/utils/logger"
import { isTokenCompatibleWithModel } from "~/utils/tokenModelCompatibility"

/**
 * Logger scoped to the "model key" dialog so token loading and clipboard failures can be diagnosed safely.
 */
const logger = createLogger("ModelKeyDialogHook")

/**
 * Input params for `useModelKeyDialog`.
 */
type UseModelKeyDialogParams = {
  isOpen: boolean
  account: DisplaySiteData | null
  modelId: string
  modelEnableGroups: string[]
}

/**
 * Dialog state + actions for the model→key compatibility flow.
 */
export function useModelKeyDialog(params: UseModelKeyDialogParams) {
  const { isOpen, account, modelId, modelEnableGroups } = params
  const { t } = useTranslation(["modelList", "common"])

  const [tokens, setTokens] = useState<ApiToken[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [selectedTokenId, setSelectedTokenId] = useState<number | null>(null)

  const [isCreating, setIsCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  const canCreateToken = useMemo(() => {
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

  const ineligibleDescription = useMemo(() => {
    if (!account) return null
    if (canCreateToken) return null
    if (account.disabled === true)
      return t("modelList:keyDialog.ineligible.accountDisabled")
    if (account.siteType === SUB2API)
      return t("modelList:keyDialog.ineligible.siteNotSupported")
    if (account.authType === AuthTypeEnum.None)
      return t("modelList:keyDialog.ineligible.missingAuth")
    return t("modelList:keyDialog.ineligible.missingCredentials")
  }, [account, canCreateToken, t])

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
      const errorMessage = getErrorMessage(error)
      logger.error("Failed to load token list for model key dialog", {
        message: errorMessage,
        accountId: account.id,
        baseUrl: account.baseUrl,
        siteType: account.siteType,
      })
      setError(t("modelList:keyDialog.loadFailed", { error: errorMessage }))
    } finally {
      setIsLoading(false)
    }
  }, [account, t])

  const modelContext = useMemo(
    () => ({ id: modelId, enableGroups: modelEnableGroups }),
    [modelEnableGroups, modelId],
  )

  const compatibleTokens = useMemo(
    () =>
      tokens.filter((token) => isTokenCompatibleWithModel(token, modelContext)),
    [modelContext, tokens],
  )

  useEffect(() => {
    if (!isOpen || !account) {
      setTokens([])
      setIsLoading(false)
      setError(null)
      setSelectedTokenId(null)
      setIsCreating(false)
      setCreateError(null)
      return
    }

    fetchTokens()
  }, [account, fetchTokens, isOpen])

  useEffect(() => {
    if (!isOpen) return

    setSelectedTokenId((prev) => {
      if (
        prev !== null &&
        compatibleTokens.some((token) => token.id === prev)
      ) {
        return prev
      }

      if (compatibleTokens.length === 1) {
        return compatibleTokens[0].id
      }

      return null
    })
  }, [compatibleTokens, isOpen])

  const selectedToken = useMemo(
    () =>
      selectedTokenId !== null
        ? compatibleTokens.find((token) => token.id === selectedTokenId) ?? null
        : null,
    [compatibleTokens, selectedTokenId],
  )

  const copySelectedKey = useCallback(async () => {
    if (!selectedToken) return

    try {
      await navigator.clipboard.writeText(selectedToken.key)
      toast.success(t("modelList:keyDialog.keyCopied"))
    } catch (error) {
      const errorMessage = getErrorMessage(error)
      logger.error("Failed to copy key to clipboard from model key dialog", {
        message: errorMessage,
      })
      toast.error(t("modelList:keyDialog.copyFailed"))
    }
  }, [selectedToken, t])

  const refreshTokensAfterCreate = useCallback(async () => {
    if (!account) return

    if (!canCreateToken) {
      setCreateError(t("modelList:keyDialog.createNotSupported"))
      return
    }

    setCreateError(null)
    setIsLoading(true)

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

      const refreshedCompatible = refreshedTokens.filter((token) =>
        isTokenCompatibleWithModel(token, modelContext),
      )

      if (refreshedCompatible.length === 0) {
        setCreateError(
          t("modelList:keyDialog.noCompatibleFoundAfterCreate", { modelId }),
        )
        return
      }

      toast.success(t("modelList:keyDialog.createSuccess"))
    } catch (error) {
      const errorMessage = getErrorMessage(error)
      logger.error(
        "Failed to refresh token list after create (model key dialog)",
        {
          message: errorMessage,
          accountId: account.id,
          baseUrl: account.baseUrl,
          siteType: account.siteType,
        },
      )
      setCreateError(
        t("modelList:keyDialog.createFailed", { error: errorMessage }),
      )
    } finally {
      setIsLoading(false)
    }
  }, [account, canCreateToken, modelContext, modelId, t])

  const createDefaultKey = useCallback(
    async (group: string) => {
      if (!account) return

      if (!canCreateToken) {
        setCreateError(t("modelList:keyDialog.createNotSupported"))
        return
      }

      if (isCreating) return

      const normalizedGroup = typeof group === "string" ? group.trim() : ""
      if (!normalizedGroup) {
        setCreateError(t("modelList:keyDialog.createGroupRequired"))
        return
      }

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
        tokenRequest.group = normalizedGroup
        const created = await service.createApiToken(request, tokenRequest)
        if (!created) {
          throw new Error("create_token_failed")
        }

        await refreshTokensAfterCreate()
      } catch (error) {
        const errorMessage = getErrorMessage(error)
        logger.error("Failed to create default token (model key dialog)", {
          message: errorMessage,
          accountId: account.id,
          baseUrl: account.baseUrl,
          siteType: account.siteType,
        })
        setCreateError(
          t("modelList:keyDialog.createFailed", { error: errorMessage }),
        )
      } finally {
        setIsCreating(false)
      }
    },
    [account, canCreateToken, isCreating, refreshTokensAfterCreate, t],
  )

  return {
    tokens,
    compatibleTokens,
    isLoading,
    error,
    selectedTokenId,
    setSelectedTokenId,
    selectedToken,
    canCreateToken,
    ineligibleDescription,
    isCreating,
    createError,
    fetchTokens,
    copySelectedKey,
    createDefaultKey,
    refreshTokensAfterCreate,
  }
}
