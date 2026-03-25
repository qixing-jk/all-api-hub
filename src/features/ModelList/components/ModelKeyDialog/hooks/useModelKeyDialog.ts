import { useCallback, useEffect, useMemo, useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

import { generateDefaultTokenRequest } from "~/services/accounts/accountKeyAutoProvisioning/ensureDefaultToken"
import {
  canManageDisplayAccountTokens,
  createDisplayAccountApiContext,
  fetchDisplayAccountTokens,
  InvalidTokenPayloadError,
  resolveDisplayAccountTokenForSecret,
} from "~/services/accounts/utils/apiServiceRequest"
import { isTokenCompatibleWithModel } from "~/services/models/utils/tokenModelCompatibility"
import { AuthTypeEnum, type ApiToken, type DisplaySiteData } from "~/types"
import { getErrorMessage } from "~/utils/core/error"
import { createLogger } from "~/utils/core/logger"

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
  const { t } = useTranslation(["modelList", "common", "messages"])

  const [tokens, setTokens] = useState<ApiToken[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [selectedTokenId, setSelectedTokenId] = useState<number | null>(null)

  const [isCreating, setIsCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  const canCreateToken = useMemo(
    () => canManageDisplayAccountTokens(account),
    [account],
  )

  const ineligibleDescription = useMemo(() => {
    if (!account) return null
    if (canCreateToken) return null
    if (account.disabled === true)
      return t("modelList:keyDialog.ineligible.accountDisabled")
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
      setTokens(await fetchDisplayAccountTokens(account))
    } catch (error) {
      const errorMessage =
        error instanceof InvalidTokenPayloadError
          ? t("messages:errors.unknown")
          : getErrorMessage(error)
      logger.error("Failed to load token list for model key dialog", {
        message: errorMessage,
        accountId: account.id,
        baseUrl: account.baseUrl,
        siteType: account.siteType,
        ...(error instanceof InvalidTokenPayloadError
          ? {
              payloadAccountId: error.accountId,
              payloadBaseUrl: error.baseUrl,
              payloadSiteType: error.siteType,
              payloadResponseType: error.responseType,
            }
          : {}),
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
    if (!account || !selectedToken) return

    try {
      const resolvedToken = await resolveDisplayAccountTokenForSecret(
        account,
        selectedToken,
      )
      await navigator.clipboard.writeText(resolvedToken.key)
      toast.success(t("modelList:keyDialog.keyCopied"))
    } catch (error) {
      const errorMessage = getErrorMessage(error)
      logger.error("Failed to copy key to clipboard from model key dialog", {
        message: errorMessage,
      })
      toast.error(t("modelList:keyDialog.copyFailed"))
    }
  }, [account, selectedToken, t])

  const refreshTokensAfterCreate = useCallback(async () => {
    if (!account) return

    if (!canCreateToken) {
      setCreateError(t("modelList:keyDialog.createNotSupported"))
      return
    }

    setCreateError(null)
    setIsLoading(true)

    try {
      const refreshedTokens = await fetchDisplayAccountTokens(account)
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
      const errorMessage =
        error instanceof InvalidTokenPayloadError
          ? t("messages:errors.unknown")
          : getErrorMessage(error)
      logger.error(
        "Failed to refresh token list after create (model key dialog)",
        {
          message: errorMessage,
          accountId: account.id,
          baseUrl: account.baseUrl,
          siteType: account.siteType,
          ...(error instanceof InvalidTokenPayloadError
            ? {
                payloadAccountId: error.accountId,
                payloadBaseUrl: error.baseUrl,
                payloadSiteType: error.siteType,
                payloadResponseType: error.responseType,
              }
            : {}),
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
        const { service, request } = createDisplayAccountApiContext(account)
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
