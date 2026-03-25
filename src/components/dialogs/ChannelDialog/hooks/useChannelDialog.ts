import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

import type { ChannelDialogAdvisoryWarning } from "~/components/dialogs/ChannelDialog/context/ChannelDialogContext"
import { useChannelDialogContext } from "~/components/dialogs/ChannelDialog/context/ChannelDialogContext"
import {
  buildChannelDialogAdvisoryWarning,
  CHANNEL_DIALOG_ADVISORY_WARNING_KINDS,
} from "~/components/dialogs/ChannelDialog/utils/advisoryWarning"
import { DIALOG_MODES, type DialogMode } from "~/constants/dialogModes"
import { ensureAccountApiToken } from "~/services/accounts/accountOperations"
import { accountStorage } from "~/services/accounts/accountStorage"
import { resolveDisplayAccountTokenForSecret } from "~/services/accounts/utils/apiServiceRequest"
import { toManagedSiteChannelAssessmentSignals } from "~/services/managedSites/channelAssessmentSignals"
import { getManagedSiteChannelExactMatch } from "~/services/managedSites/channelMatch"
import { resolveManagedSiteChannelMatch } from "~/services/managedSites/channelMatchResolver"
import {
  getManagedSiteService,
  type ManagedSiteConfig,
  type ManagedSiteService,
} from "~/services/managedSites/managedSiteService"
import {
  MANAGED_SITE_TOKEN_CHANNEL_STATUS_UNKNOWN_REASONS,
  MANAGED_SITE_TOKEN_CHANNEL_STATUSES,
  type ManagedSiteTokenChannelStatus,
} from "~/services/managedSites/tokenChannelStatus"
import {
  getManagedSiteConfigMissingMessage,
  supportsManagedSiteBaseUrlChannelLookup,
} from "~/services/managedSites/utils/managedSite"
import { toSanitizedErrorSummary } from "~/services/verification/aiApiVerification/utils"
import {
  AuthTypeEnum,
  SiteHealthStatus,
  type AccountToken,
  type ApiToken,
  type DisplaySiteData,
  type SiteAccount,
} from "~/types"
import type { ManagedSiteChannel } from "~/types/managedSite"
import { getErrorMessage } from "~/utils/core/error"
import { createLogger } from "~/utils/core/logger"

/**
 * Unified logger scoped to channel dialog open helpers.
 */
const logger = createLogger("ChannelDialogHook")

interface PrefilledChannelOpenOptions {
  managedSiteStatus?: ManagedSiteTokenChannelStatus
}

