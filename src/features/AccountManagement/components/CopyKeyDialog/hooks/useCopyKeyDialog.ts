import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

import { resolveDefaultTokenQuickCreateResolution } from "~/services/accounts/accountOperations"
import {
  appendOrReplaceAccountRuntimeKey,
  buildDisplayAccountTokenRuntimeKey,
  type AccountRuntimeKey,
} from "~/services/accounts/accountRuntimeKeys"
import { shouldShowOneTimeKeyDialogForCreatedToken } from "~/services/accounts/createdTokenSecretHandling"
import {
  canCreateAccountApiTokens,
  canListAccountRuntimeKeys,
} from "~/services/accounts/keyProductCapabilities"
import { TOKEN_QUICK_CREATE_RESOLUTION_KINDS } from "~/services/accounts/tokenQuickCreateResolution"
import {
  createDisplayAccountApiContext,
  fetchDisplayAccountRuntimeKeys,
  getRuntimeKeyInventoryErrorMessage,
  requireDisplayAccountKeyManagement,
  resolveDisplayAccountRuntimeKeySecret,
} from "~/services/accounts/utils/apiServiceRequest"
import { formatOptionalSkPrefixSiteToken } from "~/services/accountTokens/apiTokenKey"
import {
  isCreatedApiToken,
  TOKEN_PROVISIONING_ERRORS,
} from "~/services/apiAdapters/contracts/tokenProvisioning"
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
 * Logger scoped to the "copy key" dialog so runtime-key loading and clipboard failures can be diagnosed safely.
 */
const logger = createLogger("CopyKeyDialogHook")
const copyKeyAnalyticsContext = {
  featureId: PRODUCT_ANALYTICS_FEATURE_IDS.AccountManagement,
  actionId: PRODUCT_ANALYTICS_ACTION_IDS.CopyApiKey,
  surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAccountManagementRowActions,
  entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
}

/**
 * CopyKeyDialog 核心逻辑 hook，负责加载 runtime key、处理复制与展开状态。
 * @param isOpen 对话框是否打开
 * @param account 当前账号（可能为空）
 * @returns runtime key 数据、加载状态、错误以及相关操作方法
 */
