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
} from "~/services/productAnalytics/events"
import type {
  AccountKeyRepairInvalidToken,
  AccountKeyRepairProgress,
} from "~/types/accountKeyAutoProvisioning"

import { getInvalidTokenKey } from "./repairMissingKeysDialogHelpers"

const deleteInvalidKeysAnalyticsContext = {
  featureId: PRODUCT_ANALYTICS_FEATURE_IDS.KeyManagement,
  actionId: PRODUCT_ANALYTICS_ACTION_IDS.DeleteInvalidAccountTokens,
  surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsKeyManagementRepairDialog,
  entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
}

interface UseInvalidKeyDeletionOptions {
  invalidTokens: AccountKeyRepairInvalidToken[]
  filteredInvalidTokens: AccountKeyRepairInvalidToken[]
  setProgress: Dispatch<SetStateAction<AccountKeyRepairProgress | null>>
  t: TFunction
}

/**
 * Manages invalid-key selection, deletion, feedback, and delete analytics.
 */
export function useInvalidKeyDeletion({
  invalidTokens,
  filteredInvalidTokens,
  setProgress,
  t,
}: UseInvalidKeyDeletionOptions) {
  const [selectedInvalidTokenKeys, setSelectedInvalidTokenKeys] = useState<
    Set<string>
  >(() => new Set())
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false)
  const [isDeletingInvalidKeys, setIsDeletingInvalidKeys] = useState(false)
  const [deleteResultMessage, setDeleteResultMessage] = useState("")

  const selectedInvalidTokens = useMemo(() => {
    return filteredInvalidTokens.filter((token) =>
      selectedInvalidTokenKeys.has(getInvalidTokenKey(token)),
    )
  }, [filteredInvalidTokens, selectedInvalidTokenKeys])

  useEffect(() => {
    const currentInvalidTokenKeys = new Set(
      invalidTokens.map(getInvalidTokenKey),
    )
    setSelectedInvalidTokenKeys((previous) => {
      const next = new Set(
        [...previous].filter((key) => currentInvalidTokenKeys.has(key)),
      )
      return next.size === previous.size ? previous : next
    })
  }, [invalidTokens])

  useEffect(() => {
    if (isDeleteConfirmOpen && selectedInvalidTokens.length === 0) {
      setIsDeleteConfirmOpen(false)
    }
  }, [isDeleteConfirmOpen, selectedInvalidTokens.length])

  const resetInvalidKeyDeletionState = useCallback(() => {
    setSelectedInvalidTokenKeys(new Set())
    setIsDeleteConfirmOpen(false)
    setDeleteResultMessage("")
  }, [])

  const handleDeleteInvalidKeys = useCallback(async () => {
    const tokensToDelete = selectedInvalidTokens
    if (tokensToDelete.length === 0) {
      return
    }

    setIsDeletingInvalidKeys(true)
    setDeleteResultMessage("")
    void trackProductAnalyticsActionStarted(deleteInvalidKeysAnalyticsContext)
    try {
      const response = await sendAccountKeyRepairMessage(
        AccountKeyRepairMessageTypes.DeleteInvalidTokens,
        { tokens: tokensToDelete },
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
            itemCount: tokensToDelete.length,
            selectedCount: tokensToDelete.length,
            successCount: 0,
            failureCount: tokensToDelete.length,
            statusKind: PRODUCT_ANALYTICS_STATUS_KINDS.Error,
          },
        })
        return
      }

      const deletedKeys = new Set(response.data.deleted.map(getInvalidTokenKey))
      setSelectedInvalidTokenKeys((previous) => {
        const next = new Set(previous)
        for (const key of deletedKeys) {
          next.delete(key)
        }
        return next
      })
      setProgress((current) => {
        if (!current) return current

        let removedInvalidTokenCount = 0
        const nextResults = current.results.map((result) => {
          const nextInvalidTokens = result.invalidTokens?.filter((token) => {
            const shouldRemove = deletedKeys.has(getInvalidTokenKey(token))
            if (shouldRemove) {
              removedInvalidTokenCount += 1
            }
            return !shouldRemove
          })

          return {
            ...result,
            invalidTokens: nextInvalidTokens,
          }
        })

        return {
          ...current,
          summary: {
            ...current.summary,
            invalidKeys: Math.max(
              0,
              (current.summary.invalidKeys ?? 0) - removedInvalidTokenCount,
            ),
            deletedKeys:
              (current.summary.deletedKeys ?? 0) + response.data.deleted.length,
            deleteFailed:
              (current.summary.deleteFailed ?? 0) + response.data.failed.length,
          },
          results: nextResults,
        }
      })
      setDeleteResultMessage(
        response.data.failed.length > 0
          ? t("keyManagement:repairMissingKeys.invalidKeys.deletePartial", {
              deleted: response.data.deleted.length,
              failed: response.data.failed.length,
            })
          : t("keyManagement:repairMissingKeys.invalidKeys.deleteSuccess", {
              count: response.data.deleted.length,
            }),
      )
      setIsDeleteConfirmOpen(false)
      void trackProductAnalyticsActionCompleted({
        ...deleteInvalidKeysAnalyticsContext,
        result:
          response.data.failed.length > 0
            ? PRODUCT_ANALYTICS_RESULTS.Failure
            : PRODUCT_ANALYTICS_RESULTS.Success,
        insights: {
          itemCount: tokensToDelete.length,
          selectedCount: tokensToDelete.length,
          successCount: response.data.deleted.length,
          failureCount: response.data.failed.length,
          statusKind:
            response.data.failed.length > 0
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
          itemCount: tokensToDelete.length,
          selectedCount: tokensToDelete.length,
          successCount: 0,
          failureCount: tokensToDelete.length,
          statusKind: PRODUCT_ANALYTICS_STATUS_KINDS.Error,
        },
      })
    } finally {
      setIsDeletingInvalidKeys(false)
    }
  }, [selectedInvalidTokens, setProgress, t])

  return {
    deleteResultMessage,
    handleDeleteInvalidKeys,
    isDeleteConfirmOpen,
    isDeletingInvalidKeys,
    resetInvalidKeyDeletionState,
    selectedInvalidTokenKeys,
    selectedInvalidTokens,
    setIsDeleteConfirmOpen,
    setSelectedInvalidTokenKeys,
  }
}
