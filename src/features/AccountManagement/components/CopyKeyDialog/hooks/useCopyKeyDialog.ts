import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

import { resolveDefaultTokenQuickCreateResolution } from "~/services/accounts/accountOperations"
import { shouldShowOneTimeKeyDialogForCreatedToken } from "~/services/accounts/createdTokenSecretHandling"
import { TOKEN_QUICK_CREATE_RESOLUTION_KINDS } from "~/services/accounts/tokenQuickCreateResolution"
import {
  canManageDisplayAccountTokens,
  createDisplayAccountApiContext,
  fetchDisplayAccountTokens,
  InvalidTokenPayloadError,
  requireDisplayAccountKeyManagement,
  resolveDisplayAccountTokenForSecret,
} from "~/services/accounts/utils/apiServiceRequest"
import { formatOptionalSkPrefixSiteToken } from "~/services/accountTokens/apiTokenKey"
import { TOKEN_PROVISIONING_ERRORS } from "~/services/apiAdapters/contracts/tokenProvisioning"
import { startProductAnalyticsAction } from "~/services/productAnalytics/actions"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/contracts"
import type { ApiToken, DisplaySiteData } from "~/types"
import { getErrorMessage } from "~/utils/core/error"
import { createLogger } from "~/utils/core/logger"

/**
 * Logger scoped to the "copy key" dialog so token-loading and clipboard failures can be diagnosed safely.
 */
const logger = createLogger("CopyKeyDialogHook")
const copyKeyAnalyticsContext = {
  featureId: PRODUCT_ANALYTICS_FEATURE_IDS.AccountManagement,
  actionId: PRODUCT_ANALYTICS_ACTION_IDS.CopyApiKey,
  surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAccountManagementRowActions,
  entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
}

const isCreatedApiToken = (value: unknown): value is ApiToken =>
  !!value &&
  typeof value === "object" &&
  typeof (value as Partial<ApiToken>).id === "number" &&
  typeof (value as Partial<ApiToken>).key === "string"