export function useCopyKeyDialog(
  isOpen: boolean,
  account: DisplaySiteData | null,
) {
  const { t } = useTranslation(["ui", "messages"])
  const [runtimeKeys, setRuntimeKeys] = useState<AccountRuntimeKey[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [oneTimeToken, setOneTimeToken] = useState<ApiToken | null>(null)
  const [defaultTokenCreateAllowedGroups, setDefaultTokenCreateAllowedGroups] =
    useState<string[] | null>(null)
  const [copiedRuntimeKeyId, setCopiedRuntimeKeyId] = useState<string | null>(
    null,
  )
  const [expandedRuntimeKeys, setExpandedRuntimeKeys] = useState<Set<string>>(
    new Set(),
  )
  const copiedRuntimeKeyResetTimeoutRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null)
  // Incremented to invalidate slower runtime-key inventory requests after account eligibility changes.
  const fetchRequestIdRef = useRef(0)

  const canCreateDefaultKey = useMemo(
    () => canCreateAccountApiTokens(account),
    [account],
  )

  const canLoadRuntimeKeys = useMemo(
    () => canListAccountRuntimeKeys(account),
    [account],
  )

  const clearCopiedRuntimeKeyResetTimeout = useCallback(() => {
    if (copiedRuntimeKeyResetTimeoutRef.current === null) return

    clearTimeout(copiedRuntimeKeyResetTimeoutRef.current)
    copiedRuntimeKeyResetTimeoutRef.current = null
  }, [])

  const clearDefaultTokenCreateAllowedGroups = useCallback(() => {
    setDefaultTokenCreateAllowedGroups(null)
  }, [])

  const fetchRuntimeKeys = useCallback(async () => {
    if (!account) return
    if (!canLoadRuntimeKeys) {
      fetchRequestIdRef.current += 1
      setRuntimeKeys([])
      setError(null)
      setCreateError(null)
      setOneTimeToken(null)
      clearDefaultTokenCreateAllowedGroups()
      setCopiedRuntimeKeyId(null)
      setExpandedRuntimeKeys(new Set())
      setIsLoading(false)
      return
    }

    const requestId = (fetchRequestIdRef.current += 1)
    setIsLoading(true)
    setError(null)
    setCreateError(null)
    clearDefaultTokenCreateAllowedGroups()

    try {
      const loadedRuntimeKeys = await fetchDisplayAccountRuntimeKeys(account)
      if (fetchRequestIdRef.current !== requestId) return
      setRuntimeKeys(loadedRuntimeKeys)
    } catch (error) {
      if (fetchRequestIdRef.current !== requestId) return
      logger.error("Failed to load key list", {
        error,
        accountId: account.id,
        baseUrl: account.baseUrl,
        siteType: account.siteType,
      })
      const errorMessage = getRuntimeKeyInventoryErrorMessage(
        error,
        t("ui:dialog.copyKey.getFailed"),
      )
      setError(t("ui:dialog.copyKey.loadFailed", { error: errorMessage }))
    } finally {
      if (fetchRequestIdRef.current === requestId) {
        setIsLoading(false)
      }
    }
  }, [account, canLoadRuntimeKeys, clearDefaultTokenCreateAllowedGroups, t])

  useEffect(() => {
    if (isOpen && account) {
      fetchRuntimeKeys()
    } else {
      clearCopiedRuntimeKeyResetTimeout()
      setRuntimeKeys([])
      setError(null)
      setIsCreating(false)
      setCreateError(null)
      setOneTimeToken(null)
      clearDefaultTokenCreateAllowedGroups()
      setCopiedRuntimeKeyId(null)
      setExpandedRuntimeKeys(new Set())
    }
  }, [
    account,
    clearCopiedRuntimeKeyResetTimeout,
    clearDefaultTokenCreateAllowedGroups,
    fetchRuntimeKeys,
    isOpen,
  ])

  useEffect(() => {
    return () => {
      clearCopiedRuntimeKeyResetTimeout()
    }
  }, [clearCopiedRuntimeKeyResetTimeout])

  const copyKey = useCallback(
    async (runtimeKey: AccountRuntimeKey) => {
      if (!account) return

      const tracker = startProductAnalyticsAction(copyKeyAnalyticsContext)

      try {
        const resolvedRuntimeKey = await resolveDisplayAccountRuntimeKeySecret(
          account,
          runtimeKey,
        )
        await navigator.clipboard.writeText(resolvedRuntimeKey.secret)
        setCopiedRuntimeKeyId(runtimeKey.id)
        toast.success(t("ui:dialog.copyKey.keyCopied"))
        tracker.complete(PRODUCT_ANALYTICS_RESULTS.Success)

        clearCopiedRuntimeKeyResetTimeout()
        copiedRuntimeKeyResetTimeoutRef.current = setTimeout(() => {
          setCopiedRuntimeKeyId(null)
          copiedRuntimeKeyResetTimeoutRef.current = null
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
    [account, clearCopiedRuntimeKeyResetTimeout, t],
  )

  /**
   * Refreshes runtime-key inventory after a successful create flow and applies the same UX rules:
   * - If no runtime key is found, show an actionable error.
   * - If exactly one runtime key exists, auto-copy it.
   * - Otherwise, keep the list visible and show a success toast.
   *
   * Some sites, including AIHubMix, only return the full key in the create
   * response and list masked keys afterwards. Callers that receive a created
   * token directly should pass it here so the secret can be copied before any
   * follow-up inventory refresh loses it.
   */
  const refreshRuntimeKeysAfterCreate = useCallback(
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
          const createdRuntimeKey = buildDisplayAccountTokenRuntimeKey(
            account,
            createdToken,
          )
          setRuntimeKeys((currentRuntimeKeys) =>
            appendOrReplaceAccountRuntimeKey(
              currentRuntimeKeys,
              createdRuntimeKey,
            ),
          )
          setOneTimeToken(
            formatOptionalSkPrefixSiteToken(createdToken, account.siteType),
          )
          await copyKey(createdRuntimeKey)
          return
        }

        const refreshedRuntimeKeys =
          await fetchDisplayAccountRuntimeKeys(account)
        setRuntimeKeys(refreshedRuntimeKeys)

        if (refreshedRuntimeKeys.length === 0) {
          setCreateError(t("ui:dialog.copyKey.noKeyFoundAfterCreate"))
          return
        }

        if (refreshedRuntimeKeys.length === 1) {
          await copyKey(refreshedRuntimeKeys[0])
          return
        }

        toast.success(t("ui:dialog.copyKey.createSuccess"))
      } catch (error) {
        logger.error("Failed to refresh runtime-key list after create", {
          error,
          accountId: account.id,
          baseUrl: account.baseUrl,
          siteType: account.siteType,
        })
        const errorMessage = getRuntimeKeyInventoryErrorMessage(
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

      await refreshRuntimeKeysAfterCreate(
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
    refreshRuntimeKeysAfterCreate,
    t,
  ])

  const toggleRuntimeKeyExpansion = (runtimeKeyId: string) => {
    setExpandedRuntimeKeys((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(runtimeKeyId)) {
        newSet.delete(runtimeKeyId)
      } else {
        newSet.add(runtimeKeyId)
      }
      return newSet
    })
  }

  return {
    runtimeKeys,
    isLoading,
    error,
    isCreating,
    createError,
    oneTimeToken,
    defaultTokenCreateAllowedGroups,
    copiedRuntimeKeyId,
    expandedRuntimeKeys,
    canCreateDefaultKey,
    fetchRuntimeKeys,
    copyKey,
    createDefaultKey,
    refreshRuntimeKeysAfterCreate,
    toggleRuntimeKeyExpansion,
    clearDefaultTokenCreateAllowedGroups,
    clearOneTimeToken: () => setOneTimeToken(null),
  }
}
