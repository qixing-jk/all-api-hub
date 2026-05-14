import { useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

import { DestructiveConfirmDialog } from "~/components/ui"
import { accountStorage } from "~/services/accounts/accountStorage"
import { startProductAnalyticsAction } from "~/services/productAnalytics/actions"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/events"
import type { DisplaySiteData } from "~/types"
import { createLogger } from "~/utils/core/logger"

import { AccountInfo } from "./AccountInfo"

/**
 * Logger scoped to account deletion flows so unexpected failures can be inspected without leaking secrets.
 */
const logger = createLogger("DelAccountDialog")
type DeleteAccountTracker = ReturnType<typeof startProductAnalyticsAction>

interface DelAccountDialogProps {
  isOpen: boolean
  onClose: () => void
  account: DisplaySiteData | null
  onDeleted: () => void
}

/**
 * Confirmation dialog for deleting an account, combining warning copy and action buttons.
 */
export default function DelAccountDialog({
  isOpen,
  onClose,
  account,
  onDeleted,
}: DelAccountDialogProps) {
  const { t } = useTranslation(["ui", "messages", "common"])
  const [isDeleting, setIsDeleting] = useState(false)

  const handleDelete = async () => {
    if (!account) return

    let tracker: DeleteAccountTracker | null = null
    try {
      tracker = startProductAnalyticsAction({
        featureId: PRODUCT_ANALYTICS_FEATURE_IDS.AccountManagement,
        actionId: PRODUCT_ANALYTICS_ACTION_IDS.DeleteAccount,
        surfaceId:
          PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAccountManagementRowActions,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
      })
    } catch (error) {
      logger.warn("Failed to start product analytics action", error)
    }
    const completeDeleteAnalytics = async (
      result: (typeof PRODUCT_ANALYTICS_RESULTS)[keyof typeof PRODUCT_ANALYTICS_RESULTS],
      options?: Parameters<DeleteAccountTracker["complete"]>[1],
    ) => {
      if (!tracker) return

      try {
        if (options) {
          await tracker.complete(result, options)
          return
        }

        await tracker.complete(result)
      } catch (error) {
        logger.warn("Failed to complete product analytics action", error)
      }
    }

    setIsDeleting(true)
    const deletePromise = accountStorage.deleteAccount(account.id)
    try {
      await toast.promise(deletePromise, {
        loading: t("ui:dialog.delete.deleting", { name: account.name }),
        success: (isSuccess) => {
          if (!isSuccess) {
            throw new Error(t("ui:dialog.delete.noResponse"))
          }
          onDeleted()
          onClose()
          return t("ui:dialog.delete.deleteSuccess", { name: account.name })
        },
        error: (err: Error) =>
          t("ui:dialog.delete.deleteFailed", {
            error: err.message || t("messages:errors.unknown"),
          }),
      })
      const isDeleted = await deletePromise
      if (isDeleted) {
        await completeDeleteAnalytics(PRODUCT_ANALYTICS_RESULTS.Success)
      } else {
        await completeDeleteAnalytics(PRODUCT_ANALYTICS_RESULTS.Failure, {
          errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
        })
      }
    } catch (error) {
      // toast.promise already handles showing the error toast
      logger.error("Failed to delete account", {
        error,
        accountId: account.id,
        accountName: account.name,
      })
      await completeDeleteAnalytics(PRODUCT_ANALYTICS_RESULTS.Failure, {
        errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
      })
    } finally {
      setIsDeleting(false)
    }
  }

  const handleClose = () => {
    if (!isDeleting) {
      onClose()
    }
  }

  return (
    <DestructiveConfirmDialog
      isOpen={isOpen}
      onClose={handleClose}
      title={t("ui:dialog.delete.title")}
      warningTitle={t("ui:dialog.delete.confirmDeletion")}
      description={t("ui:dialog.delete.warning", {
        accountName: account?.name ?? "",
      })}
      cancelLabel={t("common:actions.cancel")}
      confirmLabel={t("ui:dialog.delete.confirmDelete")}
      onConfirm={() => {
        void handleDelete()
      }}
      isWorking={isDeleting}
      details={account ? <AccountInfo account={account} /> : null}
    />
  )
}