const getTokenInventoryErrorMessage = (error: unknown, fallback: string) =>
  error instanceof InvalidTokenPayloadError ? fallback : getErrorMessage(error)

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
  const [oneTimeToken, setOneTimeToken] = useState<ApiToken | null>(null)
  const [defaultTokenCreateAllowedGroups, setDefaultTokenCreateAllowedGroups] =
    useState<string[] | null>(null)
  const [copiedTokenId, setCopiedTokenId] = useState<number | null>(null)
  const [expandedTokens, setExpandedTokens] = useState<Set<number>>(new Set())
  const copiedTokenResetTimeoutRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null)
  // Incremented to invalidate slower token inventory requests after account eligibility changes.
  const fetchRequestIdRef = useRef(0)

  const canCreateDefaultKey = useMemo(
    () => canManageDisplayAccountTokens(account),
    [account],
  )

  const clearCopiedTokenResetTimeout = useCallback(() => {
    if (copiedTokenResetTimeoutRef.current === null) return

    clearTimeout(copiedTokenResetTimeoutRef.current)
    copiedTokenResetTimeoutRef.current = null
  }, [])

  const clearDefaultTokenCreateAllowedGroups = useCallback(() => {
    setDefaultTokenCreateAllowedGroups(null)
  }, [])

  const fetchTokens = useCallback(async () => {
    if (!account) return
    if (!canCreateDefaultKey) {
      fetchRequestIdRef.current += 1
      setTokens([])
      setError(null)
      setCreateError(null)
      setOneTimeToken(null)
      clearDefaultTokenCreateAllowedGroups()
      setCopiedTokenId(null)
      setExpandedTokens(new Set())
      setIsLoading(false)
      return
    }

    const requestId = (fetchRequestIdRef.current += 1)
    setIsLoading(true)
    setError(null)
    setCreateError(null)
    clearDefaultTokenCreateAllowedGroups()

    try {
      const tokensResponse = await fetchDisplayAccountTokens(account)
      if (fetchRequestIdRef.current !== requestId) return
      setTokens(tokensResponse)
    } catch (error) {
      if (fetchRequestIdRef.current !== requestId) return
      logger.error("Failed to load key list", {
        error,
        accountId: account.id,
        baseUrl: account.baseUrl,
        siteType: account.siteType,
      })
      const errorMessage = getTokenInventoryErrorMessage(
        error,
        t("ui:dialog.copyKey.getFailed"),
      )
      setError(t("ui:dialog.copyKey.loadFailed", { error: errorMessage }))
    } finally {
      if (fetchRequestIdRef.current === requestId) {
        setIsLoading(false)
      }
    }
  }, [account, canCreateDefaultKey, clearDefaultTokenCreateAllowedGroups, t])

  useEffect(() => {
    if (isOpen && account) {
      fetchTokens()
    } else {
      clearCopiedTokenResetTimeout()
      setTokens([])
      setError(null)
      setIsCreating(false)
      setCreateError(null)
      setOneTimeToken(null)
      clearDefaultTokenCreateAllowedGroups()
      setCopiedTokenId(null)
      setExpandedTokens(new Set())
    }
  }, [
    account,
    clearCopiedTokenResetTimeout,
    clearDefaultTokenCreateAllowedGroups,
    fetchTokens,
    isOpen,
  ])

  useEffect(() => {
    return () => {
      clearCopiedTokenResetTimeout()
    }
  }, [clearCopiedTokenResetTimeout])

  const copyKey = useCallback(
    async (token: ApiToken) => {
      if (!account) return

      const tracker = startProductAnalyticsAction(copyKeyAnalyticsContext)

      try {
        const resolvedToken = await resolveDisplayAccountTokenForSecret(
          account,
          token,
        )
        await navigator.clipboard.writeText(resolvedToken.key)
        setCopiedTokenId(token.id)
        toast.success(t("ui:dialog.copyKey.keyCopied"))
        tracker.complete(PRODUCT_ANALYTICS_RESULTS.Success)

        clearCopiedTokenResetTimeout()
        copiedTokenResetTimeoutRef.current = setTimeout(() => {
          setCopiedTokenId(null)
          copiedTokenResetTimeoutRef.current = null
        }, 2000)
      } catch (error) {
        logger.error("Failed to copy key to clipboard", { error })
        toast.error(
          getErrorMessage(error, t("ui:dialog.copyKey.copyFailedManual")),
        )
        tracker.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
          errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
        })
      }
    },
    [account, clearCopiedTokenResetTimeout, t],
  )

  /**
   * Refreshes token inventory after a successful create flow and applies the same UX rules:
   * - If no token is found, show an actionable error.
   * - If exactly one token exists, auto-copy it.
   * - Otherwise, keep the list visible and show a success toast.
   *
   * Some sites, including AIHubMix, only return the full key in the create
   * response and list masked keys afterwards. Callers that receive a created
   * token directly should pass it here so the secret can be copied before any
   * follow-up inventory refresh loses it.
   */
  const refreshTokensAfterCreate = useCallback(
    async (createdToken?: ApiToken) => {
      if (!account) return

      if (!canCreateDefaultKey) {
        setCreateError(t("ui:dialog.copyKey.createNotSupported"))
        return
      }

      setCreateError(null)

      try {
        const shouldShowOneTimeKeyDialog =
          !!createdToken &&
          shouldShowOneTimeKeyDialogForCreatedToken(account, createdToken)

        if (createdToken && shouldShowOneTimeKeyDialog) {
          setTokens((currentTokens) => {
            const withoutCreated = currentTokens.filter(
              (token) => token.id !== createdToken.id,
            )
            return [...withoutCreated, createdToken]
          })
          setOneTimeToken(
            formatOptionalSkPrefixSiteToken(createdToken, account.siteType),
          )
          await copyKey(createdToken)
          return
        }

        const refreshedTokens = await fetchDisplayAccountTokens(account)
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
        const errorMessage = getTokenInventoryErrorMessage(
          error,
          t("ui:dialog.copyKey.getFailed"),
        )
        setCreateError(
          t("ui:dialog.copyKey.createFailed", { error: errorMessage }),
        )
      }
    },
    [account, canCreateDefaultKey, copyKey, t],
  )

  const createDefaultKey = useCallback(async () => {
    if (!account) return

    if (!canCreateDefaultKey) {
      setCreateError(t("ui:dialog.copyKey.createNotSupported"))
      return
    }

    if (isCreating) return

    setIsCreating(true)
    setCreateError(null)
    clearDefaultTokenCreateAllowedGroups()

    try {
      const { keyManagement, request } = createDisplayAccountApiContext(account)
      const resolution = await resolveDefaultTokenQuickCreateResolution(account)
      if (resolution.kind === TOKEN_QUICK_CREATE_RESOLUTION_KINDS.Blocked) {
        setCreateError(resolution.message)
        return
      }

      if (
        resolution.kind ===
        TOKEN_QUICK_CREATE_RESOLUTION_KINDS.SelectionRequired
      ) {
        setDefaultTokenCreateAllowedGroups(resolution.allowedGroups)
        return
      }

      const tokenRequest = resolution.tokenData

      const created = await requireDisplayAccountKeyManagement(
        account,
        keyManagement,
      ).createToken(request, tokenRequest)
      if (!created) {
        throw new Error(TOKEN_PROVISIONING_ERRORS.CreateTokenFailed)
      }

      await refreshTokensAfterCreate(
        isCreatedApiToken(created) ? created : undefined,
      )
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
  }, [
    account,
    canCreateDefaultKey,
    clearDefaultTokenCreateAllowedGroups,
    isCreating,
    refreshTokensAfterCreate,
    t,
  ])

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
    oneTimeToken,
    defaultTokenCreateAllowedGroups,
    copiedTokenId,
    expandedTokens,
    canCreateDefaultKey,
    fetchTokens,
    copyKey,
    createDefaultKey,
    refreshTokensAfterCreate,
    toggleTokenExpansion,
    clearDefaultTokenCreateAllowedGroups,
    clearOneTimeToken: () => setOneTimeToken(null),
  }
}
