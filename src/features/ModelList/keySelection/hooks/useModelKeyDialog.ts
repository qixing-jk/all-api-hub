import type { TFunction } from "i18next"
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { useTranslation } from "react-i18next"

import toast from "~/lib/notify"
import {
  getCreatedAccountRuntimeKey,
  getCreatedAccountRuntimeKeyId,
  prepareDefaultAccountKeyCreation,
  type AccountKeyCreationResult,
} from "~/services/accounts/accountKeyCreation"
import { getDefaultAccountKeyName } from "~/services/accounts/accountKeyNames"
import {
  appendOrReplaceAccountRuntimeKey,
  isAccountRuntimeKeyCompatibleWithModel,
  type AccountRuntimeKey,
} from "~/services/accounts/accountRuntimeKeys"
import type { CreatedRuntimeSecret } from "~/services/accounts/createdRuntimeSecret"
import {
  canCreateAccountKeyResources,
  canListAccountRuntimeKeys,
} from "~/services/accounts/keyProductCapabilities"
import {
  fetchDisplayAccountRuntimeKeys,
  resolveDisplayAccountRuntimeKeySecret,
} from "~/services/accounts/utils/apiServiceRequest"
import { AccountKeyResourceError } from "~/services/apiAdapters/contracts/accountKeyResource"
import { AuthTypeEnum, type DisplaySiteData } from "~/types"
import { sleep } from "~/utils/core/async"
import { getErrorMessage } from "~/utils/core/error"
import { createLogger } from "~/utils/core/logger"

/**
 * Logger scoped to the "model key" dialog so runtime-key loading and clipboard failures can be diagnosed safely.
 */
const logger = createLogger("ModelKeyDialogHook")
const POST_CREATE_TOKEN_REFRESH_ATTEMPTS = 5
const POST_CREATE_TOKEN_REFRESH_INTERVAL_MS = 1_000

type CreateFailure =
  | { kind: "unsupported" | "group-required" }
  | { kind: "no-compatible-key"; modelId: string }
  | { kind: "failed"; message: string }

/** Translates create outcomes while preserving the attempted model context. */
function presentCreateFailure(failure: CreateFailure | null, t: TFunction) {
  if (!failure) return null
  switch (failure.kind) {
    case "unsupported":
      return t("modelList:keyDialog.createNotSupported")
    case "group-required":
      return t("modelList:keyDialog.createGroupRequired")
    case "no-compatible-key":
      return t("modelList:keyDialog.noCompatibleFoundAfterCreate", {
        modelId: failure.modelId,
      })
    case "failed":
      return t("modelList:keyDialog.createFailed", {
        error: failure.message || t("messages:errors.unknown"),
      })
  }
}

export type ModelKeyDialogCreateResult =
  | "success"
  | "failure"
  | "skipped"
  | "input-required"

/**
 * Input params for `useModelKeyDialog`.
 */
type UseModelKeyDialogParams = {
  isOpen: boolean
  account: DisplaySiteData | null
  modelId: string
  modelEnableGroups?: string[]
  onLateCreated?: (created: AccountKeyCreationResult) => void
}

/**
 * Dialog state + actions for the model→key compatibility flow.
 */
