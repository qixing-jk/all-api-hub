import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react"
import { useTranslation } from "react-i18next"

import toast from "~/lib/notify"
import {
  accountKeySourceSignature,
  ensureAccountKey,
  getCreatedAccountRuntimeKey,
  getCreatedAccountRuntimeKeyId,
  type AccountKeyCreationResult,
} from "~/services/accounts/keys/accountKeyCreation"
import {
  appendOrReplaceAccountRuntimeKey,
  getAccountRuntimeKeyExportId,
} from "~/services/accounts/keys/accountRuntimeKeys"
import { fetchDisplayAccountRuntimeKeys } from "~/services/accounts/utils/apiServiceRequest"
import type { DisplaySiteData, SiteAccount } from "~/types"

import {
  KILO_CODE_INVENTORY_STATUSES,
  type DefaultTokenCreateContext,
  type TokenInventoryState,
} from "../presentation"

/**
 * Builds the stable toast id used while Kilo Code export creates a missing token.
 */
export function buildKiloCodeCreateTokenToastId(siteId: string) {
  return `kilocode-create-token-${siteId}`
}

/** Own inventory and default-key creation, including source identity and cancellation. */
export function useKiloCodeTokenInventory({
  isOpen,
  displayById,
  accountById,
  selectedSiteIds,
}: {
  isOpen: boolean
  displayById: Map<string, DisplaySiteData>
  accountById: Map<string, SiteAccount>
  selectedSiteIds: string[]
}) {
  const { t } = useTranslation(["ui", "common", "messages"])
  const [selectedTokenIdsBySite, setSelectedTokenIdsBySite] = useState<
    Record<string, string[]>
  >({})
  const [tokenInventories, setTokenInventories] = useState<
    Record<string, TokenInventoryState>
  >({})
  const [isCreatingToken, setIsCreatingToken] = useState<
    Record<string, boolean>
  >({})
  const [defaultTokenCreateContext, setDefaultTokenCreateContext] =
    useState<DefaultTokenCreateContext | null>(null)

  useEffect(() => {
    if (!isOpen) setSelectedTokenIdsBySite({})
  }, [isOpen])
  const creationControllers = useRef(new Map<string, AbortController>())
  const inventoryControllers = useRef(new Map<string, AbortController>())
  const currentCreationSource = useRef({ isOpen, displayById })
  useLayoutEffect(() => {
    const previous = currentCreationSource.current.displayById
    currentCreationSource.current = { isOpen, displayById }
    const changed = new Set(
      [...previous.keys()].filter(
        (id) =>
          accountKeySourceSignature(previous.get(id) ?? null) !==
          accountKeySourceSignature(displayById.get(id) ?? null),
      ),
    )
    if (!changed.size) return
    for (const id of changed) {
      creationControllers.current.get(id)?.abort()
      creationControllers.current.delete(id)
      inventoryControllers.current.get(id)?.abort()
      inventoryControllers.current.delete(id)
    }
    setIsCreatingToken((values) =>
      Object.fromEntries(
        Object.entries(values).filter(([id]) => !changed.has(id)),
      ),
    )
    setTokenInventories((values) =>
      Object.fromEntries(
        Object.entries(values).filter(([id]) => !changed.has(id)),
      ),
    )
    setDefaultTokenCreateContext((value) =>
      value && changed.has(value.siteId) ? null : value,
    )
  }, [isOpen, displayById])
  useLayoutEffect(() => {
    const controllers = creationControllers.current
    const inventories = inventoryControllers.current
    setIsCreatingToken({})
    setTokenInventories({})
    setDefaultTokenCreateContext(null)
    return () => {
      for (const controller of controllers.values()) controller.abort()
      controllers.clear()
      for (const controller of inventories.values()) controller.abort()
      inventories.clear()
    }
  }, [isOpen])

  const getTokenInventory = useCallback(
    (siteId: string): TokenInventoryState => {
      return (
        tokenInventories[siteId] ?? {
          status: KILO_CODE_INVENTORY_STATUSES.Idle,
          tokens: [],
        }
      )
    },
    [tokenInventories],
  )

  const loadTokensForSite = useCallback(
    async (
      siteId: string,
      options?: { created?: AccountKeyCreationResult },
    ) => {
      const site = displayById.get(siteId)
      if (!site || !currentCreationSource.current.isOpen) return false
      inventoryControllers.current.get(siteId)?.abort()
      const controller = new AbortController()
      inventoryControllers.current.set(siteId, controller)
      const isCurrent = () =>
        !controller.signal.aborted &&
        inventoryControllers.current.get(siteId) === controller &&
        currentCreationSource.current.isOpen &&
        accountKeySourceSignature(
          currentCreationSource.current.displayById.get(siteId) ?? null,
        ) === accountKeySourceSignature(site)

      setTokenInventories((prev) => ({
        ...prev,
        [siteId]: {
          status: KILO_CODE_INVENTORY_STATUSES.Loading,
          tokens: prev[siteId]?.tokens ?? [],
          errorMessage: undefined,
        },
      }))

      try {
        const createdKey = options?.created
          ? getCreatedAccountRuntimeKey(site, options.created)
          : null
        let tokens = await fetchDisplayAccountRuntimeKeys(site, {
          signal: controller.signal,
        }).catch((error) => {
          if (createdKey) return [createdKey]
          throw error
        })
        if (createdKey)
          tokens = appendOrReplaceAccountRuntimeKey(tokens, createdKey)
        if (!isCurrent()) return false
        if (!Array.isArray(tokens)) {
          setTokenInventories((prev) => ({
            ...prev,
            [siteId]: {
              status: KILO_CODE_INVENTORY_STATUSES.Error,
              tokens: [],
              errorMessage: t("ui:dialog.kiloCode.messages.loadTokensFailed"),
            },
          }))
          return false
        }

        const createdId = options?.created
          ? getCreatedAccountRuntimeKeyId(options.created)
          : null
        const missingCreatedKey = Boolean(
          options?.created && !tokens.some((key) => key.id === createdId),
        )

        setTokenInventories((prev) => ({
          ...prev,
          [siteId]: {
            status: missingCreatedKey
              ? KILO_CODE_INVENTORY_STATUSES.Error
              : KILO_CODE_INVENTORY_STATUSES.Loaded,
            tokens,
            errorMessage: missingCreatedKey
              ? t("ui:dialog.kiloCode.messages.createTokenFailed")
              : undefined,
          },
        }))

        // UX: default-select the first token (common case is "one token per site"),
        // and keep previous selections if they still exist after refresh.
        setSelectedTokenIdsBySite((prev) => {
          const created = tokens.find((key) => key.id === createdId)
          if (created)
            return {
              ...prev,
              [siteId]: [getAccountRuntimeKeyExportId(created)],
            }
          if (missingCreatedKey) return { ...prev, [siteId]: [] }

          const existingSelections = prev[siteId] ?? []
          const remainingSelections = existingSelections.filter((id) =>
            tokens.some((token) => getAccountRuntimeKeyExportId(token) === id),
          )
          if (remainingSelections.length > 0) {
            return { ...prev, [siteId]: remainingSelections }
          }

          const [firstToken] = tokens
          if (!firstToken) {
            if (!prev[siteId]) return prev
            const { [siteId]: _unused, ...rest } = prev
            return rest
          }

          return {
            ...prev,
            [siteId]: [getAccountRuntimeKeyExportId(firstToken)],
          }
        })
        return !missingCreatedKey
      } catch {
        if (!isCurrent()) return false
        setTokenInventories((prev) => ({
          ...prev,
          [siteId]: {
            status: KILO_CODE_INVENTORY_STATUSES.Error,
            tokens: [],
            errorMessage: t("ui:dialog.kiloCode.messages.loadTokensFailed"),
          },
        }))
        return false
      } finally {
        if (inventoryControllers.current.get(siteId) === controller)
          inventoryControllers.current.delete(siteId)
      }
    },
    [displayById, t],
  )

  const createDefaultTokenForSite = async (siteId: string) => {
    const site = displayById.get(siteId)
    const account = accountById.get(siteId)
    if (!site || !account) {
      toast.error(t("ui:dialog.kiloCode.messages.accountNotFound"))
      return
    }

    if (creationControllers.current.has(siteId)) return
    const controller = new AbortController()
    creationControllers.current.set(siteId, controller)
    const isCurrent = () =>
      !controller.signal.aborted &&
      currentCreationSource.current.isOpen &&
      accountKeySourceSignature(
        currentCreationSource.current.displayById.get(siteId) ?? null,
      ) === accountKeySourceSignature(site)
    const toastId = buildKiloCodeCreateTokenToastId(siteId)

    setIsCreatingToken((prev) => ({ ...prev, [siteId]: true }))
    setTokenInventories((prev) => ({
      ...prev,
      [siteId]: {
        status: KILO_CODE_INVENTORY_STATUSES.Loading,
        tokens: prev[siteId]?.tokens ?? [],
      },
    }))

    try {
      const ensured = await ensureAccountKey(site, {
        signal: controller.signal,
      })
      if (!isCurrent()) return
      if (ensured.kind === "input-required") {
        setDefaultTokenCreateContext({ siteId, account: site })
        setTokenInventories((prev) => ({
          ...prev,
          [siteId]: {
            status: KILO_CODE_INVENTORY_STATUSES.Loaded,
            tokens: prev[siteId]?.tokens ?? [],
          },
        }))
        return
      }
      const loaded = await loadTokensForSite(
        siteId,
        ensured.kind === "created" ? { created: ensured.creation } : undefined,
      )
      if (!isCurrent()) return
      if (!loaded) return
      toast.success(t("ui:dialog.kiloCode.messages.tokenCreated"), {
        id: toastId,
      })
    } catch {
      if (!isCurrent()) return
      toast.error(t("ui:dialog.kiloCode.messages.createTokenFailed"), {
        id: toastId,
      })
      setTokenInventories((prev) => ({
        ...prev,
        [siteId]: {
          status: KILO_CODE_INVENTORY_STATUSES.Error,
          tokens: prev[siteId]?.tokens ?? [],
          errorMessage: t("ui:dialog.kiloCode.messages.createTokenFailed"),
        },
      }))
    } finally {
      if (creationControllers.current.get(siteId) === controller) {
        creationControllers.current.delete(siteId)
        setIsCreatingToken((prev) => ({ ...prev, [siteId]: false }))
      }
    }
  }

  useEffect(() => {
    if (!isOpen) return
    if (selectedSiteIds.length === 0) return

    for (const siteId of selectedSiteIds) {
      const status =
        tokenInventories[siteId]?.status ?? KILO_CODE_INVENTORY_STATUSES.Idle
      if (status === KILO_CODE_INVENTORY_STATUSES.Idle) {
        void loadTokensForSite(siteId)
      }
    }
  }, [isOpen, loadTokensForSite, selectedSiteIds, tokenInventories])

  const handleCloseDefaultTokenCreateDialog = () => {
    setDefaultTokenCreateContext(null)
  }

  const handleDefaultTokenCreateSuccess = async (
    created: AccountKeyCreationResult,
  ) => {
    if (
      !defaultTokenCreateContext ||
      !currentCreationSource.current.isOpen ||
      accountKeySourceSignature(
        currentCreationSource.current.displayById.get(
          defaultTokenCreateContext.siteId,
        ) ?? null,
      ) !== accountKeySourceSignature(defaultTokenCreateContext.account)
    )
      return

    const { siteId } = defaultTokenCreateContext
    setDefaultTokenCreateContext(null)
    await loadTokensForSite(siteId, { created })
  }

  return {
    selectedTokenIdsBySite,
    setSelectedTokenIdsBySite,
    getTokenInventory,
    loadTokensForSite,
    createDefaultTokenForSite,
    isCreatingToken,
    defaultTokenCreateContext,
    handleCloseDefaultTokenCreateDialog,
    handleDefaultTokenCreateSuccess,
  }
}
