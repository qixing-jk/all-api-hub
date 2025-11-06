import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

import { AccountToken } from "~/entrypoints/options/pages/KeyManagement/type.ts"
import { useChannelDialogContext } from "~/features/ChannelManagement"
import { ensureAccountApiToken } from "~/services/accountOperations.ts"
import { accountStorage } from "~/services/accountStorage"
import {
  findMatchingChannel,
  getNewApiConfig,
  prepareChannelFormData
} from "~/services/newApiService"
import type { ApiToken, DisplaySiteData, SiteAccount } from "~/types"
import { getErrorMessage } from "~/utils/error"

/**
 * Hook to easily trigger channel creation dialog from anywhere
 */
export function useChannelDialog() {
  const { t } = useTranslation(["messages", "channelDialog"])
  const { openDialog } = useChannelDialogContext()

  /**
   * Prepare and open channel dialog with account data
   */
  const openWithAccount = async (
    account: DisplaySiteData | SiteAccount,
    accoutToken: AccountToken | ApiToken | null,
    onSuccess?: (result: any) => void
  ) => {
    const toastId = toast.loading(
      t("messages:accountOperations.checkingApiKeys")
    )

    try {
      // Get full account if needed
      let siteAccount: SiteAccount
      let displaySiteData: DisplaySiteData

      if ("created_at" in account) {
        siteAccount = account
        displaySiteData = accountStorage.convertToDisplayData(
          account
        ) as DisplaySiteData
      } else {
        displaySiteData = account
        const fetchedAccount = await accountStorage.getAccountById(account.id)
        if (!fetchedAccount) {
          throw new Error(t("messages:toast.error.findAccountDetailsFailed"))
        }
        siteAccount = fetchedAccount
      }

      // Get New API config
      const newApiConfig = await getNewApiConfig()
      if (!newApiConfig) {
        toast.error(t("messages:newapi.configMissing"), { id: toastId })
        return
      }

      let apiToken = accoutToken

      if (!apiToken) {
        // Ensure API token exists
        apiToken = await ensureAccountApiToken(
          siteAccount,
          displaySiteData,
          toastId
        )
      }

      // Prepare form defaults
      const formData = await prepareChannelFormData(displaySiteData, apiToken)

      // Check for existing channel
      const existingChannel = await findMatchingChannel(
        newApiConfig.baseUrl,
        newApiConfig.token,
        newApiConfig.userId,
        displaySiteData.baseUrl,
        formData.models
      )

      if (existingChannel) {
        toast.error(
          t("messages:newapi.channelExists", {
            channelName: existingChannel.name
          }),
          { id: toastId }
        )
        return
      }

      toast.dismiss(toastId)

      // Open dialog
      openDialog({
        mode: "add",
        initialValues: formData,
        initialModels: formData.models,
        initialGroups: formData.groups,
        onSuccess: (result) => {
          if (onSuccess) {
            onSuccess(result)
          }
        }
      })
    } catch (error) {
      toast.error(
        t("messages:errors.operation.failed", {
          error: getErrorMessage(error)
        }),
        { id: toastId }
      )
      console.error("[useChannelDialog] Failed to prepare channel data:", error)
    }
  }

  /**
   * Open dialog with custom initial values
   */
  const openWithCustom = (config: {
    mode?: "add" | "edit"
    initialValues?: any
    initialModels?: string[]
    initialGroups?: string[]
    onSuccess?: (result: any) => void
  }) => {
    openDialog(config)
  }

  return {
    openWithAccount,
    openWithCustom
  }
}
