import { useCallback, useEffect, useRef, useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

import { DEFAULT_USER_GROUP_NAME } from "~/services/accounts/accountKeyAutoProvisioning/ensureDefaultToken"
import {
  canFetchAccountTokenGroups,
  canFetchAccountTokenModels,
} from "~/services/accounts/keyProductCapabilities"
import {
  createDisplayAccountApiContext,
  requireDisplayAccountKeyManagement,
} from "~/services/accounts/utils/apiServiceRequest"
import type { UserGroupInfo } from "~/services/accountTokens/tokenProvisioningModel"
import type { DisplaySiteData } from "~/types"
import { getErrorMessage } from "~/utils/core/error"
import { createLogger } from "~/utils/core/logger"

import { applyDefaultTokenCreateGroupSelection } from "../defaultTokenCreatePrefill"
import type { FormData } from "./useTokenForm"

/**
 * Unified logger scoped to Key Management token dialog bootstrap data loading.
 */
const logger = createLogger("TokenDataHook")

const EMPTY_USER_GROUPS: Record<string, UserGroupInfo> = {}

/**
 * Loads required user groups when the dialog opens and optional models on demand.
 * @param isOpen Whether dialog is visible.
 * @param currentAccount Currently selected account info.
 * @param setFormData Setter to update form state with defaults (e.g., group).
 * @returns Required group state plus isolated, on-demand model discovery state.
 */
export function useTokenData(
  isOpen: boolean,
  currentAccount: DisplaySiteData | undefined,
  setFormData: React.Dispatch<React.SetStateAction<FormData>>,
  allowedGroups?: string[],
) {
  const { t } = useTranslation("keyManagement")
  const [isLoading, setIsLoading] = useState(false)
  const [availableModels, setAvailableModels] = useState<string[]>([])
  const [groups, setGroups] = useState<Record<string, UserGroupInfo>>({})
  const [isModelsLoading, setIsModelsLoading] = useState(false)
  const [modelsLoaded, setModelsLoaded] = useState(false)
  const [modelLoadErrorMessage, setModelLoadErrorMessage] = useState<
    string | null
  >(null)
  const modelLoadGenerationRef = useRef(0)
  const activeModelLoadRef = useRef<{
    accountId: string
    promise: Promise<boolean>
  } | null>(null)
  const canFetchModels = currentAccount
    ? canFetchAccountTokenModels(currentAccount)
    : false

  const loadInitialData = useCallback(async () => {
    if (!currentAccount) return

    const canFetchGroups = canFetchAccountTokenGroups(currentAccount)
    if (!canFetchGroups) {
      setGroups((prev) =>
        Object.keys(prev).length > 0 ? EMPTY_USER_GROUPS : prev,
      )
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    try {
      const { keyManagement, request } =
        createDisplayAccountApiContext(currentAccount)
      const capability = requireDisplayAccountKeyManagement(
        currentAccount,
        keyManagement,
      )

      const groupsData = capability.userGroups
        ? await capability.userGroups.fetch(request)
        : EMPTY_USER_GROUPS

      const resolvedGroupsData = groupsData ?? EMPTY_USER_GROUPS

      setGroups(resolvedGroupsData)

      // Set default group (but keep existing selection when it's still valid).
      setFormData((prev) => {
        const currentGroup =
          typeof prev.group === "string" ? prev.group.trim() : ""

        const normalizedAllowedGroups = Array.isArray(allowedGroups)
          ? allowedGroups.map((group) => group.trim()).filter(Boolean)
          : []
        const hasAllowedGroups = normalizedAllowedGroups.length > 0
        const allowedGroupSet = new Set(normalizedAllowedGroups)

        const canValidateGroupMembership = canFetchGroups
        const isGroupEligible = (group: string) => {
          if (!group) return false
          if (canValidateGroupMembership && !resolvedGroupsData[group]) {
            return false
          }
          if (!hasAllowedGroups) return true
          return allowedGroupSet.has(group)
        }

        if (isGroupEligible(currentGroup)) {
          return prev
        }

        if (hasAllowedGroups) {
          if (!currentGroup) {
            return prev
          }

          if (
            allowedGroupSet.has(DEFAULT_USER_GROUP_NAME) &&
            (!canValidateGroupMembership ||
              resolvedGroupsData[DEFAULT_USER_GROUP_NAME])
          ) {
            return applyDefaultTokenCreateGroupSelection(
              prev,
              DEFAULT_USER_GROUP_NAME,
            )
          }

          const firstAllowedGroup = normalizedAllowedGroups.find(
            (group) => !canValidateGroupMembership || resolvedGroupsData[group],
          )

          return firstAllowedGroup
            ? applyDefaultTokenCreateGroupSelection(prev, firstAllowedGroup)
            : prev
        }

        if (resolvedGroupsData[DEFAULT_USER_GROUP_NAME]) {
          return applyDefaultTokenCreateGroupSelection(
            prev,
            DEFAULT_USER_GROUP_NAME,
          )
        }

        const firstGroup = Object.keys(resolvedGroupsData)[0]
        return firstGroup
          ? applyDefaultTokenCreateGroupSelection(prev, firstGroup)
          : prev
      })
    } catch (error) {
      logger.error("Failed to load initial data", error)
      toast.error(getErrorMessage(error) || t("dialog.loadDataFailed"))
    } finally {
      setIsLoading(false)
    }
  }, [allowedGroups, currentAccount, setFormData, t])

  const loadAvailableModels = useCallback(async (): Promise<boolean> => {
    if (!currentAccount || !canFetchModels) return false
    if (modelsLoaded) return true

    const activeLoad = activeModelLoadRef.current
    if (activeLoad?.accountId === currentAccount.id) {
      return await activeLoad.promise
    }

    const generation = ++modelLoadGenerationRef.current
    setIsModelsLoading(true)
    setModelLoadErrorMessage(null)

    const promise = (async () => {
      try {
        const { keyManagement, request } =
          createDisplayAccountApiContext(currentAccount)
        const models = await requireDisplayAccountKeyManagement(
          currentAccount,
          keyManagement,
        ).fetchAvailableModels(request)

        if (
          !Array.isArray(models) ||
          !models.every((model) => typeof model === "string")
        ) {
          throw new TypeError(t("dialog.loadDataFailed"))
        }
        if (models.length === 0) {
          throw new Error(t("dialog.noAvailableModels"))
        }

        if (generation !== modelLoadGenerationRef.current) return false
        setAvailableModels(models)
        setModelsLoaded(true)
        return true
      } catch (error) {
        if (generation !== modelLoadGenerationRef.current) return false

        logger.warn("Failed to load optional model restrictions", error)
        const upstreamReason = getErrorMessage(error).trim()
        const reason = upstreamReason || t("dialog.loadDataFailed")
        const message = t("dialog.modelLoadFailed", { reason })
        setAvailableModels([])
        setModelLoadErrorMessage(message)
        setFormData((prev) =>
          prev.modelLimitsEnabled && prev.modelLimits.length === 0
            ? { ...prev, modelLimitsEnabled: false }
            : prev,
        )
        toast.error(message)
        return false
      } finally {
        if (generation === modelLoadGenerationRef.current) {
          setIsModelsLoading(false)
        }
      }
    })()

    activeModelLoadRef.current = {
      accountId: currentAccount.id,
      promise,
    }

    try {
      return await promise
    } finally {
      if (activeModelLoadRef.current?.promise === promise) {
        activeModelLoadRef.current = null
      }
    }
  }, [canFetchModels, currentAccount, modelsLoaded, setFormData, t])

  useEffect(() => {
    modelLoadGenerationRef.current += 1
    activeModelLoadRef.current = null
    setAvailableModels([])
    setIsModelsLoading(false)
    setModelsLoaded(false)
    setModelLoadErrorMessage(null)
  }, [currentAccount?.id])

  useEffect(() => {
    if (isOpen && currentAccount) {
      loadInitialData()
    }
  }, [isOpen, currentAccount, loadInitialData])

  const resetData = () => {
    modelLoadGenerationRef.current += 1
    activeModelLoadRef.current = null
    setAvailableModels([])
    setGroups({})
    setIsModelsLoading(false)
    setModelsLoaded(false)
    setModelLoadErrorMessage(null)
  }

  return {
    isLoading,
    availableModels,
    groups,
    canFetchModels,
    isModelsLoading,
    modelsLoaded,
    modelLoadErrorMessage,
    loadAvailableModels,
    resetData,
  }
}
