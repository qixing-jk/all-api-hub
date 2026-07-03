import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

import { buildGroupDefaultTokenRequest } from "~/services/accounts/accountKeyAutoProvisioning/ensureDefaultToken"
import {
  appendOrReplaceAccountRuntimeKey,
  buildDisplayAccountTokenRuntimeKey,
  hasUsableAccountRuntimeKeySecret,
  isAccountTokenRuntimeKey,
  type AccountRuntimeKey,
} from "~/services/accounts/accountRuntimeKeys"
import { shouldShowOneTimeKeyDialogForCreatedToken } from "~/services/accounts/createdTokenSecretHandling"
import {
  canCreateAccountApiTokens,
  canListAccountRuntimeKeys,
} from "~/services/accounts/keyProductCapabilities"
import {
  createDisplayAccountApiContext,
  fetchDisplayAccountRuntimeKeys,
  fetchDisplayAccountTokens,
  getInvalidTokenPayloadLogContext,
  getRuntimeKeyInventoryErrorMessage,
  requireDisplayAccountKeyManagement,
  resolveDisplayAccountRuntimeKeySecret,
} from "~/services/accounts/utils/apiServiceRequest"
import { formatOptionalSkPrefixSiteToken } from "~/services/accountTokens/apiTokenKey"
import {
  isCreatedApiToken,
  TOKEN_PROVISIONING_ERRORS,
} from "~/services/apiAdapters/contracts/tokenProvisioning"
import { isTokenCompatibleWithModel } from "~/services/models/utils/tokenModelCompatibility"
import { AuthTypeEnum, type ApiToken, type DisplaySiteData } from "~/types"
import { sleep } from "~/utils/core/async"
import { getErrorMessage } from "~/utils/core/error"
import { createLogger } from "~/utils/core/logger"

/**
 * Logger scoped to the "model key" dialog so runtime-key loading and clipboard failures can be diagnosed safely.
 */
const logger = createLogger("ModelKeyDialogHook")
const POST_CREATE_TOKEN_REFRESH_ATTEMPTS = 5
const POST_CREATE_TOKEN_REFRESH_INTERVAL_MS = 1_000

export type ModelKeyDialogCreateResult = "success" | "failure" | "skipped"

/**
 * Input params for `useModelKeyDialog`.
 */
type UseModelKeyDialogParams = {
  isOpen: boolean
  account: DisplaySiteData | null
  modelId: string
  modelEnableGroups?: string[]
}

const buildAccountTokenRuntimeKeys = (
  account: DisplaySiteData,
  tokens: ApiToken[],
) => tokens.map((token) => buildDisplayAccountTokenRuntimeKey(account, token))

const isRuntimeKeyCompatibleWithModel = (
  runtimeKey: AccountRuntimeKey,
  model: { id: string; enableGroups?: string[] | null },
) => {
  if (isAccountTokenRuntimeKey(runtimeKey)) {
    return isTokenCompatibleWithModel(runtimeKey.token, model)
  }

  return (
    model.id.trim().length > 0 && hasUsableAccountRuntimeKeySecret(runtimeKey)
  )
}

/**
 * Dialog state + actions for the model→key compatibility flow.
 */
