import type { TFunction } from "i18next"
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react"

import {
  AccountKeyRepairMessageTypes,
  sendAccountKeyRepairMessage,
} from "~/services/accounts/accountKeyAutoProvisioning/messaging"
import {
  trackProductAnalyticsActionCompleted,
  trackProductAnalyticsActionStarted,
} from "~/services/productAnalytics/actions"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_STATUS_KINDS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/contracts"
import type {
  AccountKeyRepairInvalidResource,
  AccountKeyRepairProgress,
} from "~/types/accountKeyAutoProvisioning"
import { ACCOUNT_KEY_REPAIR_MUTATION_OUTCOMES } from "~/types/accountKeyAutoProvisioning"

import { getInvalidResourceKey } from "./repairMissingKeysDialogHelpers"

const deleteInvalidKeysAnalyticsContext = {
  featureId: PRODUCT_ANALYTICS_FEATURE_IDS.KeyManagement,
  actionId: PRODUCT_ANALYTICS_ACTION_IDS.DeleteInvalidAccountTokens,
  surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsKeyManagementRepairDialog,
  entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
}

interface UseInvalidKeyDeletionOptions {
  invalidResources: AccountKeyRepairInvalidResource[]
  setProgress: Dispatch<SetStateAction<AccountKeyRepairProgress | null>>
  t: TFunction
}