export function useModelKeyDialog(params: UseModelKeyDialogParams) {
  const { isOpen, account, modelId, modelEnableGroups } = params
  const sourceKey = JSON.stringify([
    isOpen,
    account?.id,
    account?.baseUrl,
    account?.siteType,
    account?.authType,
    account?.userId,
    account?.token,
    account?.cookieAuthSessionCookie,
    account?.disabled,
    modelId,
    modelEnableGroups,
  ])
  const sourceRef = useRef(sourceKey)
  useLayoutEffect(() => {
    sourceRef.current = sourceKey
  }, [sourceKey])
  const lateCreatedObserver = useRef(params.onLateCreated)
  useLayoutEffect(() => {
    lateCreatedObserver.current = params.onLateCreated
  }, [params.onLateCreated])
  const creationAbort = useRef<AbortController | null>(null)
  const uncertainSources = useRef(new Set<string>())
  const { t } = useTranslation(["modelList", "common", "messages"])

  const [runtimeKeys, setRuntimeKeys] = useState<AccountRuntimeKey[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [loadError, setError] = useState<string | null>(null)

  const [selectedRuntimeKeyId, setSelectedRuntimeKeyId] = useState<
    string | null
  >(null)

  const [isCreating, setIsCreating] = useState(false)
  const [createFailure, setCreateError] = useState<CreateFailure | null>(null)
  const [oneTimeSecret, setOneTimeSecret] =
    useState<CreatedRuntimeSecret | null>(null)
  useEffect(() => {
    setIsCreating(false)
    setCreateError(null)
    setOneTimeSecret(null)
    return () => {
      creationAbort.current?.abort()
      creationAbort.current = null
    }
  }, [sourceKey])
  // Incremented to invalidate slower runtime-key inventory requests after account eligibility changes.
  const fetchRequestIdRef = useRef(0)

  const canCreateToken = useMemo(
    () => canCreateAccountKeyResources(account),
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
      setOneTimeSecret(null)
      setIsLoading(false)
      return false
    }

    const requestId = (fetchRequestIdRef.current += 1)
    setIsLoading(true)
    setError(null)
    setCreateError(null)

    try {
      const fetchedRuntimeKeys = await fetchDisplayAccountRuntimeKeys(account)
      if (
        fetchRequestIdRef.current !== requestId ||
        sourceRef.current !== sourceKey
      )
        return false
      setRuntimeKeys(fetchedRuntimeKeys)
      return true
    } catch (error) {
      if (
        fetchRequestIdRef.current !== requestId ||
        sourceRef.current !== sourceKey
      )
        return false
      const errorMessage = getErrorMessage(error)
      logger.error("Failed to load runtime-key list for model key dialog", {
        message: errorMessage,
        accountId: account.id,
        baseUrl: account.baseUrl,
        siteType: account.siteType,
      })
      setError(errorMessage)
      return false
    } finally {
      if (
        fetchRequestIdRef.current === requestId &&
        sourceRef.current === sourceKey
      ) {
        setIsLoading(false)
      }
    }
  }, [account, canLoadRuntimeKeys, sourceKey])

  const modelContext = useMemo(
    () => ({ id: modelId, enableGroups: modelEnableGroups }),
    [modelEnableGroups, modelId],
  )

  const compatibleRuntimeKeys = useMemo(
    () =>
      runtimeKeys.filter((runtimeKey) =>
        isAccountRuntimeKeyCompatibleWithModel(runtimeKey, modelContext),
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
      setOneTimeSecret(null)
      return
    }

    setRuntimeKeys([])
    setSelectedRuntimeKeyId(null)
    void fetchRuntimeKeys()
    return () => {
      fetchRequestIdRef.current += 1
    }
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

      const [onlyCompatibleKey] = compatibleRuntimeKeys
      if (
        onlyCompatibleKey !== undefined &&
        compatibleRuntimeKeys.length === 1
      ) {
        return onlyCompatibleKey.id
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
    async (
      currentAccount: DisplaySiteData,
      createdId: string | null,
      isCurrent: () => boolean,
    ) => {
      for (
        let attempt = 1;
        attempt <= POST_CREATE_TOKEN_REFRESH_ATTEMPTS;
        attempt++
      ) {
        if (!isCurrent())
          return { refreshedRuntimeKeys: [], refreshedCompatible: [] }
        const refreshedRuntimeKeys =
          await fetchDisplayAccountRuntimeKeys(currentAccount)
        if (!isCurrent())
          return { refreshedRuntimeKeys: [], refreshedCompatible: [] }
        const refreshedCompatible = refreshedRuntimeKeys.filter(
          (runtimeKey) =>
            runtimeKey.id === createdId &&
            isAccountRuntimeKeyCompatibleWithModel(runtimeKey, modelContext),
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
      if (sourceRef.current !== sourceKey) return
      await navigator.clipboard.writeText(resolvedRuntimeKey.secret)
      if (sourceRef.current !== sourceKey) return
      toast.success(t("modelList:keyDialog.keyCopied"))
    } catch (error) {
      if (sourceRef.current !== sourceKey) return
      const errorMessage = getErrorMessage(
        error,
        t("modelList:keyDialog.copyFailed"),
      )
      logger.error("Failed to copy key to clipboard from model key dialog", {
        message: errorMessage,
      })
      toast.error(errorMessage)
    }
  }, [account, selectedRuntimeKey, sourceKey, t])

  const refreshRuntimeKeysAfterCreate = useCallback(
    async (created: AccountKeyCreationResult) => {
      if (!account || sourceRef.current !== sourceKey) return "skipped" as const

      if (!canCreateToken) {
        setCreateError({ kind: "unsupported" })
        return "skipped" as const
      }

      setCreateError(null)
      setIsLoading(true)

      try {
        if (created.createdSecret) setOneTimeSecret(created.createdSecret)
        const createdRuntimeKey = getCreatedAccountRuntimeKey(account, created)
        if (createdRuntimeKey) {
          setRuntimeKeys((keys) =>
            appendOrReplaceAccountRuntimeKey(keys, createdRuntimeKey),
          )
          if (
            isAccountRuntimeKeyCompatibleWithModel(
              createdRuntimeKey,
              modelContext,
            )
          ) {
            setSelectedRuntimeKeyId(createdRuntimeKey.id)
            toast.success(t("modelList:keyDialog.createSuccess"))
            return "success" as const
          }
          setCreateError({ kind: "no-compatible-key", modelId })
          return "failure" as const
        }
        const { refreshedRuntimeKeys, refreshedCompatible } =
          await fetchRuntimeKeysUntilCompatibleAfterCreate(
            account,
            getCreatedAccountRuntimeKeyId(created),
            () => sourceRef.current === sourceKey,
          )
        if (sourceRef.current !== sourceKey) return "skipped" as const
        setRuntimeKeys(refreshedRuntimeKeys)

        const [firstCompatibleKey] = refreshedCompatible
        if (!firstCompatibleKey) {
          setCreateError({ kind: "no-compatible-key", modelId })
          return "failure" as const
        }

        setSelectedRuntimeKeyId(firstCompatibleKey.id)
        toast.success(t("modelList:keyDialog.createSuccess"))
        return "success" as const
      } catch (error) {
        if (sourceRef.current !== sourceKey) return "skipped" as const
        const errorMessage = getErrorMessage(error)
        logger.error(
          "Failed to refresh runtime-key list after create (model key dialog)",
          {
            message: errorMessage,
            accountId: account.id,
            baseUrl: account.baseUrl,
            siteType: account.siteType,
          },
        )
        setCreateError({ kind: "failed", message: errorMessage })
        return "failure" as const
      } finally {
        if (sourceRef.current === sourceKey) setIsLoading(false)
      }
    },
    [
      account,
      canCreateToken,
      fetchRuntimeKeysUntilCompatibleAfterCreate,
      modelContext,
      modelId,
      sourceKey,
      t,
    ],
  )

  const createDefaultKey = useCallback(
    async (group: string) => {
      if (!account) return "skipped" as const

      if (!canCreateToken) {
        setCreateError({ kind: "unsupported" })
        return "skipped" as const
      }

      const normalizedGroup = typeof group === "string" ? group.trim() : ""
      if (!normalizedGroup) {
        setCreateError({ kind: "group-required" })
        return "skipped" as const
      }

      const writeKey = JSON.stringify([
        account.id,
        account.siteType,
        account.baseUrl.replace(/\/+$/, ""),
        account.userId,
        normalizedGroup,
        [...(modelEnableGroups ?? [])].map((value) => value.trim()).sort(),
      ])
      if (creationAbort.current || uncertainSources.current.has(writeKey))
        return "skipped" as const
      setIsCreating(true)
      setCreateError(null)

      try {
        const controller = new AbortController()
        creationAbort.current = controller
        const plan = await prepareDefaultAccountKeyCreation(account, {
          signal: controller.signal,
          intent: {
            nameHint: getDefaultAccountKeyName(normalizedGroup),
            preferredGroup: normalizedGroup,
            allowedGroups: modelEnableGroups,
          },
        })
        if (sourceRef.current !== sourceKey || controller.signal.aborted)
          return "skipped" as const
        if (plan.kind !== "ready") return "input-required" as const
        const created = await plan.create()
        if (sourceRef.current !== sourceKey || controller.signal.aborted) {
          lateCreatedObserver.current?.(created)
          return "skipped" as const
        }
        return await refreshRuntimeKeysAfterCreate(created)
      } catch (error) {
        if (
          error instanceof AccountKeyResourceError &&
          error.failure.code === "mutation_state_uncertain"
        )
          uncertainSources.current.add(writeKey)
        if (sourceRef.current !== sourceKey) return "skipped" as const
        const errorMessage = getErrorMessage(error)
        logger.error("Failed to create default token (model key dialog)", {
          message: errorMessage,
          accountId: account.id,
          baseUrl: account.baseUrl,
          siteType: account.siteType,
        })
        setCreateError({ kind: "failed", message: errorMessage })
        return "failure" as const
      } finally {
        if (sourceRef.current === sourceKey) {
          creationAbort.current = null
          setIsCreating(false)
        }
      }
    },
    [
      account,
      canCreateToken,
      modelEnableGroups,
      refreshRuntimeKeysAfterCreate,
      sourceKey,
    ],
  )

  return {
    runtimeKeys,
    compatibleRuntimeKeys,
    isLoading,
    error:
      loadError !== null
        ? t("modelList:keyDialog.loadFailed", {
            error: loadError || t("messages:errors.unknown"),
          })
        : null,
    selectedRuntimeKeyId,
    setSelectedRuntimeKeyId,
    selectedRuntimeKey,
    canCreateToken,
    ineligibleDescription,
    isCreating,
    createError: presentCreateFailure(createFailure, t),
    oneTimeSecret,
    fetchRuntimeKeys,
    copySelectedKey,
    createDefaultKey,
    refreshRuntimeKeysAfterCreate,
    clearOneTimeSecret: () => {
      setOneTimeSecret(null)
    },
  }
}