export function useModelKeyDialog(params: UseModelKeyDialogParams) {
  const { isOpen, account, modelId, modelEnableGroups } = params
  const { t } = useTranslation(["modelList", "common", "messages"])

  const [runtimeKeys, setRuntimeKeys] = useState<AccountRuntimeKey[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [selectedRuntimeKeyId, setSelectedRuntimeKeyId] = useState<
    string | null
  >(null)

  const [isCreating, setIsCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [oneTimeToken, setOneTimeToken] = useState<ApiToken | null>(null)
  // Incremented to invalidate slower runtime-key inventory requests after account eligibility changes.
  const fetchRequestIdRef = useRef(0)

  const canCreateToken = useMemo(
    () => canCreateAccountApiTokens(account),
    [account],
  )

  const canLoadRuntimeKeys = useMemo(
    () => canListAccountRuntimeKeys(account),
    [account],
  )

  const ineligibleDescription = useMemo(() => {
    if (!account) return null
    if (canCreateToken) return null
    if (account.disabled === true)
      return t("modelList:keyDialog.ineligible.accountDisabled")
    if (account.authType === AuthTypeEnum.None)
      return t("modelList:keyDialog.ineligible.missingAuth")
    if (canLoadRuntimeKeys)
      return t("modelList:keyDialog.ineligible.readOnlyRuntimeKeys")
    return t("modelList:keyDialog.ineligible.missingCredentials")
  }, [account, canCreateToken, canLoadRuntimeKeys, t])

  const fetchRuntimeKeys = useCallback(async () => {
    if (!account) return false
    if (!canLoadRuntimeKeys) {
      fetchRequestIdRef.current += 1
      setRuntimeKeys([])
      setSelectedRuntimeKeyId(null)
      setError(null)
      setCreateError(null)
      setOneTimeToken(null)
      setIsLoading(false)
      return false
    }

    const requestId = (fetchRequestIdRef.current += 1)
    setIsLoading(true)
    setError(null)
    setCreateError(null)

    try {
      const fetchedRuntimeKeys = await fetchDisplayAccountRuntimeKeys(account)
      if (fetchRequestIdRef.current !== requestId) return false
      setRuntimeKeys(fetchedRuntimeKeys)
      return true
    } catch (error) {
      if (fetchRequestIdRef.current !== requestId) return false
      const errorMessage = getRuntimeKeyInventoryErrorMessage(
        error,
        t("messages:errors.unknown"),
      )
      logger.error("Failed to load runtime-key list for model key dialog", {
        message: errorMessage,
        accountId: account.id,
        baseUrl: account.baseUrl,
        siteType: account.siteType,
        ...getInvalidTokenPayloadLogContext(error),
      })
      setError(t("modelList:keyDialog.loadFailed", { error: errorMessage }))
      return false
    } finally {
      if (fetchRequestIdRef.current === requestId) {
        setIsLoading(false)
      }
    }
  }, [account, canLoadRuntimeKeys, t])

  const modelContext = useMemo(
    () => ({ id: modelId, enableGroups: modelEnableGroups }),
    [modelEnableGroups, modelId],
  )

  const compatibleRuntimeKeys = useMemo(
    () =>
      runtimeKeys.filter((runtimeKey) =>
        isRuntimeKeyCompatibleWithModel(runtimeKey, modelContext),
      ),
    [modelContext, runtimeKeys],
  )

  useEffect(() => {
    if (!isOpen || !account) {
      setRuntimeKeys([])
      setIsLoading(false)
      setError(null)
      setSelectedRuntimeKeyId(null)
      setIsCreating(false)
      setCreateError(null)
      setOneTimeToken(null)
      return
    }

    fetchRuntimeKeys()
  }, [account, fetchRuntimeKeys, isOpen])

  useEffect(() => {
    if (!isOpen) return

    setSelectedRuntimeKeyId((prev) => {
      if (
        prev !== null &&
        compatibleRuntimeKeys.some((runtimeKey) => runtimeKey.id === prev)
      ) {
        return prev
      }

      if (compatibleRuntimeKeys.length === 1) {
        return compatibleRuntimeKeys[0].id
      }

      return null
    })
  }, [compatibleRuntimeKeys, isOpen])

  const selectedRuntimeKey = useMemo(
    () =>
      selectedRuntimeKeyId !== null
        ? compatibleRuntimeKeys.find(
            (runtimeKey) => runtimeKey.id === selectedRuntimeKeyId,
          ) ?? null
        : null,
    [compatibleRuntimeKeys, selectedRuntimeKeyId],
  )

  const fetchRuntimeKeysUntilCompatibleAfterCreate = useCallback(
    async (currentAccount: DisplaySiteData) => {
      for (
        let attempt = 1;
        attempt <= POST_CREATE_TOKEN_REFRESH_ATTEMPTS;
        attempt++
      ) {
        const refreshedRuntimeKeys = buildAccountTokenRuntimeKeys(
          currentAccount,
          await fetchDisplayAccountTokens(currentAccount),
        )
        const refreshedCompatible = refreshedRuntimeKeys.filter((runtimeKey) =>
          isRuntimeKeyCompatibleWithModel(runtimeKey, modelContext),
        )

        if (
          refreshedCompatible.length > 0 ||
          attempt === POST_CREATE_TOKEN_REFRESH_ATTEMPTS
        ) {
          return { refreshedRuntimeKeys, refreshedCompatible }
        }

        await sleep(POST_CREATE_TOKEN_REFRESH_INTERVAL_MS)
      }

      return { refreshedRuntimeKeys: [], refreshedCompatible: [] }
    },
    [modelContext],
  )

  const copySelectedKey = useCallback(async () => {
    if (!account || !selectedRuntimeKey) return

    try {
      const resolvedRuntimeKey = await resolveDisplayAccountRuntimeKeySecret(
        account,
        selectedRuntimeKey,
      )
      await navigator.clipboard.writeText(resolvedRuntimeKey.secret)
      toast.success(t("modelList:keyDialog.keyCopied"))
    } catch (error) {
      const errorMessage = getErrorMessage(
        error,
        t("modelList:keyDialog.copyFailed"),
      )
      logger.error("Failed to copy key to clipboard from model key dialog", {
        message: errorMessage,
      })
      toast.error(errorMessage)
    }
  }, [account, selectedRuntimeKey, t])

  const refreshRuntimeKeysAfterCreate = useCallback(
    async (createdToken?: ApiToken) => {
      if (!account) return "skipped" as const

      if (!canCreateToken) {
        setCreateError(t("modelList:keyDialog.createNotSupported"))
        return "skipped" as const
      }

      setCreateError(null)
      setIsLoading(true)

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
          if (
            isRuntimeKeyCompatibleWithModel(createdRuntimeKey, modelContext)
          ) {
            setSelectedRuntimeKeyId(createdRuntimeKey.id)
            setOneTimeToken(
              formatOptionalSkPrefixSiteToken(createdToken, account.siteType),
            )
            toast.success(t("modelList:keyDialog.createSuccess"))
            return "success" as const
          } else {
            setCreateError(
              t("modelList:keyDialog.noCompatibleFoundAfterCreate", {
                modelId,
              }),
            )
            return "failure" as const
          }
        }

        const { refreshedRuntimeKeys, refreshedCompatible } =
          await fetchRuntimeKeysUntilCompatibleAfterCreate(account)
        setRuntimeKeys(refreshedRuntimeKeys)

        if (refreshedCompatible.length === 0) {
          setCreateError(
            t("modelList:keyDialog.noCompatibleFoundAfterCreate", { modelId }),
          )
          return "failure" as const
        }

        toast.success(t("modelList:keyDialog.createSuccess"))
        return "success" as const
      } catch (error) {
        const errorMessage = getRuntimeKeyInventoryErrorMessage(
          error,
          t("messages:errors.unknown"),
        )
        logger.error(
          "Failed to refresh runtime-key list after create (model key dialog)",
          {
            message: errorMessage,
            accountId: account.id,
            baseUrl: account.baseUrl,
            siteType: account.siteType,
            ...getInvalidTokenPayloadLogContext(error),
          },
        )
        setCreateError(
          t("modelList:keyDialog.createFailed", { error: errorMessage }),
        )
        return "failure" as const
      } finally {
        setIsLoading(false)
      }
    },
    [
      account,
      canCreateToken,
      fetchRuntimeKeysUntilCompatibleAfterCreate,
      modelContext,
      modelId,
      t,
    ],
  )

  const createDefaultKey = useCallback(
    async (group: string) => {
      if (!account) return "skipped" as const

      if (!canCreateToken) {
        setCreateError(t("modelList:keyDialog.createNotSupported"))
        return "skipped" as const
      }

      if (isCreating) return "skipped" as const

      const normalizedGroup = typeof group === "string" ? group.trim() : ""
      if (!normalizedGroup) {
        setCreateError(t("modelList:keyDialog.createGroupRequired"))
        return "skipped" as const
      }

      setIsCreating(true)
      setCreateError(null)

      try {
        const { keyManagement, request } =
          createDisplayAccountApiContext(account)
        const tokenRequest = buildGroupDefaultTokenRequest(normalizedGroup)
        const created = await requireDisplayAccountKeyManagement(
          account,
          keyManagement,
        ).createToken(request, tokenRequest)
        if (!created) {
          throw new Error(TOKEN_PROVISIONING_ERRORS.CreateTokenFailed)
        }

        return await refreshRuntimeKeysAfterCreate(
          isCreatedApiToken(created) ? created : undefined,
        )
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
        return "failure" as const
      } finally {
        setIsCreating(false)
      }
    },
    [account, canCreateToken, isCreating, refreshRuntimeKeysAfterCreate, t],
  )

  return {
    runtimeKeys,
    compatibleRuntimeKeys,
    isLoading,
    error,
    selectedRuntimeKeyId,
    setSelectedRuntimeKeyId,
    selectedRuntimeKey,
    canCreateToken,
    ineligibleDescription,
    isCreating,
    createError,
    oneTimeToken,
    fetchRuntimeKeys,
    copySelectedKey,
    createDefaultKey,
    refreshRuntimeKeysAfterCreate,
    clearOneTimeToken: () => setOneTimeToken(null),
  }
}