/** Manages invalid-resource selection, deletion, feedback, and analytics. */
export function useInvalidKeyDeletion({
  invalidResources,
  setProgress,
  t,
}: UseInvalidKeyDeletionOptions) {
  const [selectedInvalidResourceKeys, setSelectedInvalidResourceKeys] =
    useState<Set<string>>(() => new Set())
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false)
  const [isDeletingInvalidResources, setIsDeletingInvalidResources] =
    useState(false)
  const [deleteResultMessage, setDeleteResultMessage] = useState("")

  const selectedInvalidResources = useMemo(
    () =>
      invalidResources.filter((resource) =>
        selectedInvalidResourceKeys.has(getInvalidResourceKey(resource)),
      ),
    [invalidResources, selectedInvalidResourceKeys],
  )

  useEffect(() => {
    const currentKeys = new Set(invalidResources.map(getInvalidResourceKey))
    setSelectedInvalidResourceKeys((previous) => {
      const next = new Set([...previous].filter((key) => currentKeys.has(key)))
      return next.size === previous.size ? previous : next
    })
  }, [invalidResources])

  useEffect(() => {
    if (isDeleteConfirmOpen && selectedInvalidResources.length === 0) {
      setIsDeleteConfirmOpen(false)
    }
  }, [isDeleteConfirmOpen, selectedInvalidResources.length])

  const resetInvalidResourceDeletionState = useCallback(() => {
    setSelectedInvalidResourceKeys(new Set())
    setIsDeleteConfirmOpen(false)
    setDeleteResultMessage("")
  }, [])

  const handleDeleteInvalidResources = useCallback(async () => {
    if (isDeletingInvalidResources) return
    const resourcesToDelete = selectedInvalidResources
    if (resourcesToDelete.length === 0) return

    setIsDeletingInvalidResources(true)
    setDeleteResultMessage("")
    void trackProductAnalyticsActionStarted(deleteInvalidKeysAnalyticsContext)
    try {
      const response = await sendAccountKeyRepairMessage(
        AccountKeyRepairMessageTypes.DeleteInvalidResources,
        { resources: resourcesToDelete },
      )

      if (!response?.success || !response.data) {
        setDeleteResultMessage(
          t("keyManagement:repairMissingKeys.invalidKeys.deleteFailed"),
        )
        setIsDeleteConfirmOpen(false)
        void trackProductAnalyticsActionCompleted({
          ...deleteInvalidKeysAnalyticsContext,
          result: PRODUCT_ANALYTICS_RESULTS.Failure,
          errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
          insights: {
            itemCount: resourcesToDelete.length,
            selectedCount: resourcesToDelete.length,
            successCount: 0,
            failureCount: resourcesToDelete.length,
            statusKind: PRODUCT_ANALYTICS_STATUS_KINDS.Error,
          },
        })
        return
      }

      const appliedResults = response.data.results.filter(
        ({ outcome }) =>
          outcome === ACCOUNT_KEY_REPAIR_MUTATION_OUTCOMES.Applied,
      )
      const rejectedCount = response.data.results.filter(
        ({ outcome }) =>
          outcome === ACCOUNT_KEY_REPAIR_MUTATION_OUTCOMES.Rejected,
      ).length
      const uncertainCount = response.data.results.filter(
        ({ outcome }) =>
          outcome === ACCOUNT_KEY_REPAIR_MUTATION_OUTCOMES.Uncertain,
      ).length
      const appliedKeys = new Set(
        appliedResults.map(({ resource }) => getInvalidResourceKey(resource)),
      )

      setSelectedInvalidResourceKeys((previous) => {
        const next = new Set(previous)
        for (const key of appliedKeys) next.delete(key)
        return next
      })
      setProgress((current) => {
        if (!current) return current

        let removedInvalidResourceCount = 0
        const nextResults = current.results.map((result) => {
          const nextInvalidResources = result.invalidResources.filter(
            (resource) => {
              const shouldRemove = appliedKeys.has(
                getInvalidResourceKey(resource),
              )
              if (shouldRemove) removedInvalidResourceCount += 1
              return !shouldRemove
            },
          )
          return { ...result, invalidResources: nextInvalidResources }
        })

        return {
          ...current,
          summary: {
            ...current.summary,
            invalidResources: Math.max(
              0,
              current.summary.invalidResources - removedInvalidResourceCount,
            ),
          },
          results: nextResults,
        }
      })

      const nonAppliedCount = rejectedCount + uncertainCount
      setDeleteResultMessage(
        nonAppliedCount > 0
          ? t(
              "keyManagement:repairMissingKeys.invalidKeys.deleteNeedsAttention",
              {
                applied: appliedResults.length,
                rejected: rejectedCount,
                uncertain: uncertainCount,
              },
            )
          : t("keyManagement:repairMissingKeys.invalidKeys.deleteSuccess", {
              count: appliedResults.length,
            }),
      )
      setIsDeleteConfirmOpen(false)
      void trackProductAnalyticsActionCompleted({
        ...deleteInvalidKeysAnalyticsContext,
        result:
          nonAppliedCount > 0
            ? PRODUCT_ANALYTICS_RESULTS.Failure
            : PRODUCT_ANALYTICS_RESULTS.Success,
        insights: {
          itemCount: resourcesToDelete.length,
          selectedCount: resourcesToDelete.length,
          successCount: appliedResults.length,
          failureCount: nonAppliedCount,
          statusKind:
            nonAppliedCount > 0
              ? PRODUCT_ANALYTICS_STATUS_KINDS.Warning
              : PRODUCT_ANALYTICS_STATUS_KINDS.Healthy,
        },
      })
    } catch {
      setDeleteResultMessage(
        t("keyManagement:repairMissingKeys.invalidKeys.deleteFailed"),
      )
      setIsDeleteConfirmOpen(false)
      void trackProductAnalyticsActionCompleted({
        ...deleteInvalidKeysAnalyticsContext,
        result: PRODUCT_ANALYTICS_RESULTS.Failure,
        errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
        insights: {
          itemCount: resourcesToDelete.length,
          selectedCount: resourcesToDelete.length,
          successCount: 0,
          failureCount: resourcesToDelete.length,
          statusKind: PRODUCT_ANALYTICS_STATUS_KINDS.Error,
        },
      })
    } finally {
      setIsDeletingInvalidResources(false)
    }
  }, [isDeletingInvalidResources, selectedInvalidResources, setProgress, t])

  return {
    deleteResultMessage,
    handleDeleteInvalidResources,
    isDeleteConfirmOpen,
    isDeletingInvalidResources,
    resetInvalidResourceDeletionState,
    selectedInvalidResourceKeys,
    selectedInvalidResources,
    setIsDeleteConfirmOpen,
    setSelectedInvalidResourceKeys,
  }
}
