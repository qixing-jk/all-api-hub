import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

import { useChannelDialogContext } from "~/components/ChannelDialog/context/ChannelDialogContext"
import { DIALOG_MODES, type DialogMode } from "~/constants/dialogModes"
import { AccountToken } from "~/entrypoints/options/pages/KeyManagement/type"
import { ensureAccountApiToken } from "~/services/accountOperations"
import { accountStorage } from "~/services/accountStorage"
import { getManagedSiteService } from "~/services/managedSiteService"
import type { ApiToken, DisplaySiteData, SiteAccount } from "~/types"
import type { ManagedSiteChannel } from "~/types/managedSite"
import { getErrorMessage } from "~/utils/error"
import { createLogger } from "~/utils/logger"

/**
 * Unified logger scoped to channel dialog open helpers.
 */
const logger = createLogger("ChannelDialogHook")

/**
 * Hook to easily trigger channel creation dialog from anywhere
 */
export function useChannelDialog() {
  const { t } = useTranslation(["messages", "channelDialog"])
  const { openDialog, requestDuplicateChannelWarning } =
    useChannelDialogContext()

  /**
   * Prepare and open channel dialog with account data
   */
  const openWithAccount = async (
    account: DisplaySiteData | SiteAccount,
    accoutToken: AccountToken | ApiToken | null,
    onSuccess?: (result: any) => void,
  ) => {
    const toastId = toast.loading(
      t("messages:accountOperations.checkingApiKeys"),
    )

    try {
      // Get full account if needed
      let siteAccount: SiteAccount
      let displaySiteData: DisplaySiteData

      if ("created_at" in account) {
        siteAccount = account
        displaySiteData = accountStorage.convertToDisplayData(
          account,
        ) as DisplaySiteData
      } else {
        displaySiteData = account
        const fetchedAccount = await accountStorage.getAccountById(account.id)
        if (!fetchedAccount) {
          throw new Error(t("messages:toast.error.findAccountDetailsFailed"))
        }
        siteAccount = fetchedAccount
      }

      const service = await getManagedSiteService()
      const managedConfig = await service.getConfig()
      if (!managedConfig) {
        toast.error(t(`messages:${service.messagesKey}.configMissing`), {
          id: toastId,
        })
        return
      }

      let apiToken = accoutToken

      if (!apiToken) {
        // Ensure API token exists
        apiToken = await ensureAccountApiToken(
          siteAccount,
          displaySiteData,
          toastId,
        )
      }

      const formData = await service.prepareChannelFormData(
        displaySiteData,
        apiToken,
      )

      const existingChannel = await service.findMatchingChannel(
        managedConfig.baseUrl,
        managedConfig.token,
        managedConfig.userId,
        displaySiteData.baseUrl,
        formData.models,
      )

      if (existingChannel) {
        toast.dismiss(toastId)
        const shouldContinue = await requestDuplicateChannelWarning({
          existingChannelName: existingChannel.name,
        })
        if (!shouldContinue) {
          return
        }
      } else {
        toast.dismiss(toastId)
      }

      // Open dialog
      openDialog({
        mode: DIALOG_MODES.ADD,
        initialValues: formData,
        initialModels: formData.models,
        initialGroups: formData.groups,
        onSuccess: (result) => {
          if (onSuccess) {
            onSuccess(result)
          }
        },
      })
    } catch (error) {
      toast.error(
        t("messages:errors.operation.failed", {
          error: getErrorMessage(error),
        }),
        { id: toastId },
      )
      logger.error("Failed to prepare channel data", error)
    }
  }

  /**
   * Open dialog with custom initial values
   */
  const openWithCustom = async (options: {
    mode?: DialogMode
    channel?: ManagedSiteChannel
    initialValues?: any
    initialModels?: string[]
    initialGroups?: string[]
    onSuccess?: (channel: any) => void
  }) => {
    openDialog(options)
  }

  return {
    openWithAccount,
    openWithCustom,
  }
}
