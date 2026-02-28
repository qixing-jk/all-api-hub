import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

import { useChannelDialogContext } from "~/components/ChannelDialog/context/ChannelDialogContext"
import { DIALOG_MODES, type DialogMode } from "~/constants/dialogModes"
import { AccountToken } from "~/entrypoints/options/pages/KeyManagement/type"
import { ensureAccountApiToken } from "~/services/accounts/accountOperations"
import { accountStorage } from "~/services/accounts/accountStorage"
import { getManagedSiteService } from "~/services/managedSites/managedSiteService"
import {
  AuthTypeEnum,
  SiteHealthStatus,
  type ApiToken,
  type DisplaySiteData,
  type SiteAccount,
} from "~/types"
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

  const createCredentialDisplaySiteData = (options: {
    name: string
    baseUrl: string
  }): DisplaySiteData => {
    return {
      id: `api-credential-profile:${options.name}`,
      name: options.name,
      username: "api-credential-profile",
      balance: { USD: 0, CNY: 0 },
      todayConsumption: { USD: 0, CNY: 0 },
      todayIncome: { USD: 0, CNY: 0 },
      todayTokens: { upload: 0, download: 0 },
      health: { status: SiteHealthStatus.Healthy },
      siteType: "default",
      baseUrl: options.baseUrl,
      token: "",
      userId: 0,
      authType: AuthTypeEnum.None,
      checkIn: {
        enableDetection: false,
      },
    }
  }

  const createCredentialApiToken = (options: {
    name: string
    apiKey: string
  }): ApiToken => {
    return {
      id: 0,
      user_id: 0,
      key: options.apiKey,
      status: 1,
      name: options.name,
      created_time: 0,
      accessed_time: 0,
      expired_time: 0,
      remain_quota: 0,
      unlimited_quota: true,
      used_quota: 0,
    }
  }

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
        formData.key,
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
   * Prepare and open channel dialog from raw API credentials (baseUrl + apiKey),
   * without requiring a SiteAccount entry in storage.
   */
  const openWithCredentials = async (
    credentials: { name: string; baseUrl: string; apiKey: string },
    onSuccess?: (result: any) => void,
  ) => {
    const toastId = toast.loading(
      t("messages:accountOperations.checkingApiKeys"),
    )

    try {
      const service = await getManagedSiteService()
      const managedConfig = await service.getConfig()
      if (!managedConfig) {
        toast.error(t(`messages:${service.messagesKey}.configMissing`), {
          id: toastId,
        })
        return
      }

      const displaySiteData = createCredentialDisplaySiteData({
        name: credentials.name,
        baseUrl: credentials.baseUrl,
      })
      const apiToken = createCredentialApiToken({
        name: credentials.name,
        apiKey: credentials.apiKey,
      })

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
        formData.key,
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

      openDialog({
        mode: DIALOG_MODES.ADD,
        initialValues: formData,
        initialModels: formData.models,
        initialGroups: formData.groups,
        onSuccess: (result) => {
          onSuccess?.(result)
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
    openWithCredentials,
    openWithCustom,
  }
}