interface PrefilledDialogDuplicateState {
  existingChannelName: string | null
  advisoryWarning: ChannelDialogAdvisoryWarning | null
}

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

  const buildAdvisoryWarning = (
    kind:
      | typeof CHANNEL_DIALOG_ADVISORY_WARNING_KINDS.REVIEW_SUGGESTED
      | typeof CHANNEL_DIALOG_ADVISORY_WARNING_KINDS.VERIFICATION_REQUIRED,
    options?: {
      assessment?: ChannelDialogAdvisoryWarning["assessment"]
    },
  ): ChannelDialogAdvisoryWarning =>
    buildChannelDialogAdvisoryWarning(t, kind, options)

  const buildAdvisoryWarningFromManagedSiteStatus = (
    managedSiteStatus?: ManagedSiteTokenChannelStatus,
  ): ChannelDialogAdvisoryWarning | null => {
    if (!managedSiteStatus) {
      return null
    }

    if (
      managedSiteStatus.status ===
        MANAGED_SITE_TOKEN_CHANNEL_STATUSES.UNKNOWN &&
      managedSiteStatus.reason ===
        MANAGED_SITE_TOKEN_CHANNEL_STATUS_UNKNOWN_REASONS.EXACT_VERIFICATION_UNAVAILABLE &&
      managedSiteStatus.assessment?.url.matched
    ) {
      return buildAdvisoryWarning(
        CHANNEL_DIALOG_ADVISORY_WARNING_KINDS.VERIFICATION_REQUIRED,
        {
          assessment: managedSiteStatus.assessment,
        },
      )
    }

    if (
      managedSiteStatus.status ===
        MANAGED_SITE_TOKEN_CHANNEL_STATUSES.UNKNOWN &&
      managedSiteStatus.reason ===
        MANAGED_SITE_TOKEN_CHANNEL_STATUS_UNKNOWN_REASONS.MATCH_REQUIRES_CONFIRMATION
    ) {
      return buildAdvisoryWarning(
        CHANNEL_DIALOG_ADVISORY_WARNING_KINDS.REVIEW_SUGGESTED,
        {
          assessment: managedSiteStatus.assessment,
        },
      )
    }

    return null
  }

  const resolvePrefilledDialogDuplicateState = async (params: {
    service: ManagedSiteService
    managedConfig: ManagedSiteConfig
    accountBaseUrl: string
    models: string[]
    key?: string
    managedSiteStatus?: ManagedSiteTokenChannelStatus
  }): Promise<PrefilledDialogDuplicateState> => {
    if (params.managedSiteStatus) {
      if (
        params.managedSiteStatus.status ===
        MANAGED_SITE_TOKEN_CHANNEL_STATUSES.ADDED
      ) {
        return {
          existingChannelName: params.managedSiteStatus.matchedChannel.name,
          advisoryWarning: null,
        }
      }

      return {
        existingChannelName: null,
        advisoryWarning: buildAdvisoryWarningFromManagedSiteStatus(
          params.managedSiteStatus,
        ),
      }
    }

    if (!supportsManagedSiteBaseUrlChannelLookup(params.service.siteType)) {
      return {
        existingChannelName: null,
        advisoryWarning: null,
      }
    }

    const resolution = await resolveManagedSiteChannelMatch({
      service: params.service,
      managedConfig: params.managedConfig,
      accountBaseUrl: params.accountBaseUrl,
      models: params.models,
      key: params.key,
    })
    const exactMatch = getManagedSiteChannelExactMatch(resolution)

    if (exactMatch) {
      return {
        existingChannelName: exactMatch.name,
        advisoryWarning: null,
      }
    }

    if (
      params.service.messagesKey === "newapi" &&
      resolution.searchCompleted &&
      resolution.url.matched &&
      !resolution.key.comparable
    ) {
      return {
        existingChannelName: null,
        advisoryWarning: buildAdvisoryWarning(
          CHANNEL_DIALOG_ADVISORY_WARNING_KINDS.VERIFICATION_REQUIRED,
          {
            assessment: toManagedSiteChannelAssessmentSignals(resolution),
          },
        ),
      }
    }

    if (
      resolution.searchCompleted &&
      (resolution.url.matched ||
        resolution.key.matched ||
        resolution.models.matched)
    ) {
      return {
        existingChannelName: null,
        advisoryWarning: buildAdvisoryWarning(
          CHANNEL_DIALOG_ADVISORY_WARNING_KINDS.REVIEW_SUGGESTED,
          {
            assessment: toManagedSiteChannelAssessmentSignals(resolution),
          },
        ),
      }
    }

    return {
      existingChannelName: null,
      advisoryWarning: null,
    }
  }

  /**
   * Prepare and open channel dialog with account data
   */
  const openWithAccount = async (
    account: DisplaySiteData | SiteAccount,
    accountToken: AccountToken | ApiToken | null,
    onSuccess?: (result: any) => void,
    options?: PrefilledChannelOpenOptions,
  ) => {
    const toastId = toast.loading(
      t("messages:accountOperations.checkingApiKeys"),
    )
    let displaySiteData: DisplaySiteData | null = null
    let secretsToRedact: string[] = []

    try {
      // Get full account if needed
      let siteAccount: SiteAccount

      if ("created_at" in account) {
        siteAccount = account
        displaySiteData =
          (await accountStorage.getDisplayDataById(account.id)) ??
          accountStorage.convertToDisplayData(account)
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
        toast.error(
          getManagedSiteConfigMissingMessage(t, service.messagesKey),
          {
            id: toastId,
          },
        )
        return
      }

      let apiToken = accountToken

      if (!apiToken) {
        // Ensure API token exists
        apiToken = await ensureAccountApiToken(
          siteAccount,
          displaySiteData,
          toastId,
        )
      }

      const resolvedToken = await resolveDisplayAccountTokenForSecret(
        displaySiteData,
        apiToken,
      )
      secretsToRedact = [
        apiToken.key,
        resolvedToken.key,
        managedConfig.token,
        displaySiteData.token,
        displaySiteData.cookieAuthSessionCookie,
      ].filter(Boolean) as string[]
      const formData = await service.prepareChannelFormData(
        displaySiteData,
        resolvedToken,
      )

      const duplicateState = await resolvePrefilledDialogDuplicateState({
        service,
        managedConfig,
        accountBaseUrl: formData.base_url,
        models: formData.models,
        key: formData.key,
        managedSiteStatus: options?.managedSiteStatus,
      })

      if (duplicateState.existingChannelName) {
        toast.dismiss(toastId)
        const shouldContinue = await requestDuplicateChannelWarning({
          existingChannelName: duplicateState.existingChannelName,
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
        showModelPrefillWarning: formData.modelPrefillFetchFailed === true,
        advisoryWarning: duplicateState.advisoryWarning,
        onSuccess: (result) => {
          if (onSuccess) {
            onSuccess(result)
          }
        },
      })
    } catch (error) {
      const diagnostic = toSanitizedErrorSummary(error, secretsToRedact)
      toast.error(
        t("messages:errors.operation.failed", {
          error: diagnostic || getErrorMessage(error),
        }),
        { id: toastId },
      )
      logger.error("Failed to prepare channel data", {
        accountId: displaySiteData?.id,
        diagnostic,
      })
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
    let secretsToRedact: string[] = []

    try {
      const service = await getManagedSiteService()
      const managedConfig = await service.getConfig()
      if (!managedConfig) {
        toast.error(
          getManagedSiteConfigMissingMessage(t, service.messagesKey),
          {
            id: toastId,
          },
        )
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
      secretsToRedact = [apiToken.key, managedConfig.token].filter(
        Boolean,
      ) as string[]

      const formData = await service.prepareChannelFormData(
        displaySiteData,
        apiToken,
      )

      const duplicateState = await resolvePrefilledDialogDuplicateState({
        service,
        managedConfig,
        accountBaseUrl: formData.base_url,
        models: formData.models,
        key: formData.key,
      })

      if (duplicateState.existingChannelName) {
        toast.dismiss(toastId)
        const shouldContinue = await requestDuplicateChannelWarning({
          existingChannelName: duplicateState.existingChannelName,
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
        showModelPrefillWarning: formData.modelPrefillFetchFailed === true,
        advisoryWarning: duplicateState.advisoryWarning,
        onSuccess: (result) => {
          onSuccess?.(result)
        },
      })
    } catch (error) {
      const diagnostic = toSanitizedErrorSummary(error, secretsToRedact)
      toast.error(
        t("messages:errors.operation.failed", {
          error: diagnostic || getErrorMessage(error),
        }),
        { id: toastId },
      )
      logger.error("Failed to prepare channel data", { diagnostic })
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
    advisoryWarning?: ChannelDialogAdvisoryWarning | null
    onRequestRealKey?: (options: {
      setKey: (key: string) => void
    }) => Promise<void>
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
